/**
 * Application collector — fetches app registrations from Microsoft Graph.
 */

import type { GraphClient } from '@/lib/api/graphClient'
import {
  type Application,
  type Credential,
  type Owner,
  CredentialType,
} from '@/types/models'
import { getLogger } from '@/lib/utils/logger'

const logger = getLogger('applications-collector')

// --------------------------------------------------------------------------
// RAW GRAPH RESPONSE SHAPES
// --------------------------------------------------------------------------

interface RawCredential {
  keyId?: string
  displayName?: string | null
  startDateTime?: string | null
  endDateTime?: string | null
}

interface RawApplication {
  id: string
  appId: string
  displayName: string
  createdDateTime?: string | null
  publisherDomain?: string | null
  verifiedPublisher?: Record<string, unknown> | null
  signInAudience?: string | null
  passwordCredentials?: RawCredential[]
  keyCredentials?: RawCredential[]
  requiredResourceAccess?: Record<string, unknown>[]
  notes?: string | null
  tags?: string[]
}

interface RawOwner {
  id: string
  displayName?: string | null
  userPrincipalName?: string | null
  '@odata.type'?: string
}

// --------------------------------------------------------------------------
// NORMALISATION HELPERS
// --------------------------------------------------------------------------

function normaliseCredential(raw: RawCredential, type: CredentialType): Credential {
  return {
    credentialId: raw.keyId || crypto.randomUUID(),
    credentialType: type,
    displayName: raw.displayName || null,
    startDatetime: raw.startDateTime ? new Date(raw.startDateTime) : null,
    endDatetime: raw.endDateTime ? new Date(raw.endDateTime) : null,
    keyId: raw.keyId || null,
  }
}

function normaliseOwner(raw: RawOwner): Owner {
  const type = (raw['@odata.type'] || '#microsoft.graph.user').replace('#microsoft.graph.', '')
  return {
    objectId: raw.id,
    displayName: raw.displayName || null,
    userPrincipalName: raw.userPrincipalName || null,
    objectType: type,
  }
}

function normaliseApplication(raw: RawApplication, owners: Owner[]): Application {
  const signInAudience = raw.signInAudience || null
  const isMultiTenant =
    signInAudience === 'AzureADMultipleOrgs' ||
    signInAudience === 'AzureADandPersonalMicrosoftAccount'

  return {
    objectId: raw.id,
    appId: raw.appId,
    displayName: raw.displayName,
    createdDatetime: raw.createdDateTime ? new Date(raw.createdDateTime) : null,
    publisherDomain: raw.publisherDomain || null,
    verifiedPublisher: raw.verifiedPublisher || null,
    signInAudience,
    isMultiTenant,
    passwordCredentials: (raw.passwordCredentials || []).map((c) =>
      normaliseCredential(c, CredentialType.PASSWORD)
    ),
    keyCredentials: (raw.keyCredentials || []).map((c) =>
      normaliseCredential(c, CredentialType.CERTIFICATE)
    ),
    owners,
    requiredResourceAccess: raw.requiredResourceAccess || [],
    notes: raw.notes || null,
    tags: raw.tags || [],
  }
}

// --------------------------------------------------------------------------
// COLLECTOR
// --------------------------------------------------------------------------

const SELECT_FIELDS = [
  'id',
  'appId',
  'displayName',
  'createdDateTime',
  'publisherDomain',
  'verifiedPublisher',
  'signInAudience',
  'passwordCredentials',
  'keyCredentials',
  'requiredResourceAccess',
  'notes',
  'tags',
].join(',')

export async function collectApplications(client: GraphClient): Promise<Application[]> {
  logger.info('Collecting application registrations...')

  const rawApps = await client.getAll<RawApplication>(
    `/applications?$select=${SELECT_FIELDS}&$count=true`
  )

  logger.info(`Fetched ${rawApps.length} application registrations`)

  const applications: Application[] = []

  for (const raw of rawApps) {
    // Fetch owners for each app
    let owners: Owner[] = []
    try {
      const ownerData = await client.get<{ value: RawOwner[] }>(
        `/applications/${raw.id}/owners?$select=id,displayName,userPrincipalName`
      )
      owners = (ownerData.value || []).map(normaliseOwner)
    } catch {
      logger.warn(`Could not fetch owners for app ${raw.displayName}`)
    }

    applications.push(normaliseApplication(raw, owners))
  }

  logger.info(`Collected ${applications.length} applications with owner data`)
  return applications
}
