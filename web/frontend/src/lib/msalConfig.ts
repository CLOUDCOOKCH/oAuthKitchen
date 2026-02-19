import type { Configuration } from '@azure/msal-browser'

/**
 * Build an MSAL PublicClientApplication configuration from the given clientId and tenantId.
 * tenantId can be a GUID, 'organizations' (any work account), or 'common' (any account).
 */
export function buildMsalConfig(clientId: string, tenantId: string): Configuration {
  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId || 'organizations'}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  }
}

/**
 * Scopes needed to read the tenant's OAuth applications from Microsoft Graph.
 * Application.Read.All and Directory.Read.All are the minimum required.
 */
export const GRAPH_SCOPES_LIMITED = [
  'https://graph.microsoft.com/Application.Read.All',
  'https://graph.microsoft.com/Directory.Read.All',
]

/**
 * Full scopes that additionally include audit-log access for sign-in activity.
 * This requires elevated permissions in the tenant.
 */
export const GRAPH_SCOPES_FULL = [
  ...GRAPH_SCOPES_LIMITED,
  'https://graph.microsoft.com/AuditLog.Read.All',
]
