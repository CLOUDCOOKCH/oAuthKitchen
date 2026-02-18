import { useState } from 'react'
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
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import RiskBadge from '@/components/RiskBadge'
import { useScanStore } from '@/lib/store'
import { getTopRiskyApps } from '@/types/models'
import { formatDate, cn, getRiskColor } from '@/lib/utils'

type Tab = 'findings' | 'apps' | 'credentials'

export default function ScanDetail() {
  const { currentScan } = useScanStore()
  const [activeTab, setActiveTab] = useState<Tab>('findings')
  const [search, setSearch] = useState('')
  const [expandedApp, setExpandedApp] = useState<string | null>(null)

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

  const topRisky = getTopRiskyApps(currentScan)
  const findings = currentScan.shadowFindings || []
  const credFindings = currentScan.credentialFindings || []

  const filteredFindings = findings.filter(
    (f) =>
      f.servicePrincipalName.toLowerCase().includes(search.toLowerCase()) ||
      f.title.toLowerCase().includes(search.toLowerCase())
  )

  const filteredApps = topRisky.filter(([sp]) =>
    sp.displayName.toLowerCase().includes(search.toLowerCase())
  )

  const filteredCreds = credFindings.filter((c) =>
    c.appName.toLowerCase().includes(search.toLowerCase())
  )

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-red-500/30 bg-red-500/5'
      case 'high': return 'border-orange-500/30 bg-orange-500/5'
      case 'medium': return 'border-yellow-500/30 bg-yellow-500/5'
      default: return 'border-green-500/30 bg-green-500/5'
    }
  }

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

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
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

      {/* Tab Content */}
      {activeTab === 'findings' && (
        <div className="space-y-3">
          {filteredFindings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {findings.length === 0 ? 'No shadow OAuth findings detected.' : 'No results match your search.'}
              </CardContent>
            </Card>
          ) : (
            filteredFindings.map((finding, i) => (
              <motion.div
                key={`${finding.servicePrincipalId}-${finding.findingType}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn('rounded-lg border p-4', severityColor(finding.severity))}
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
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {activeTab === 'apps' && (
        <div className="space-y-2">
          {filteredApps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">No apps match your search.</CardContent>
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

      {activeTab === 'credentials' && (
        <div className="space-y-3">
          {filteredCreds.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {credFindings.length === 0 ? 'No expiring or expired credentials found.' : 'No results match your search.'}
              </CardContent>
            </Card>
          ) : (
            filteredCreds.map((cred, i) => (
              <motion.div
                key={`${cred.appId}-${cred.expiryDate}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn('rounded-lg border p-4', severityColor(cred.severity))}
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
