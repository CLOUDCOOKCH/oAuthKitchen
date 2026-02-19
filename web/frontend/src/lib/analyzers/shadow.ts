/**
 * Shadow OAuth Detector — finds risky OAuth exposure patterns.
 *
 * Ported from src/oauthkitchen/analyzers/shadow.py
 */

import {
  type ServicePrincipal,
  type ShadowOAuthFinding,
  AppType,
  ConsentType,
  getAllDelegatedScopes,
  getAllAppRoleValues,
  spHasVerifiedPublisher,
  hasOwners,
  daysSinceLastActivity,
} from '@/types/models'
import { permissionTranslator } from '@/lib/analyzers/translator'

// ============================================================================
// HIGH-IMPACT SCOPE LIST
// ============================================================================

const HIGH_IMPACT_SCOPES = new Set([
  'Directory.ReadWrite.All',
  'RoleManagement.ReadWrite.Directory',
  'Application.ReadWrite.All',
  'AppRoleAssignment.ReadWrite.All',
  'DelegatedPermissionGrant.ReadWrite.All',
  'GroupMember.ReadWrite.All',
  'Group.ReadWrite.All',
  'Mail.ReadWrite',
  'Mail.Read',
  'Files.ReadWrite.All',
  'Sites.ReadWrite.All',
  'Sites.FullControl.All',
  'User.ReadWrite.All',
  'User.Read.All',
  'AuditLog.Read.All',
  'Policy.ReadWrite.All',
  'PrivilegedAccess.ReadWrite.AzureAD',
  'RoleAssignmentSchedule.ReadWrite.Directory',
  'EntitlementManagement.ReadWrite.All',
  'Chat.Read.All',
  'ChannelMessage.Read.All',
  'Team.ReadWrite.All',
  'DeviceManagementApps.ReadWrite.All',
  'DeviceManagementConfiguration.ReadWrite.All',
  'SecurityEvents.ReadWrite.All',
  'SecurityActions.ReadWrite.All',
  'ThreatIndicators.ReadWrite.OwnedBy',
  'AccessReview.ReadWrite.All',
  'ProgramControl.ReadWrite.All',
  'Reports.Read.All',
  'Calendars.ReadWrite',
  'Contacts.ReadWrite',
  'Tasks.ReadWrite',
  'MailboxSettings.ReadWrite',
  'OnlineMeetingRecording.Read.All',
])

// Score threshold above which a permission is considered high-impact
const HIGH_IMPACT_SCORE_THRESHOLD = 65

// ============================================================================
// HELPER
// ============================================================================

function isHighImpact(scope: string): boolean {
  // Check hardcoded list first, then fall back to translator score
  if (HIGH_IMPACT_SCOPES.has(scope)) return true
  const translated = permissionTranslator.translate(scope)
  return translated.impactScore >= HIGH_IMPACT_SCORE_THRESHOLD
}

function isExternal(sp: ServicePrincipal): boolean {
  return (
    sp.appType === AppType.THIRD_PARTY_MULTI_TENANT || sp.appType === AppType.EXTERNAL_UNKNOWN
  )
}

// ============================================================================
// SHADOW OAUTH DETECTOR
// ============================================================================

export class ShadowOAuthDetector {
  private includeRemediation: boolean
  private inactiveThresholdDays: number

  constructor(includeRemediation = false, inactiveThresholdDays = 90) {
    this.includeRemediation = includeRemediation
    this.inactiveThresholdDays = inactiveThresholdDays
  }

  detect(principals: ServicePrincipal[]): ShadowOAuthFinding[] {
    const findings: ShadowOAuthFinding[] = []

    for (const sp of principals) {
      // Skip Microsoft first-party apps
      if (sp.appType === AppType.FIRST_PARTY_MICROSOFT) continue

      findings.push(...this._detectExternalDelegatedHighImpact(sp))
      findings.push(...this._detectUserConsentHighImpact(sp))
      findings.push(...this._detectOfflineAccessRisk(sp))
      findings.push(...this._detectInactivePrivileged(sp))
      findings.push(...this._detectOrphanedPrivileged(sp))
      findings.push(...this._detectUnverifiedPublisherHighImpact(sp))
    }

    return findings
  }

  // --------------------------------------------------------------------------
  // DETECTION PATTERNS
  // --------------------------------------------------------------------------

  private _detectExternalDelegatedHighImpact(sp: ServicePrincipal): ShadowOAuthFinding[] {
    if (!isExternal(sp)) return []

    const delegatedScopes = getAllDelegatedScopes(sp)
    const highImpactFound = Array.from(delegatedScopes).filter(isHighImpact)
    if (highImpactFound.length === 0) return []

    const userCount =
      new Set(
        (sp.oauth2PermissionGrants || [])
          .filter((g) => g.principalId)
          .map((g) => g.principalId as string)
      ).size

    return [
      {
        findingType: 'external_delegated_high_impact',
        severity: 'critical',
        title: 'External app with high-impact delegated permissions',
        description:
          `"${sp.displayName}" is an external/third-party app with ${highImpactFound.length} ` +
          `high-impact delegated permission(s) granted by ${userCount} user(s). ` +
          `This creates an exfiltration risk for data accessible to those users.`,
        servicePrincipalId: sp.objectId,
        servicePrincipalName: sp.displayName,
        affectedScopes: highImpactFound,
        affectedUserCount: userCount,
        recommendation: this.includeRemediation
          ? 'Review whether this app needs these permissions. Consider restricting via Conditional Access or revoking user consent.'
          : null,
      },
    ]
  }

  private _detectUserConsentHighImpact(sp: ServicePrincipal): ShadowOAuthFinding[] {
    const userConsentGrants = (sp.oauth2PermissionGrants || []).filter(
      (g) => g.consentType === ConsentType.USER && g.principalId
    )
    if (userConsentGrants.length === 0) return []

    const userConsentScopes = new Set<string>()
    for (const grant of userConsentGrants) {
      grant.scope
        .split(/\s+/)
        .filter((s) => s.trim())
        .forEach((s) => userConsentScopes.add(s))
    }

    const highImpactFound = Array.from(userConsentScopes).filter(isHighImpact)
    if (highImpactFound.length === 0) return []

    const userCount = new Set(userConsentGrants.map((g) => g.principalId as string)).size

    return [
      {
        findingType: 'user_consent_high_impact',
        severity: 'high',
        title: 'User-consented high-impact permissions',
        description:
          `"${sp.displayName}" has high-impact permissions granted via individual user consent ` +
          `(${userCount} user(s)). These were not reviewed by an administrator and may violate ` +
          `security policies.`,
        servicePrincipalId: sp.objectId,
        servicePrincipalName: sp.displayName,
        affectedScopes: highImpactFound,
        affectedUserCount: userCount,
        recommendation: this.includeRemediation
          ? 'Revoke user-consented grants and replace with admin-consented grants after review. Enable admin consent requirement in Azure AD.'
          : null,
      },
    ]
  }

  private _detectOfflineAccessRisk(sp: ServicePrincipal): ShadowOAuthFinding[] {
    const allScopes = getAllDelegatedScopes(sp)
    if (!allScopes.has('offline_access') && !allScopes.has('offline.access')) return []

    const highImpactFound = Array.from(allScopes).filter((s) => s !== 'offline_access' && isHighImpact(s))
    if (highImpactFound.length === 0) return []

    const userCount = new Set(
      (sp.oauth2PermissionGrants || [])
        .filter((g) => g.principalId)
        .map((g) => g.principalId as string)
    ).size

    return [
      {
        findingType: 'offline_access_risk',
        severity: 'high',
        title: 'Long-lived token risk via offline_access',
        description:
          `"${sp.displayName}" has offline_access combined with ${highImpactFound.length} ` +
          `high-impact scope(s). This allows the app to access data indefinitely via refresh tokens, ` +
          `even after the user's session ends.`,
        servicePrincipalId: sp.objectId,
        servicePrincipalName: sp.displayName,
        affectedScopes: ['offline_access', ...highImpactFound],
        affectedUserCount: userCount,
        recommendation: this.includeRemediation
          ? 'Review whether persistent offline access is necessary. Consider implementing token lifetime policies.'
          : null,
      },
    ]
  }

  private _detectInactivePrivileged(sp: ServicePrincipal): ShadowOAuthFinding[] {
    if (!sp.signInActivity) return []

    const daysSince = daysSinceLastActivity(sp.signInActivity)
    if (daysSince === null || daysSince < this.inactiveThresholdDays) return []

    const appRoles = getAllAppRoleValues(sp)
    const delegatedScopes = getAllDelegatedScopes(sp)
    const highImpactRoles = Array.from(appRoles).filter(isHighImpact)
    const highImpactScopes = Array.from(delegatedScopes).filter(isHighImpact)
    const allHighImpact = [...highImpactRoles, ...highImpactScopes]

    if (allHighImpact.length === 0) return []

    return [
      {
        findingType: 'inactive_privileged',
        severity: 'medium',
        title: 'Inactive app retaining high-impact permissions',
        description:
          `"${sp.displayName}" has not been used for ${daysSince} days ` +
          `but still holds ${allHighImpact.length} high-impact permission(s). ` +
          `Stale high-privilege apps increase attack surface unnecessarily.`,
        servicePrincipalId: sp.objectId,
        servicePrincipalName: sp.displayName,
        affectedScopes: allHighImpact,
        recommendation: this.includeRemediation
          ? 'Disable or remove this application if it is no longer in use. Otherwise, review and reduce permissions to minimum required.'
          : null,
      },
    ]
  }

  private _detectOrphanedPrivileged(sp: ServicePrincipal): ShadowOAuthFinding[] {
    if (hasOwners(sp)) return []

    const appRoles = getAllAppRoleValues(sp)
    const delegatedScopes = getAllDelegatedScopes(sp)
    const allHighImpact = [
      ...Array.from(appRoles).filter(isHighImpact),
      ...Array.from(delegatedScopes).filter(isHighImpact),
    ]

    if (allHighImpact.length === 0) return []

    return [
      {
        findingType: 'orphaned_privileged',
        severity: 'high',
        title: 'Orphaned app with high-impact permissions',
        description:
          `"${sp.displayName}" has no defined owners but holds ${allHighImpact.length} ` +
          `high-impact permission(s). Without owners, there is no clear accountability for ` +
          `this application's access.`,
        servicePrincipalId: sp.objectId,
        servicePrincipalName: sp.displayName,
        affectedScopes: allHighImpact,
        recommendation: this.includeRemediation
          ? 'Assign at least one owner to this application. If the owning team is unknown, escalate to your security team for review.'
          : null,
      },
    ]
  }

  private _detectUnverifiedPublisherHighImpact(sp: ServicePrincipal): ShadowOAuthFinding[] {
    if (spHasVerifiedPublisher(sp)) return []
    if (!isExternal(sp)) return []

    const appRoles = getAllAppRoleValues(sp)
    const delegatedScopes = getAllDelegatedScopes(sp)
    const allHighImpact = [
      ...Array.from(appRoles).filter(isHighImpact),
      ...Array.from(delegatedScopes).filter(isHighImpact),
    ]

    if (allHighImpact.length === 0) return []

    return [
      {
        findingType: 'unverified_publisher_high_impact',
        severity: 'high',
        title: 'Unverified publisher with high-impact permissions',
        description:
          `"${sp.displayName}" is published by an unverified publisher and has ` +
          `${allHighImpact.length} high-impact permission(s). Unverified publishers ` +
          `have not been validated by Microsoft.`,
        servicePrincipalId: sp.objectId,
        servicePrincipalName: sp.displayName,
        affectedScopes: allHighImpact,
        recommendation: this.includeRemediation
          ? 'Verify the publisher\'s identity through other means, or replace with a verified alternative. Consider revoking access until verification is complete.'
          : null,
      },
    ]
  }
}

// Singleton
export const shadowDetector = new ShadowOAuthDetector()
