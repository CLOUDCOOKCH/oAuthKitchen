/**
 * Risk Scorer — calculates 0–100 risk scores for OAuth service principals.
 *
 * Ported from src/oauthkitchen/analyzers/scoring.py
 */

import {
  type ServicePrincipal,
  type Application,
  type RiskScore,
  type RiskFactor,
  AppType,
  ConsentType,
  getAllDelegatedScopes,
  getAllAppRoleValues,
  spHasVerifiedPublisher,
  hasOwners,
  getAllCredentials,
  getDaysUntilExpiry,
  daysSinceLastActivity,
} from '@/types/models'
import { permissionTranslator } from '@/lib/analyzers/translator'

// ============================================================================
// SCORING WEIGHTS (mirrors config.py ScoringWeights)
// ============================================================================

export interface ScoringWeights {
  applicationPermissionMultiplier: number
  delegatedPermissionMultiplier: number
  userConsentWeight: number
  adminConsentWeight: number
  noVerifiedPublisherWeight: number
  externalMultiTenantWeight: number
  firstPartyMicrosoftWeight: number
  noOwnerWeight: number
  unusedHighPrivilegeWeight: number
  inactiveDaysThreshold: number
  credentialExpiryCriticalDays: number
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  applicationPermissionMultiplier: 1.5,
  delegatedPermissionMultiplier: 1.0,
  userConsentWeight: 1.2,
  adminConsentWeight: 1.0,
  noVerifiedPublisherWeight: 1.3,
  externalMultiTenantWeight: 1.2,
  firstPartyMicrosoftWeight: 0.3,
  noOwnerWeight: 1.3,
  unusedHighPrivilegeWeight: 1.4,
  inactiveDaysThreshold: 90,
  credentialExpiryCriticalDays: 7,
}

// ============================================================================
// HELPERS
// ============================================================================

export function getRiskLevel(score: number): string {
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

// ============================================================================
// RISK SCORER
// ============================================================================

export class RiskScorer {
  private weights: ScoringWeights

  constructor(weights: Partial<ScoringWeights> = {}) {
    this.weights = { ...DEFAULT_SCORING_WEIGHTS, ...weights }
  }

  scoreServicePrincipal(sp: ServicePrincipal): RiskScore {
    // Microsoft first-party apps are excluded
    if (sp.appType === AppType.FIRST_PARTY_MICROSOFT) {
      return {
        totalScore: 0,
        riskLevel: 'low',
        factors: [
          {
            name: 'First-party Microsoft',
            description: 'Microsoft first-party app — excluded from risk scoring',
            score: 0,
            weight: this.weights.firstPartyMicrosoftWeight,
          },
        ],
      }
    }

    const factors: RiskFactor[] = []
    factors.push(...this._scorePermissions(sp))
    factors.push(...this._scoreTrustFactors(sp))
    factors.push(...this._scoreOwnership(sp))
    factors.push(...this._scoreActivity(sp))
    if (sp.linkedApplication) {
      factors.push(...this._scoreCredentials(sp.linkedApplication))
    }

    // Weighted sum, soft-capped at 100
    let totalScore = 0
    for (const f of factors) {
      totalScore += f.score * f.weight
    }
    totalScore = Math.min(100, Math.round(totalScore))

    return {
      totalScore,
      riskLevel: getRiskLevel(totalScore),
      factors,
    }
  }

  scoreAll(principals: ServicePrincipal[]): Map<string, RiskScore> {
    const scores = new Map<string, RiskScore>()
    for (const sp of principals) {
      scores.set(sp.objectId, this.scoreServicePrincipal(sp))
    }
    return scores
  }

  // --------------------------------------------------------------------------
  // PRIVATE SCORING METHODS
  // --------------------------------------------------------------------------

  private _scorePermissions(sp: ServicePrincipal): RiskFactor[] {
    const factors: RiskFactor[] = []

    // Application permissions (non-delegated — highest risk)
    const appRoleValues = getAllAppRoleValues(sp)
    if (appRoleValues.size > 0) {
      let maxScore = 0
      for (const perm of appRoleValues) {
        const translated = permissionTranslator.translate(perm)
        maxScore = Math.max(maxScore, translated.impactScore)
      }

      if (maxScore > 0) {
        factors.push({
          name: 'Application permissions',
          description: `${appRoleValues.size} application permission(s) — no user required for access`,
          score: maxScore,
          weight: this.weights.applicationPermissionMultiplier,
          details: Array.from(appRoleValues).slice(0, 5).join(', '),
        })
      }
    }

    // Delegated permissions
    const delegatedScopes = getAllDelegatedScopes(sp)
    if (delegatedScopes.size > 0) {
      let maxScore = 0
      for (const scope of delegatedScopes) {
        const translated = permissionTranslator.translate(scope)
        maxScore = Math.max(maxScore, translated.impactScore)
      }

      if (maxScore > 0) {
        const hasUserConsent =
          sp.oauth2PermissionGrants?.some((g) => g.consentType === ConsentType.USER) || false
        const weight = hasUserConsent
          ? this.weights.userConsentWeight
          : this.weights.delegatedPermissionMultiplier

        factors.push({
          name: hasUserConsent
            ? 'User-consented delegated permissions'
            : 'Admin-consented delegated permissions',
          description: `${delegatedScopes.size} delegated permission(s) granted`,
          score: maxScore,
          weight,
          details: Array.from(delegatedScopes).slice(0, 5).join(', '),
        })
      }
    }

    return factors
  }

  private _scoreTrustFactors(sp: ServicePrincipal): RiskFactor[] {
    const factors: RiskFactor[] = []

    if (!spHasVerifiedPublisher(sp)) {
      factors.push({
        name: 'Unverified publisher',
        description: 'Application publisher is not verified by Microsoft',
        score: 20,
        weight: this.weights.noVerifiedPublisherWeight,
      })
    }

    if (
      sp.appType === AppType.THIRD_PARTY_MULTI_TENANT ||
      sp.appType === AppType.EXTERNAL_UNKNOWN
    ) {
      factors.push({
        name: 'External application',
        description: 'Application is from an external or unknown organization',
        score: 15,
        weight: this.weights.externalMultiTenantWeight,
      })
    }

    return factors
  }

  private _scoreOwnership(sp: ServicePrincipal): RiskFactor[] {
    const factors: RiskFactor[] = []

    if (!hasOwners(sp)) {
      factors.push({
        name: 'No owners (orphaned)',
        description: 'Application has no defined owners — accountability gap',
        score: 25,
        weight: this.weights.noOwnerWeight,
      })
    }

    return factors
  }

  private _scoreActivity(sp: ServicePrincipal): RiskFactor[] {
    const factors: RiskFactor[] = []

    if (sp.signInActivity) {
      const daysSince = daysSinceLastActivity(sp.signInActivity)
      if (daysSince !== null && daysSince > this.weights.inactiveDaysThreshold) {
        const hasPrivileges =
          getAllAppRoleValues(sp).size > 0 || getAllDelegatedScopes(sp).size > 0

        if (hasPrivileges) {
          factors.push({
            name: 'Inactive with high privileges',
            description: `App unused for ${daysSince} days but retains active permissions`,
            score: 30,
            weight: this.weights.unusedHighPrivilegeWeight,
            details: `Last activity: ${daysSince} days ago`,
          })
        }
      }
    }

    return factors
  }

  private _scoreCredentials(app: Application): RiskFactor[] {
    const factors: RiskFactor[] = []

    for (const cred of getAllCredentials(app)) {
      const days = getDaysUntilExpiry(cred)

      if (days !== null && days < 0) {
        factors.push({
          name: 'Expired credential',
          description: `Credential "${cred.displayName || 'unnamed'}" is expired`,
          score: 20,
          weight: 1.0,
        })
      } else if (days !== null && days <= this.weights.credentialExpiryCriticalDays) {
        factors.push({
          name: 'Credential expiring imminently',
          description: `Credential expires in ${days} day(s)`,
          score: 15,
          weight: 1.0,
        })
      }
    }

    return factors
  }
}

// Singleton instance
export const riskScorer = new RiskScorer()
