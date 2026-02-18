/**
 * Configuration management for OAuthKitchen.
 *
 * Supports loading configuration from JSON and environment variables.
 */

// ============================================================================
// INTERFACES
// ============================================================================

export interface AuthConfig {
  tenantId: string
  clientId: string
  clientSecret?: string | null
  certificatePath?: string | null
  certificatePassword?: string | null
  useDeviceCode?: boolean
}

export interface ThresholdConfig {
  credentialExpiryCritical: number
  credentialExpiryHigh: number
  credentialExpiryMedium: number
  credentialExpiryLow: number
  inactiveDaysThreshold: number
  credentialAgeConcern: number
}

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
  scoreTenantTakeover: number
  scorePrivilegeEscalation: number
  scoreDataExfiltration: number
  scorePersistence: number
  scoreLateralMovement: number
  scoreReadOnly: number
  scoreUnknown: number
}

export interface OutputConfig {
  outputDirectory?: string
  formats?: string[]
  includeJson?: boolean
  includeRemediationSuggestions?: boolean
}

export interface AllowDenyConfig {
  allowedAppIds: string[]
  deniedAppIds: string[]
  trustedPublisherDomains: string[]
}

export interface Config {
  auth?: AuthConfig
  thresholds: ThresholdConfig
  scoring: ScoringWeights
  output?: OutputConfig
  allowDeny: AllowDenyConfig
  mode?: string
  enableCache?: boolean
  cacheTtlSeconds?: number
  logLevel?: string
  verbose?: boolean
}

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  tenantId: '',
  clientId: '',
  clientSecret: null,
  certificatePath: null,
  certificatePassword: null,
  useDeviceCode: false,
}

export const DEFAULT_THRESHOLD_CONFIG: ThresholdConfig = {
  credentialExpiryCritical: 7,
  credentialExpiryHigh: 30,
  credentialExpiryMedium: 60,
  credentialExpiryLow: 90,
  inactiveDaysThreshold: 90,
  credentialAgeConcern: 365,
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
  scoreTenantTakeover: 100,
  scorePrivilegeEscalation: 85,
  scoreDataExfiltration: 70,
  scorePersistence: 60,
  scoreLateralMovement: 50,
  scoreReadOnly: 20,
  scoreUnknown: 30,
}

export const DEFAULT_OUTPUT_CONFIG: OutputConfig = {
  outputDirectory: './oauthkitchen-output',
  formats: ['html', 'md', 'csv'],
  includeJson: true,
  includeRemediationSuggestions: false,
}

export const DEFAULT_ALLOW_DENY_CONFIG: AllowDenyConfig = {
  allowedAppIds: [],
  deniedAppIds: [],
  trustedPublisherDomains: [],
}

export const DEFAULT_CONFIG: Config = {
  auth: DEFAULT_AUTH_CONFIG,
  thresholds: DEFAULT_THRESHOLD_CONFIG,
  scoring: DEFAULT_SCORING_WEIGHTS,
  output: DEFAULT_OUTPUT_CONFIG,
  allowDeny: DEFAULT_ALLOW_DENY_CONFIG,
  mode: 'auto',
  enableCache: true,
  cacheTtlSeconds: 3600,
  logLevel: 'INFO',
  verbose: false,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Deep merge objects, with second argument values taking precedence.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target }

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key]
      const targetValue = result[key]

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as any
      } else {
        result[key] = sourceValue as any
      }
    }
  }

  return result
}

/**
 * Load configuration from a JSON object.
 */
export function loadConfigFromJson(json: Record<string, unknown>): Config {
  const config: Config = { ...DEFAULT_CONFIG }

  // Auth config
  if (json.auth && typeof json.auth === 'object') {
    const authData = json.auth as Record<string, unknown>
    config.auth = {
      tenantId: (authData.tenantId || authData.tenant_id) as string || '',
      clientId: (authData.clientId || authData.client_id) as string || '',
      clientSecret: (authData.clientSecret || authData.client_secret) as string | null,
      certificatePath: (authData.certificatePath || authData.certificate_path) as string | null,
      certificatePassword:
        (authData.certificatePassword || authData.certificate_password) as string | null,
      useDeviceCode: Boolean(authData.useDeviceCode || authData.use_device_code),
    }
  }

  // Thresholds
  if (json.thresholds && typeof json.thresholds === 'object') {
    const th = json.thresholds as Record<string, unknown>
    config.thresholds = {
      credentialExpiryCritical:
        (th.credentialExpiryCritical || th.credential_expiry_critical as number) || 7,
      credentialExpiryHigh: (th.credentialExpiryHigh || th.credential_expiry_high as number) || 30,
      credentialExpiryMedium:
        (th.credentialExpiryMedium || th.credential_expiry_medium as number) || 60,
      credentialExpiryLow: (th.credentialExpiryLow || th.credential_expiry_low as number) || 90,
      inactiveDaysThreshold:
        (th.inactiveDaysThreshold || th.inactive_days_threshold as number) || 90,
      credentialAgeConcern: (th.credentialAgeConcern || th.credential_age_concern as number) || 365,
    }
  }

  // Scoring weights
  if (json.scoring && typeof json.scoring === 'object') {
    const sc = json.scoring as Record<string, unknown>
    config.scoring = {
      applicationPermissionMultiplier:
        (sc.applicationPermissionMultiplier || sc.application_permission_multiplier as number) ||
        1.5,
      delegatedPermissionMultiplier:
        (sc.delegatedPermissionMultiplier || sc.delegated_permission_multiplier as number) || 1.0,
      userConsentWeight: (sc.userConsentWeight || sc.user_consent_weight as number) || 1.2,
      adminConsentWeight: (sc.adminConsentWeight || sc.admin_consent_weight as number) || 1.0,
      noVerifiedPublisherWeight:
        (sc.noVerifiedPublisherWeight || sc.no_verified_publisher_weight as number) || 1.3,
      externalMultiTenantWeight:
        (sc.externalMultiTenantWeight || sc.external_multi_tenant_weight as number) || 1.2,
      firstPartyMicrosoftWeight:
        (sc.firstPartyMicrosoftWeight || sc.first_party_microsoft_weight as number) || 0.3,
      noOwnerWeight: (sc.noOwnerWeight || sc.no_owner_weight as number) || 1.3,
      unusedHighPrivilegeWeight:
        (sc.unusedHighPrivilegeWeight || sc.unused_high_privilege_weight as number) || 1.4,
      scoreTenantTakeover: (sc.scoreTenantTakeover || sc.score_tenant_takeover as number) || 100,
      scorePrivilegeEscalation:
        (sc.scorePrivilegeEscalation || sc.score_privilege_escalation as number) || 85,
      scoreDataExfiltration:
        (sc.scoreDataExfiltration || sc.score_data_exfiltration as number) || 70,
      scorePersistence: (sc.scorePersistence || sc.score_persistence as number) || 60,
      scoreLateralMovement:
        (sc.scoreLateralMovement || sc.score_lateral_movement as number) || 50,
      scoreReadOnly: (sc.scoreReadOnly || sc.score_read_only as number) || 20,
      scoreUnknown: (sc.scoreUnknown || sc.score_unknown as number) || 30,
    }
  }

  // Allow/deny lists
  if (json.allowDeny && typeof json.allowDeny === 'object') {
    const ad = json.allowDeny as Record<string, unknown>
    config.allowDeny = {
      allowedAppIds: ((ad.allowedAppIds || ad.allowed_app_ids) as string[]) || [],
      deniedAppIds: ((ad.deniedAppIds || ad.denied_app_ids) as string[]) || [],
      trustedPublisherDomains:
        ((ad.trustedPublisherDomains || ad.trusted_publisher_domains) as string[]) || [],
    }
  }

  // Top-level settings
  config.mode = (json.mode as string) || 'auto'
  config.enableCache = json.enableCache !== false && json.enable_cache !== false
  config.cacheTtlSeconds = (json.cacheTtlSeconds || json.cache_ttl_seconds as number) || 3600
  config.logLevel = (json.logLevel || json.log_level as string) || 'INFO'
  config.verbose = Boolean(json.verbose)

  return config
}

/**
 * Load configuration from a URL (JSON).
 */
export async function loadConfigFromUrl(url: string): Promise<Config> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load config from ${url}: ${response.statusText}`)
  }
  const json = await response.json()
  return loadConfigFromJson(json)
}

/**
 * Load configuration from environment variables.
 */
export function loadConfigFromEnv(): Config {
  const config: Config = { ...DEFAULT_CONFIG }

  // Auth from environment (also support snake_case variants)
  const env = process.env

  config.auth = {
    tenantId: env.REACT_APP_TENANT_ID || env.VITE_TENANT_ID || '',
    clientId: env.REACT_APP_CLIENT_ID || env.VITE_CLIENT_ID || '',
    clientSecret: env.REACT_APP_CLIENT_SECRET || env.VITE_CLIENT_SECRET || null,
    certificatePath: null,
    certificatePassword: null,
    useDeviceCode: false,
  }

  // Other settings
  config.mode = env.REACT_APP_MODE || env.VITE_MODE || 'auto'
  config.logLevel = env.REACT_APP_LOG_LEVEL || env.VITE_LOG_LEVEL || 'INFO'
  config.verbose = (env.REACT_APP_VERBOSE || env.VITE_VERBOSE || '').toLowerCase() === 'true'

  return config
}

/**
 * Convert config to a serializable JSON object (hiding secrets).
 */
export function configToJson(config: Config): Record<string, unknown> {
  return {
    auth: {
      tenantId: config.auth?.tenantId || '',
      clientId: config.auth?.clientId || '',
      clientSecret: config.auth?.clientSecret ? '***' : null,
      useDeviceCode: config.auth?.useDeviceCode || false,
    },
    thresholds: {
      credentialExpiryCritical: config.thresholds.credentialExpiryCritical,
      credentialExpiryHigh: config.thresholds.credentialExpiryHigh,
      credentialExpiryMedium: config.thresholds.credentialExpiryMedium,
      credentialExpiryLow: config.thresholds.credentialExpiryLow,
      inactiveDaysThreshold: config.thresholds.inactiveDaysThreshold,
      credentialAgeConcern: config.thresholds.credentialAgeConcern,
    },
    scoring: config.scoring,
    allowDeny: config.allowDeny,
    mode: config.mode,
    enableCache: config.enableCache,
    cacheTtlSeconds: config.cacheTtlSeconds,
    logLevel: config.logLevel,
    verbose: config.verbose,
  }
}

/**
 * Create a sample configuration with sensible defaults.
 */
export function createSampleConfig(): Config {
  const config: Config = {
    ...DEFAULT_CONFIG,
    allowDeny: {
      ...DEFAULT_ALLOW_DENY_CONFIG,
      trustedPublisherDomains: ['microsoft.com', 'azure.com'],
    },
  }
  return config
}
