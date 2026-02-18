/**
 * Microsoft Graph API client using MSAL for token acquisition.
 *
 * Calls Graph directly from the browser — no backend required.
 */

import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { GRAPH_SCOPES_LIMITED, GRAPH_SCOPES_FULL } from '@/lib/msalConfig'
import { getLogger } from '@/lib/utils/logger'

const logger = getLogger('graphClient')
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

interface TokenCacheEntry {
  token: string
  expiresAt: number
}

export class GraphClient {
  private msalInstance: IPublicClientApplication
  private account: AccountInfo
  private tokenCache: Map<string, TokenCacheEntry> = new Map()

  // Set after capabilities are probed
  signInLogsAvailable = false

  constructor(msalInstance: IPublicClientApplication, account: AccountInfo) {
    this.msalInstance = msalInstance
    this.account = account
  }

  // --------------------------------------------------------------------------
  // TOKEN ACQUISITION
  // --------------------------------------------------------------------------

  async getToken(scopes: string[]): Promise<string> {
    const cacheKey = scopes.sort().join(',')
    const cached = this.tokenCache.get(cacheKey)

    // Use cached token if it's good for more than 60 s
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token
    }

    try {
      const result = await this.msalInstance.acquireTokenSilent({
        scopes,
        account: this.account,
      })

      this.tokenCache.set(cacheKey, {
        token: result.accessToken,
        expiresAt: result.expiresOn?.getTime() ?? Date.now() + 3_600_000,
      })

      return result.accessToken
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Fall back to popup when silent fails
        const result = await this.msalInstance.acquireTokenPopup({
          scopes,
          account: this.account,
        })
        return result.accessToken
      }
      throw error
    }
  }

  // --------------------------------------------------------------------------
  // HTTP HELPERS
  // --------------------------------------------------------------------------

  private async _fetch<T>(url: string, scopes: string[]): Promise<T> {
    const token = await this.getToken(scopes)
    const fullUrl = url.startsWith('https://') ? url : `${GRAPH_BASE}${url}`

    logger.debug(`GET ${fullUrl}`)
    const response = await fetch(fullUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: 'eventual',
      },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Graph API ${response.status} on ${fullUrl}: ${body}`)
    }

    return response.json() as Promise<T>
  }

  async get<T>(path: string, useFullScopes = false): Promise<T> {
    const scopes = useFullScopes ? GRAPH_SCOPES_FULL : GRAPH_SCOPES_LIMITED
    return this._fetch<T>(path, scopes)
  }

  async *getAllPages<T>(path: string, useFullScopes = false): AsyncGenerator<T> {
    const scopes = useFullScopes ? GRAPH_SCOPES_FULL : GRAPH_SCOPES_LIMITED
    let nextLink: string | undefined = path.startsWith('https://') ? path : `${GRAPH_BASE}${path}`

    while (nextLink) {
      const data = await this._fetch<{ value?: T[]; '@odata.nextLink'?: string }>(
        nextLink,
        scopes
      )
      for (const item of data.value || []) {
        yield item
      }
      nextLink = data['@odata.nextLink']
    }
  }

  async getAll<T>(path: string, useFullScopes = false): Promise<T[]> {
    const items: T[] = []
    for await (const item of this.getAllPages<T>(path, useFullScopes)) {
      items.push(item)
    }
    return items
  }

  // --------------------------------------------------------------------------
  // CAPABILITY DETECTION
  // --------------------------------------------------------------------------

  async detectCapabilities(): Promise<void> {
    try {
      // Try a lightweight audit log request with limited scope — will fail if
      // the tenant doesn't have the permission
      const scopes = GRAPH_SCOPES_FULL
      await this.getToken(scopes)
      // A successful token acquisition with AuditLog.Read.All means the app
      // has consent for those scopes in this tenant
      this.signInLogsAvailable = true
      logger.info('Sign-in log data is available')
    } catch {
      this.signInLogsAvailable = false
      logger.info('Sign-in log data is NOT available — running in limited mode')
    }
  }
}
