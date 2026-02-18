/**
 * Permission Translator - converts raw permissions to plain English with risk context.
 */

import { RiskCategory } from '@/types/models'
import { getLogger } from '@/lib/utils/logger'

const logger = getLogger('translator')

// Default rules file path
const DEFAULT_RULES_PATH = '/public/permissions.json'

export interface TranslatedPermission {
  permission: string
  resource: string
  plainEnglish: string
  category: RiskCategory
  categoryLabel: string
  impactScore: number
  abuseScenarios: string[]
  adminImpactNote: string | null
  isKnown: boolean
}

export interface PermissionRule {
  displayName?: string
  plainEnglish?: string
  category?: string
  impactScore?: number
  abuseScenarios?: string[]
  adminImpactNote?: string
  resource?: string
  [key: string]: unknown
}

/**
 * Translates OAuth permission names into plain English with risk context.
 *
 * Uses a rules file (JSON) that maps permission names to descriptions,
 * categories, and abuse scenarios.
 */
export class PermissionTranslator {
  private rulesPath: string
  private rules: Map<string, PermissionRule> = new Map()
  private isLoaded = false
  private loadPromise: Promise<void> | null = null

  private static readonly CATEGORY_LABELS: Record<RiskCategory, string> = {
    [RiskCategory.READ_ONLY]: 'Read-only',
    [RiskCategory.DATA_EXFILTRATION]: 'Data exfiltration',
    [RiskCategory.PRIVILEGE_ESCALATION]: 'Privilege escalation',
    [RiskCategory.TENANT_TAKEOVER]: 'Tenant takeover potential',
    [RiskCategory.PERSISTENCE]: 'Persistence',
    [RiskCategory.LATERAL_MOVEMENT]: 'Lateral movement',
    [RiskCategory.UNKNOWN]: 'Unknown',
  }

  constructor(rulesPath: string = DEFAULT_RULES_PATH) {
    this.rulesPath = rulesPath
  }

  /**
   * Load rules from the JSON file.
   */
  async loadRules(): Promise<void> {
    if (this.isLoaded) return
    if (this.loadPromise) return this.loadPromise

    this.loadPromise = this._loadRulesInternal()
    await this.loadPromise
  }

  private async _loadRulesInternal(): Promise<void> {
    try {
      const response = await fetch(this.rulesPath)
      if (!response.ok) {
        logger.warn(`Rules file not found at ${this.rulesPath}, using empty rules`)
        this.isLoaded = true
        return
      }

      const data = await response.json()

      // Flatten the resource-grouped structure
      for (const resource in data) {
        if (typeof data[resource] === 'object' && data[resource] !== null) {
          const permissions = data[resource] as Record<string, PermissionRule>
          for (const permName in permissions) {
            const permData = permissions[permName]
            const key = permName.toLowerCase()
            this.rules.set(key, {
              resource,
              ...permData,
            })
          }
        }
      }

      logger.info(`Loaded ${this.rules.size} permission rules`)
      this.isLoaded = true
    } catch (error) {
      logger.error(
        `Failed to load rules file: ${error instanceof Error ? error.message : String(error)}`
      )
      this.isLoaded = true
    }
  }

  /**
   * Translate a single permission.
   */
  translate(permission: string, resource: string = 'microsoft_graph'): TranslatedPermission {
    // Normalize permission name for lookup
    const key = permission.toLowerCase()
    const rule = this.rules.get(key)

    if (rule) {
      const category = this._parseCategory(rule.category || 'unknown')
      return {
        permission,
        resource: rule.resource || resource,
        plainEnglish: rule.plainEnglish || rule.displayName || permission,
        category,
        categoryLabel: PermissionTranslator.CATEGORY_LABELS[category],
        impactScore: rule.impactScore || 30,
        abuseScenarios: rule.abuseScenarios || [],
        adminImpactNote: rule.adminImpactNote || null,
        isKnown: true,
      }
    }

    // Unknown permission - return with sensible defaults
    return {
      permission,
      resource,
      plainEnglish: `Permission: ${permission} (no translation available)`,
      category: RiskCategory.UNKNOWN,
      categoryLabel: 'Unknown - requires review',
      impactScore: 30,
      abuseScenarios: [],
      adminImpactNote: null,
      isKnown: false,
    }
  }

  /**
   * Translate multiple permissions.
   */
  translateMany(
    permissions: string[],
    resource: string = 'microsoft_graph'
  ): TranslatedPermission[] {
    return permissions.map((p) => this.translate(p, resource))
  }

  /**
   * Get all known high-impact permissions.
   */
  getHighImpactPermissions(minScore: number = 70): Array<[string, TranslatedPermission]> {
    const results: Array<[string, TranslatedPermission]> = []

    for (const [permKey, rule] of this.rules.entries()) {
      if ((rule.impactScore || 0) >= minScore) {
        const permName = rule.displayName || permKey
        const translated = this.translate(permName)
        results.push([permName, translated])
      }
    }

    return results.sort((a, b) => b[1].impactScore - a[1].impactScore)
  }

  /**
   * Format a permission into a human-readable report string.
   */
  formatPermissionReport(permission: string, includeScenarios: boolean = true): string {
    const translated = this.translate(permission)

    const lines: string[] = [
      `Permission: ${translated.permission}`,
      `Resource: ${translated.resource}`,
      `Description: ${translated.plainEnglish}`,
      `Risk Category: ${translated.categoryLabel}`,
      `Impact Score: ${translated.impactScore}/100`,
    ]

    if (translated.adminImpactNote) {
      lines.push(`Admin Impact: ${translated.adminImpactNote}`)
    }

    if (includeScenarios && translated.abuseScenarios.length > 0) {
      lines.push('Potential Abuse Scenarios:')
      for (const scenario of translated.abuseScenarios) {
        lines.push(`  • ${scenario}`)
      }
    }

    if (!translated.isKnown) {
      lines.push('')
      lines.push('⚠ This permission is not in the rules database.')
      lines.push('  Please review the raw permission documentation.')
    }

    return lines.join('\n')
  }

  /**
   * Parse category string to RiskCategory enum.
   */
  private _parseCategory(categoryStr: string): RiskCategory {
    const mapping: Record<string, RiskCategory> = {
      read_only: RiskCategory.READ_ONLY,
      data_exfiltration: RiskCategory.DATA_EXFILTRATION,
      privilege_escalation: RiskCategory.PRIVILEGE_ESCALATION,
      tenant_takeover: RiskCategory.TENANT_TAKEOVER,
      persistence: RiskCategory.PERSISTENCE,
      lateral_movement: RiskCategory.LATERAL_MOVEMENT,
    }
    return mapping[categoryStr.toLowerCase()] || RiskCategory.UNKNOWN
  }

  /**
   * Get the number of permissions in the rules database.
   */
  getKnownPermissionCount(): number {
    return this.rules.size
  }

  /**
   * Reload rules from file.
   */
  async reloadRules(rulesPath?: string): Promise<void> {
    if (rulesPath) {
      this.rulesPath = rulesPath
    }
    this.rules.clear()
    this.isLoaded = false
    this.loadPromise = null
    await this.loadRules()
  }
}
