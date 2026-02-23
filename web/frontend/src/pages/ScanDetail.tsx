import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  Key,
  Search,
  ChevronDown,
  ChevronUp,
  Download,
  Lightbulb,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import RiskBadge from '@/components/RiskBadge'
import { useScanStore } from '@/lib/store'
import { getTopRiskyApps } from '@/types/models'
import { formatDate, cn, getRiskColor } from '@/lib/utils'

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const SEVERITY_CHIPS = ['critical', 'high', 'medium', 'low'] as const

function exportCSV(rows: (string | number)[][], filename: string) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type Tab = 'findings' | 'apps' | 'credentials'

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export default function ScanDetail() {
  const { currentScan } = useScanStore()
  const [activeTab, setActiveTab] = useState<Tab>('findings')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [expandedApp, setExpandedApp] = useState<string | null>(null)

  // Debounce search 200 ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(t)
  }, [search])

  // Reset severity filter when switching tabs
  useEffect(() => {
    setSeverityFilter('')
  }, [activeTab])

  // All useMemo hooks must be unconditional — guard against null currentScan here
  const topRisky = useMemo(
    () => (currentScan ? getTopRiskyApps(currentScan) : []),
    [currentScan]
  )

  const findings = useMemo(
    () => currentScan?.shadowFindings ?? [],
    [currentScan]
  )

  const credFindings = useMemo(
    () => currentScan?.credentialFindings ?? [],
    [currentScan]
  )

  const sortedFindings = useMemo(
    () =>
      [...findings].sort(
        (a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4)
      ),
    [findings]
  )

  const filteredFindings = useMemo(
    () =>
      sortedFindings.filter(
        (f) =>
          (!severityFilter || f.severity === severityFilter) &&
          (!debouncedSearch ||
            f.servicePrincipalName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            f.title.toLowerCase().includes(debouncedSearch.toLowerCase()))
      ),
    [sortedFindings, severityFilter, debouncedSearch]
  )

  const sortedCreds = useMemo(
    () =>
      [...credFindings].sort(
        (a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4)
      ),
    [credFindings]
  )

  const filteredApps = useMemo(
    () =>
      topRisky.filter(
        ([sp, score]) =>
          (!severityFilter || score.riskLevel === severityFilter) &&
          (!debouncedSearch || sp.displayName.toLowerCase().includes(debouncedSearch.toLowerCase()))
      ),
    [topRisky, severityFilter, debouncedSearch]
  )

  const filteredCreds = useMemo(
    () =>
      sortedCreds.filter(
        (c) =>
          (!severityFilter || c.severity === severityFilter) &&
          (!debouncedSearch || c.appName.toLowerCase().includes(debouncedSearch.toLowerCase()))
      ),
    [sortedCreds, severityFilter, debouncedSearch]
  )

  // Early return after all hooks
  if (!currentScan) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No scan results available</h2>
        <p className="text-muted-foreground text-sm">Run a scan to see detailed results here.</p>
        <Link to="/scans">
          <Button>Go to Scans</Button>
        </Link>
      </div>
    )
  }

  const severityBorder = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-red-500/30 bg-red-500/5'
      case 'high':     return 'border-orange-500/30 bg-orange-500/5'
      case 'medium':   return 'border-yellow-500/30 bg-yellow-500/5'
      default:         return 'border-green-500/30 bg-green-500/5'
    }
  }

  const chipActive = (s: string) =>
    s === 'critical' ? 'bg-red-500 text-white border-red-500'
    : s === 'high'   ? 'bg-orange-500 text-white border-orange-500'
    : s === 'medium' ? 'bg-yellow-500 text-white border-yellow-500'
    :                  'bg-green-500 text-white border-green-500'

  // CSV export handlers
  const handleExportFindings = () => {
    const hdrs = ['Title', 'Severity', 'App Name', 'Finding Type', 'Affected Scopes', 'Users', 'Description', 'Recommendation']
    const rows = filteredFindings.map((f) => [
      f.title, f.severity, f.servicePrincipalName, f.findingType,
      (f.affectedScopes || []).join('; '),
      f.affectedUserCount ?? '',
      f.description,
      f.recommendation ?? '',
    ])
    exportCSV([hdrs, ...rows], `findings-${currentScan.tenantId}-${Date.now()}.csv`)
  }

  const handleExportApps = () => {
    const hdrs = ['App Name', 'App Type', 'Risk Score', 'Risk Level', 'Risk Factors']
    const rows = filteredApps.map(([sp, score]) => [
      sp.displayName,
      sp.appType?.replace(/_/g, ' ') ?? '',
      score.totalScore,
      score.riskLevel,
      (score.factors || []).map((f) => f.name).join('; '),
    ])
    exportCSV([hdrs, ...rows], `apps-${currentScan.tenantId}-${Date.now()}.csv`)
  }

  const handleExportCreds = () => {
    const hdrs = ['App Name', 'Credential Name', 'Type', 'Severity', 'Expires In Days', 'Expiry Date']
    const rows = filteredCreds.map((c) => [
      c.appName, c.credentialName ?? '', c.credentialType, c.severity,
      c.expiresInDays, formatDate(c.expiryDate),
    ])
    exportCSV([hdrs, ...rows], `credentials-${currentScan.tenantId}-${Date.now()}.csv`)
  }

  const exportHandler = activeTab === 'findings' ? handleExportFindings
    : activeTab === 'apps'     ? handleExportApps
    : handleExportCreds

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/scans">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Scan Results</h1>
          <p className="text-muted-foreground text-sm">
            {formatDate(currentScan.analysisTimestamp)} · Tenant: {currentScan.tenantId} ·{' '}
            <span className="capitalize">{currentScan.mode} mode</span>
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: 'Apps Analysed', value: currentScan.totalServicePrincipals ?? 0 },
          { label: 'Critical', value: currentScan.criticalCount ?? 0, color: 'text-red-500' },
          { label: 'High Risk', value: currentScan.highRiskCount ?? 0, color: 'text-orange-500' },
          { label: 'Shadow Findings', value: findings.length, color: 'text-yellow-500' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={cn('text-2xl font-bold mt-1', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Export button */}
      <div className="flex items-center gap-2 border-b pb-2">
        <div className="flex gap-2 flex-1 flex-wrap">
          {[
            { id: 'findings' as Tab, label: `Shadow Findings (${findings.length})` },
            { id: 'apps' as Tab, label: `Top Risky Apps (${topRisky.length})` },
            { id: 'credentials' as Tab, label: `Credentials (${credFindings.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportHandler}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Severity filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSeverityFilter('')}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
            !severityFilter
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          All
        </button>
        {SEVERITY_CHIPS.map((s) => (
          <button
            key={s}
            onClick={() => setSeverityFilter(severityFilter === s ? '' : s)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full border capitalize transition-colors',
              severityFilter === s
                ? chipActive(s)
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* ---- FINDINGS TAB ---- */}
      {activeTab === 'findings' && (
        <div className="space-y-3">
          {filteredFindings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {findings.length === 0 ? 'No shadow OAuth findings detected.' : 'No results match your filters.'}
              </CardContent>
            </Card>
          ) : (
            filteredFindings.map((finding, i) => (
              <motion.div
                key={`${finding.servicePrincipalId}-${finding.findingType}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn('rounded-lg border p-4', severityBorder(finding.severity))}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className={cn('h-4 w-4 mt-0.5 flex-shrink-0', getRiskColor(finding.severity))} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{finding.title}</p>
                      <Badge variant="outline" className="text-xs capitalize">{finding.severity}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{finding.servicePrincipalName}</p>
                    <p className="text-sm mt-2">{finding.description}</p>
                    {finding.affectedScopes && finding.affectedScopes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {finding.affectedScopes.slice(0, 6).map((scope) => (
                          <code key={scope} className="text-xs bg-muted px-1.5 py-0.5 rounded">{scope}</code>
                        ))}
                        {finding.affectedScopes.length > 6 && (
                          <span className="text-xs text-muted-foreground">+{finding.affectedScopes.length - 6} more</span>
                        )}
                      </div>
                    )}
                    {finding.affectedUserCount !== undefined && finding.affectedUserCount > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">{finding.affectedUserCount} affected user(s)</p>
                    )}
                    {finding.recommendation && (
                      <div className="mt-3 flex items-start gap-2 rounded border border-primary/20 bg-primary/5 p-2.5">
                        <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                        <p className="text-xs text-muted-foreground">{finding.recommendation}</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* ---- APPS TAB ---- */}
      {activeTab === 'apps' && (
        <div className="space-y-2">
          {filteredApps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">No apps match your filters.</CardContent>
            </Card>
          ) : (
            filteredApps.map(([sp, score], i) => (
              <motion.div
                key={sp.objectId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <button
                  className="w-full text-left rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
                  onClick={() => setExpandedApp(expandedApp === sp.objectId ? null : sp.objectId)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold flex-shrink-0', i < 3 ? 'bg-red-500/20 text-red-500' : 'bg-muted text-muted-foreground')}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{sp.displayName}</p>
                      <p className="text-xs text-muted-foreground">{sp.appType?.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold">{score.totalScore}</p>
                        <p className="text-xs text-muted-foreground">score</p>
                      </div>
                      <RiskBadge level={score.riskLevel} />
                      {expandedApp === sp.objectId ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                </button>

                {expandedApp === sp.objectId && score.factors && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="border border-t-0 rounded-b-lg bg-muted/30 p-4 space-y-2"
                  >
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Risk Factors</p>
                    {score.factors.map((factor, fi) => (
                      <div key={fi} className="flex items-start justify-between gap-4 text-sm">
                        <div className="flex-1">
                          <p className="font-medium">{factor.name}</p>
                          <p className="text-xs text-muted-foreground">{factor.description}</p>
                          {factor.details && <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{factor.details}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono text-xs">{factor.score} × {factor.weight}</p>
                          <p className="text-xs text-muted-foreground">= {Math.round(factor.score * factor.weight)}</p>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* ---- CREDENTIALS TAB ---- */}
      {activeTab === 'credentials' && (
        <div className="space-y-3">
          {filteredCreds.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {credFindings.length === 0 ? 'No expiring or expired credentials found.' : 'No results match your filters.'}
              </CardContent>
            </Card>
          ) : (
            filteredCreds.map((cred, i) => (
              <motion.div
                key={`${cred.appId}-${cred.expiryDate}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn('rounded-lg border p-4', severityBorder(cred.severity))}
              >
                <div className="flex items-start gap-3">
                  <Key className={cn('h-4 w-4 mt-0.5 flex-shrink-0', getRiskColor(cred.severity))} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{cred.appName}</p>
                      <Badge variant="outline" className="text-xs capitalize">{cred.severity}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{cred.credentialType}</Badge>
                    </div>
                    {cred.credentialName && (
                      <p className="text-xs text-muted-foreground mt-0.5">{cred.credentialName}</p>
                    )}
                    <p className={cn('text-sm mt-1', cred.expiresInDays < 0 ? 'text-red-500' : getRiskColor(cred.severity))}>
                      {cred.expiresInDays < 0
                        ? `Expired ${Math.abs(cred.expiresInDays)} day(s) ago`
                        : `Expires in ${cred.expiresInDays} day(s) (${formatDate(cred.expiryDate)})`}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
