/**
 * Service principal collector — fetches enterprise apps from Microsoft Graph.
 */

import type { GraphClient } from '@/lib/api/graphClient'
import type { Application } from '@/types/models'
import {
  type ServicePrincipal,
  type Owner,
  type OAuth2PermissionGrant,
  type AppRoleAssignment,
  type SignInActivity,
  AppType,
  ConsentType,
} from '@/types/models'
import { getLogger } from '@/lib/utils/logger'

const logger = getLogger('sp-collector')

// Microsoft's own tenant ID — first-party apps are owned by this org
const MICROSOFT_TENANT_ID = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a'

// --------------------------------------------------------------------------
// RAW SHAPES
// --------------------------------------------------------------------------

interface RawSignInActivity {
  lastSignInDateTime?: string | null
  lastNonInteractiveSignInDateTime?: string | null
  lastSuccessfulSignInDateTime?: string | null
}

interface RawSP {
  id: string
  appId: string
  displayName: string
  createdDateTime?: string | null
  servicePrincipalType?: string | null
  publisherName?: string | null
  verifiedPublisher?: Record<string, unknown> | null
  appOwnerOrganizationId?: string | null
  accountEnabled?: boolean
  tags?: string[]
  signInActivity?: RawSignInActivity | null
}

interface RawOwner {
  id: string
  displayName?: string | null
  userPrincipalName?: string | null
  '@odata.type'?: string
}

interface RawGrant {
  id: string
  clientId: string
  consentType: string
  principalId: string | null
  resourceId: string
  scope: string
  startTime?: string | null
  expiryTime?: string | null
}

interface RawAssignment {
  id: string
  appRoleId: string
  principalId: string
  principalType: string
  resourceId: string
  resourceDisplayName?: string | null
  createdDateTime?: string | null
}

// --------------------------------------------------------------------------
// NORMALISATION
// --------------------------------------------------------------------------

function classifyAppType(raw: RawSP, tenantId: string): AppType {
  const ownerOrgId = raw.appOwnerOrganizationId

  if (ownerOrgId === MICROSOFT_TENANT_ID) {
    return AppType.FIRST_PARTY_MICROSOFT
  }

  if (ownerOrgId === tenantId) {
    return AppType.TENANT_OWNED
  }

  if (ownerOrgId) {
    return AppType.THIRD_PARTY_MULTI_TENANT
  }

  return AppType.EXTERNAL_UNKNOWN
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

function normaliseGrant(raw: RawGrant): OAuth2PermissionGrant {
  let consentType: ConsentType
  switch (raw.consentType?.toLowerCase()) {
    case 'allprincipals':
      consentType = ConsentType.ADMIN
      break
    case 'principal':
      consentType = ConsentType.USER
      break
    default:
      consentType = ConsentType.UNKNOWN
  }

  return {
    id: raw.id,
    clientId: raw.clientId,
    consentType,
    principalId: raw.principalId || null,
    resourceId: raw.resourceId,
    scope: raw.scope || '',
    startTime: raw.startTime ? new Date(raw.startTime) : null,
    expiryTime: raw.expiryTime ? new Date(raw.expiryTime) : null,
  }
}

function normaliseAssignment(raw: RawAssignment): AppRoleAssignment {
  return {
    id: raw.id,
    appRoleId: raw.appRoleId,
    principalId: raw.principalId,
    principalType: raw.principalType,
    resourceId: raw.resourceId,
    resourceDisplayName: raw.resourceDisplayName || null,
    createdDatetime: raw.createdDateTime ? new Date(raw.createdDateTime) : null,
  }
}

function normaliseSignInActivity(raw: RawSignInActivity): SignInActivity {
  return {
    lastSignInDatetime: raw.lastSignInDateTime ? new Date(raw.lastSignInDateTime) : null,
    lastNonInteractiveSignInDatetime: raw.lastNonInteractiveSignInDateTime
      ? new Date(raw.lastNonInteractiveSignInDateTime)
      : null,
    lastSuccessfulSignInDatetime: raw.lastSuccessfulSignInDateTime
      ? new Date(raw.lastSuccessfulSignInDateTime)
      : null,
    dataAvailable: true,
  }
}

// --------------------------------------------------------------------------
// COLLECTOR
// --------------------------------------------------------------------------

const BASE_SELECT = [
  'id',
  'appId',
  'displayName',
  'createdDateTime',
  'servicePrincipalType',
  'publisherName',
  'verifiedPublisher',
  'appOwnerOrganizationId',
  'accountEnabled',
  'tags',
].join(',')

const FULL_SELECT = `${BASE_SELECT},signInActivity`

export async function collectServicePrincipals(
  client: GraphClient,
  tenantId: string,
  applicationMap: Map<string, Application>,
  includeSignInActivity: boolean
): Promise<ServicePrincipal[]> {
  logger.info('Collecting service principals...')

  const select = includeSignInActivity ? FULL_SELECT : BASE_SELECT
  const rawSPs = await client.getAll<RawSP>(
    `/servicePrincipals?$select=${select}&$count=true`,
    includeSignInActivity
  )

  logger.info(`Fetched ${rawSPs.length} service principals`)

  const results: ServicePrincipal[] = []

  for (const raw of rawSPs) {
    const appType = classifyAppType(raw, tenantId)

    // Fetch owners
    let owners: Owner[] = []
    try {
      const ownerData = await client.get<{ value: RawOwner[] }>(
        `/servicePrincipals/${raw.id}/owners?$select=id,displayName,userPrincipalName`
      )
      owners = (ownerData.value || []).map(normaliseOwner)
    } catch {
      logger.warn(`Could not fetch owners for SP ${raw.displayName}`)
    }

    // Fetch delegated permission grants
    let grants: OAuth2PermissionGrant[] = []
    try {
      const grantData = await client.get<{ value: RawGrant[] }>(
        `/servicePrincipals/${raw.id}/oauth2PermissionGrants`
      )
      grants = (grantData.value || []).map(normaliseGrant)
    } catch {
      logger.warn(`Could not fetch grants for SP ${raw.displayName}`)
    }

    // Fetch app role assignments
    let assignments: AppRoleAssignment[] = []
    try {
      const assignData = await client.get<{ value: RawAssignment[] }>(
        `/servicePrincipals/${raw.id}/appRoleAssignments`
      )
      assignments = (assignData.value || []).map(normaliseAssignment)
    } catch {
      logger.warn(`Could not fetch assignments for SP ${raw.displayName}`)
    }

    // Build unique consenting users set
    const uniqueUsers = new Set<string>()
    for (const grant of grants) {
      if (grant.principalId) uniqueUsers.add(grant.principalId)
    }

    const sp: ServicePrincipal = {
      objectId: raw.id,
      appId: raw.appId,
      displayName: raw.displayName,
      createdDatetime: raw.createdDateTime ? new Date(raw.createdDateTime) : null,
      servicePrincipalType: raw.servicePrincipalType || null,
      appType,
      publisherName: raw.publisherName || null,
      verifiedPublisher: raw.verifiedPublisher || null,
      appOwnerOrganizationId: raw.appOwnerOrganizationId || null,
      accountEnabled: raw.accountEnabled ?? true,
      tags: raw.tags || [],
      owners,
      oauth2PermissionGrants: grants,
      appRoleAssignments: assignments,
      signInActivity:
        raw.signInActivity ? normaliseSignInActivity(raw.signInActivity) : null,
      linkedApplication: applicationMap.get(raw.appId) || null,
      uniqueConsentingUsers: uniqueUsers,
    }

    results.push(sp)
  }

  logger.info(`Collected ${results.length} service principals with full detail`)
  return results
}
