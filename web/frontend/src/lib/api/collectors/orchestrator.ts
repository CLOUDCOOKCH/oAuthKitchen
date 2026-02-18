/**
 * Scan orchestrator — coordinates all collectors and analyzers to produce
 * a full AnalysisResult in-browser.
 */

import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser'
import { GraphClient } from '@/lib/api/graphClient'
import { collectApplications } from '@/lib/api/collectors/applications'
import { collectServicePrincipals } from '@/lib/api/collectors/servicePrincipals'
import { permissionTranslator } from '@/lib/analyzers/translator'
import { RiskScorer } from '@/lib/analyzers/scoring'
import { ShadowOAuthDetector } from '@/lib/analyzers/shadow'
import {
  type AnalysisResult,
  type Application,
  type CredentialExpiryFinding,
  CredentialType,
  getAllCredentials,
  getDaysUntilExpiry,
} from '@/types/models'
import { getLogger } from '@/lib/utils/logger'

const logger = getLogger('orchestrator')

export type ProgressCallback = (message: string) => void

export interface ScanOptions {
  inactiveDaysThreshold?: number
  credentialExpiryCriticalDays?: number
  includeRemediation?: boolean
}

// --------------------------------------------------------------------------
// CREDENTIAL EXPIRY HELPER
// --------------------------------------------------------------------------

function collectCredentialFindings(
  applications: Application[],
  criticalDays: number
): CredentialExpiryFinding[] {
  const findings: CredentialExpiryFinding[] = []

  for (const app of applications) {
    for (const cred of getAllCredentials(app)) {
      const days = getDaysUntilExpiry(cred)
      if (days === null) continue

      let severity: string
      if (days < 0) {
        severity = 'critical'
      } else if (days <= criticalDays) {
        severity = 'critical'
      } else if (days <= 30) {
        severity = 'high'
      } else if (days <= 60) {
        severity = 'medium'
      } else if (days <= 90) {
        severity = 'low'
      } else {
        continue // Not expiring soon enough to report
      }

      findings.push({
        appId: app.appId,
        appName: app.displayName,
        credentialType: cred.credentialType,
        credentialName: cred.displayName,
        expiresInDays: days,
        expiryDate: cred.endDatetime!,
        severity,
      })
    }
  }

  return findings.sort((a, b) => a.expiresInDays - b.expiresInDays)
}

// --------------------------------------------------------------------------
// MAIN SCAN FUNCTION
// --------------------------------------------------------------------------

export async function runScan(
  msalInstance: IPublicClientApplication,
  account: AccountInfo,
  tenantId: string,
  options: ScanOptions = {},
  onProgress: ProgressCallback = () => {}
): Promise<AnalysisResult> {
  const {
    inactiveDaysThreshold = 90,
    credentialExpiryCriticalDays = 7,
    includeRemediation = false,
  } = options

  const client = new GraphClient(msalInstance, account)

  // -------------------------------------------------------------------
  // STEP 1: Detect capabilities
  // -------------------------------------------------------------------
  onProgress('Detecting tenant capabilities…')
  await client.detectCapabilities()
  const includeSignIn = client.signInLogsAvailable
  logger.info(`Sign-in activity available: ${includeSignIn}`)

  // -------------------------------------------------------------------
  // STEP 2: Load permission rules
  // -------------------------------------------------------------------
  onProgress('Loading permission rules…')
  await permissionTranslator.loadRules()

  // -------------------------------------------------------------------
  // STEP 3: Collect application registrations
  // -------------------------------------------------------------------
  onProgress('Collecting application registrations…')
  const applications = await collectApplications(client)
  onProgress(`Found ${applications.length} application registrations`)

  // Build appId → Application lookup for linking
  const appMap = new Map(applications.map((a) => [a.appId, a]))

  // -------------------------------------------------------------------
  // STEP 4: Collect service principals
  // -------------------------------------------------------------------
  onProgress('Collecting service principals (enterprise apps)…')
  const servicePrincipals = await collectServicePrincipals(
    client,
    tenantId,
    appMap,
    includeSignIn
  )
  onProgress(`Found ${servicePrincipals.length} service principals`)

  // -------------------------------------------------------------------
  // STEP 5: Risk scoring
  // -------------------------------------------------------------------
  onProgress('Running risk scoring…')
  const scorer = new RiskScorer({
    inactiveDaysThreshold,
    credentialExpiryCriticalDays,
  })
  const scoreMap = scorer.scoreAll(servicePrincipals)

  // Convert Map → plain object for serialisation
  const riskScores: AnalysisResult['riskScores'] = {}
  for (const [id, score] of scoreMap.entries()) {
    riskScores[id] = score
  }

  // -------------------------------------------------------------------
  // STEP 6: Shadow OAuth detection
  // -------------------------------------------------------------------
  onProgress('Running shadow OAuth detection…')
  const detector = new ShadowOAuthDetector(includeRemediation, inactiveDaysThreshold)
  const shadowFindings = detector.detect(servicePrincipals)
  onProgress(`Found ${shadowFindings.length} shadow OAuth findings`)

  // -------------------------------------------------------------------
  // STEP 7: Credential expiry analysis
  // -------------------------------------------------------------------
  onProgress('Checking credential expiry…')
  const credentialFindings = collectCredentialFindings(applications, credentialExpiryCriticalDays)

  // -------------------------------------------------------------------
  // STEP 8: Compute statistics
  // -------------------------------------------------------------------
  onProgress('Computing statistics…')

  let criticalCount = 0
  let highRiskCount = 0
  let appsWithoutOwners = 0

  for (const sp of servicePrincipals) {
    const score = scoreMap.get(sp.objectId)
    if (score) {
      if (score.riskLevel === 'critical') criticalCount++
      else if (score.riskLevel === 'high') highRiskCount++
    }
    if (!sp.owners || sp.owners.length === 0) appsWithoutOwners++
  }

  const expiringCredentials30Days = credentialFindings.filter(
    (f) => f.expiresInDays >= 0 && f.expiresInDays <= 30
  ).length

  onProgress('Scan complete!')

  return {
    tenantId,
    analysisTimestamp: new Date(),
    mode: includeSignIn ? 'full' : 'limited',
    applications,
    servicePrincipals,
    riskScores,
    shadowFindings,
    credentialFindings,
    totalApps: applications.length,
    totalServicePrincipals: servicePrincipals.length,
    highRiskCount,
    criticalCount,
    appsWithoutOwners,
    expiringCredentials30Days,
    signInDataAvailable: includeSignIn,
    auditLogAvailable: includeSignIn,
  }
}
