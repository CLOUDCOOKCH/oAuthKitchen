import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, Shield, AlertTriangle, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { permissionTranslator, type TranslatedPermission } from '@/lib/analyzers/translator'
import { RiskCategory } from '@/types/models'
import { cn } from '@/lib/utils'

const CATEGORY_COLORS: Record<RiskCategory, string> = {
  [RiskCategory.TENANT_TAKEOVER]: 'border-red-600/40 bg-red-600/5 text-red-600',
  [RiskCategory.PRIVILEGE_ESCALATION]: 'border-red-500/40 bg-red-500/5 text-red-500',
  [RiskCategory.DATA_EXFILTRATION]: 'border-orange-500/40 bg-orange-500/5 text-orange-500',
  [RiskCategory.PERSISTENCE]: 'border-yellow-500/40 bg-yellow-500/5 text-yellow-500',
  [RiskCategory.LATERAL_MOVEMENT]: 'border-yellow-400/40 bg-yellow-400/5 text-yellow-400',
  [RiskCategory.READ_ONLY]: 'border-green-500/40 bg-green-500/5 text-green-500',
  [RiskCategory.UNKNOWN]: 'border-border bg-muted/30 text-muted-foreground',
}

const CATEGORY_FILTERS = [
  { value: '', label: 'All' },
  { value: RiskCategory.TENANT_TAKEOVER, label: 'Tenant Takeover' },
  { value: RiskCategory.PRIVILEGE_ESCALATION, label: 'Privilege Escalation' },
  { value: RiskCategory.DATA_EXFILTRATION, label: 'Data Exfiltration' },
  { value: RiskCategory.PERSISTENCE, label: 'Persistence' },
  { value: RiskCategory.LATERAL_MOVEMENT, label: 'Lateral Movement' },
  { value: RiskCategory.READ_ONLY, label: 'Read-only' },
]

export default function Permissions() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [allPerms, setAllPerms] = useState<TranslatedPermission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedPerm, setExpandedPerm] = useState<string | null>(null)

  useEffect(() => {
    permissionTranslator.loadRules().then(() => {
      const perms: TranslatedPermission[] = []
      for (const [permName, rule] of permissionTranslator.getAllRules().entries()) {
        const displayName = (rule.displayName as string | undefined) || permName
        perms.push(permissionTranslator.translate(displayName))
      }
      perms.sort((a, b) => b.impactScore - a.impactScore)
      setAllPerms(perms)
      setIsLoading(false)
    })
  }, [])

  const filtered = allPerms.filter((p) => {
    const matchesSearch =
      !search ||
      p.permission.toLowerCase().includes(search.toLowerCase()) ||
      p.plainEnglish.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !categoryFilter || p.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Permission Translator</h1>
        <p className="text-muted-foreground">
          Browse Microsoft Graph permissions with plain English descriptions and risk context
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search permissions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                categoryFilter === cat.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} of {allPerms.length} permissions
        </p>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No permissions match your search.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((perm, i) => (
            <motion.div
              key={perm.permission}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
            >
              <button
                className="w-full text-left rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
                onClick={() =>
                  setExpandedPerm(expandedPerm === perm.permission ? null : perm.permission)
                }
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-mono font-medium">{perm.permission}</code>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', CATEGORY_COLORS[perm.category])}
                      >
                        {perm.categoryLabel}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {perm.plainEnglish}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                        perm.impactScore >= 80
                          ? 'bg-red-500/20 text-red-500'
                          : perm.impactScore >= 60
                          ? 'bg-orange-500/20 text-orange-500'
                          : perm.impactScore >= 40
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : 'bg-green-500/20 text-green-500'
                      )}
                    >
                      {perm.impactScore}
                    </div>
                  </div>
                </div>
              </button>

              {expandedPerm === perm.permission && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="border border-t-0 rounded-b-lg bg-muted/30 p-4 space-y-3"
                >
                  <div className="flex items-start gap-2 text-sm">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                    <p>{perm.plainEnglish}</p>
                  </div>

                  {perm.adminImpactNote && (
                    <div className="flex items-start gap-2 text-sm">
                      <Shield className="h-4 w-4 mt-0.5 flex-shrink-0 text-yellow-500" />
                      <p className="text-yellow-600 dark:text-yellow-400">{perm.adminImpactNote}</p>
                    </div>
                  )}

                  {perm.abuseScenarios.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        Potential Abuse Scenarios
                      </p>
                      <ul className="space-y-1">
                        {perm.abuseScenarios.map((scenario, si) => (
                          <li key={si} className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-orange-500" />
                            {scenario}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!perm.isKnown && (
                    <p className="text-xs text-muted-foreground border border-border rounded p-2">
                      This permission is not in the rules database. Review the raw Microsoft documentation.
                    </p>
                  )}
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
