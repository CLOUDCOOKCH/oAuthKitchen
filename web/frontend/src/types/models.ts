/**
 * Core data models for OAuthKitchen.
 *
 * These models represent the normalized entities collected from Microsoft Graph
 * and the computed analysis results.
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum CredentialType {
  PASSWORD = 'password',
  CERTIFICATE = 'certificate',
}

export enum ConsentType {
  ADMIN = 'admin',
  USER = 'user',
  UNKNOWN = 'unknown',
}

export enum PermissionType {
  DELEGATED = 'delegated',
  APPLICATION = 'application',
}

export enum RiskCategory {
  READ_ONLY = 'read_only',
  DATA_EXFILTRATION = 'data_exfiltration',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  TENANT_TAKEOVER = 'tenant_takeover',
  PERSISTENCE = 'persistence',
  LATERAL_MOVEMENT = 'lateral_movement',
  UNKNOWN = 'unknown',
}

export enum AppType {
  FIRST_PARTY_MICROSOFT = 'first_party_microsoft',
  TENANT_OWNED = 'tenant_owned',
  THIRD_PARTY_MULTI_TENANT = 'third_party_multi_tenant',
  EXTERNAL_UNKNOWN = 'external_unknown',
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface Credential {
  credentialId: string
  credentialType: CredentialType
  displayName: string | null
  startDatetime: Date | null
  endDatetime: Date | null
  keyId?: string | null
}

export interface Owner {
  objectId: string
  displayName: string | null
  userPrincipalName: string | null
  objectType: string
  isActive?: boolean | null
}

export interface PermissionDefinition {
  id: string
  value: string
  displayName: string | null
  description: string | null
  permissionType: PermissionType
  resourceAppId: string
  resourceDisplayName?: string | null

  // Enriched data from translator
  plainEnglish?: string | null
  riskCategory?: RiskCategory
  abuseScenarios?: string[]
  adminImpactNote?: string | null
  impactScore?: number
}

export interface OAuth2PermissionGrant {
  id: string
  clientId: string
  consentType: ConsentType
  principalId: string | null
  resourceId: string
  scope: string
  startTime?: Date | null
  expiryTime?: Date | null
}

export interface AppRoleAssignment {
  id: string
  appRoleId: string
  principalId: string
  principalType: string
  resourceId: string
  resourceDisplayName: string | null
  createdDatetime?: Date | null

  // Resolved role information
  roleValue?: string | null
  roleDisplayName?: string | null
}

export interface SignInActivity {
  lastSignInDatetime: Date | null
  lastNonInteractiveSignInDatetime: Date | null
  lastSuccessfulSignInDatetime: Date | null
  dataAvailable?: boolean
}

export interface Application {
  objectId: string
  appId: string
  displayName: string
  createdDatetime: Date | null

  // Publisher info
  publisherDomain?: string | null
  verifiedPublisher?: Record<string, unknown> | null

  // App configuration
  signInAudience?: string | null
  isMultiTenant?: boolean

  // Credentials
  passwordCredentials?: Credential[]
  keyCredentials?: Credential[]

  // Owners
  owners?: Owner[]

  // Defined permissions
  requiredResourceAccess?: Record<string, unknown>[]

  // Notes and tags
  notes?: string | null
  tags?: string[]
}

export interface ServicePrincipal {
  objectId: string
  appId: string
  displayName: string
  createdDatetime: Date | null

  // Type classification
  servicePrincipalType?: string | null
  appType?: AppType

  // Publisher info
  publisherName?: string | null
  verifiedPublisher?: Record<string, unknown> | null
  appOwnerOrganizationId?: string | null

  // Account settings
  accountEnabled?: boolean

  // Tags
  tags?: string[]

  // Owners
  owners?: Owner[]

  // Granted permissions
  oauth2PermissionGrants?: OAuth2PermissionGrant[]
  appRoleAssignments?: AppRoleAssignment[]

  // Sign-in activity
  signInActivity?: SignInActivity | null

  // Linked application object
  linkedApplication?: Application | null

  // Computed fields for analysis
  uniqueConsentingUsers?: Set<string>
}

export interface RiskFactor {
  name: string
  description: string
  score: number
  weight: number
  details?: string | null
}

export interface RiskScore {
  totalScore: number
  riskLevel: string
  factors?: RiskFactor[]
}

export interface ShadowOAuthFinding {
  findingType: string
  severity: string
  title: string
  description: string
  servicePrincipalId: string
  servicePrincipalName: string
  affectedScopes?: string[]
  affectedUserCount?: number
  recommendation?: string | null
}

export interface CredentialExpiryFinding {
  appId: string
  appName: string
  credentialType: CredentialType
  credentialName: string | null
  expiresInDays: number
  expiryDate: Date
  severity: string
}

export interface AnalysisResult {
  tenantId: string
  analysisTimestamp: Date
  mode: string

  // Collected entities
  applications?: Application[]
  servicePrincipals?: ServicePrincipal[]

  // Computed results
  riskScores?: Record<string, RiskScore>
  shadowFindings?: ShadowOAuthFinding[]
  credentialFindings?: CredentialExpiryFinding[]

  // Statistics
  totalApps?: number
  totalServicePrincipals?: number
  highRiskCount?: number
  criticalCount?: number
  appsWithoutOwners?: number
  expiringCredentials30Days?: number

  // Data availability flags
  signInDataAvailable?: boolean
  auditLogAvailable?: boolean
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getDaysUntilExpiry(cred: Credential): number | null {
  if (!cred.endDatetime) return null
  const now = new Date()
  const delta = cred.endDatetime.getTime() - now.getTime()
  return Math.floor(delta / (1000 * 60 * 60 * 24))
}

export function isCredentialExpired(cred: Credential): boolean {
  const days = getDaysUntilExpiry(cred)
  return days !== null && days < 0
}

export function getCredentialAgeDays(cred: Credential): number | null {
  if (!cred.startDatetime) return null
  const now = new Date()
  const delta = now.getTime() - cred.startDatetime.getTime()
  return Math.floor(delta / (1000 * 60 * 60 * 24))
}

export function getAllCredentials(app: Application): Credential[] {
  return [...(app.passwordCredentials || []), ...(app.keyCredentials || [])]
}

export function getAllDelegatedScopes(sp: ServicePrincipal): Set<string> {
  const scopes = new Set<string>()
  for (const grant of sp.oauth2PermissionGrants || []) {
    const parts = grant.scope.split(/\s+/).filter((s) => s.trim())
    parts.forEach((scope) => scopes.add(scope))
  }
  return scopes
}

export function getAllAppRoleValues(sp: ServicePrincipal): Set<string> {
  const roles = new Set<string>()
  for (const assignment of sp.appRoleAssignments || []) {
    if (assignment.roleValue) {
      roles.add(assignment.roleValue)
    }
  }
  return roles
}

export function hasVerifiedPublisher(app: Application): boolean {
  return !!(
    app.verifiedPublisher &&
    (app.verifiedPublisher as Record<string, unknown>)['verifiedPublisherId']
  )
}

export function spHasVerifiedPublisher(sp: ServicePrincipal): boolean {
  return !!(
    sp.verifiedPublisher &&
    (sp.verifiedPublisher as Record<string, unknown>)['verifiedPublisherId']
  )
}

export function getExpiringCredentials(app: Application): Array<[Credential, number]> {
  const result: Array<[Credential, number]> = []
  for (const cred of getAllCredentials(app)) {
    const days = getDaysUntilExpiry(cred)
    if (days !== null && days >= 0 && days <= 90) {
      result.push([cred, days])
    }
  }
  return result.sort((a, b) => a[1] - b[1])
}

export function daysSinceLastActivity(activity: SignInActivity): number | null {
  if (!activity) return null

  let latest: Date | null = null
  for (const dt of [
    activity.lastSignInDatetime,
    activity.lastNonInteractiveSignInDatetime,
    activity.lastSuccessfulSignInDatetime,
  ]) {
    if (dt && (!latest || dt.getTime() > latest.getTime())) {
      latest = dt
    }
  }

  if (!latest) return null
  const now = new Date()
  const delta = now.getTime() - latest.getTime()
  return Math.floor(delta / (1000 * 60 * 60 * 24))
}

export function getTopRiskyApps(
  result: AnalysisResult
): Array<[ServicePrincipal, RiskScore]> {
  const scored: Array<[ServicePrincipal, RiskScore]> = []
  for (const sp of result.servicePrincipals || []) {
    const score = result.riskScores?.[sp.objectId]
    if (score) {
      scored.push([sp, score])
    }
  }
  return scored
    .sort((a, b) => b[1].totalScore - a[1].totalScore)
    .slice(0, 10)
}

export function getConsentUserCount(sp: ServicePrincipal): number {
  return sp.uniqueConsentingUsers?.size || 0
}

export function hasDelegatedGrants(sp: ServicePrincipal): boolean {
  return (sp.oauth2PermissionGrants?.length || 0) > 0
}

export function hasApplicationPermissions(sp: ServicePrincipal): boolean {
  return (sp.appRoleAssignments?.length || 0) > 0
}

export function hasOwners(entity: { owners?: Owner[] }): boolean {
  return (entity.owners?.length || 0) > 0
}

export function isTenantOwned(sp: ServicePrincipal): boolean {
  return sp.appType === AppType.TENANT_OWNED
}
