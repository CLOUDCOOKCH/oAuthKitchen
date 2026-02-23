import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  AlertTriangle,
  ShieldX,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react'
import { useMsal, useAccount } from '@azure/msal-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useScanStore, useSettingsStore } from '@/lib/store'
import { runScan } from '@/lib/api/collectors/orchestrator'
import { formatDate } from '@/lib/utils'

export default function Scans() {
  const { instance, accounts } = useMsal()
  const account = useAccount(accounts[0] || null)
  const { settings } = useSettingsStore()
  const {
    currentScan,
    scanHistory,
    isScanning,
    scanProgress,
    scanPct,
    scanError,
    setCurrentScan,
    setIsScanning,
    setScanProgress,
    setScanError,
    addToHistory,
  } = useScanStore()
  const [activeTab, setActiveTab] = useState<'run' | 'history'>('run')

  const handleStartScan = async () => {
    if (!account) return

    setIsScanning(true)
    setScanError(null)
    setScanProgress('Starting scan…', 0)

    const scanId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    try {
      const result = await runScan(
        instance,
        account,
        settings.tenantId,
        {
          inactiveDaysThreshold: settings.inactiveDaysThreshold,
          credentialExpiryCriticalDays: settings.credentialExpiryCriticalDays,
          includeRemediation: true,
        },
        (msg, pct) => setScanProgress(msg, pct)
      )

      setCurrentScan(result)
      addToHistory({
        id: scanId,
        tenantId: result.tenantId,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'completed',
        totalApps: result.totalApps ?? 0,
        criticalCount: result.criticalCount ?? 0,
        highRiskCount: result.highRiskCount ?? 0,
        shadowFindingsCount: result.shadowFindings?.length ?? 0,
      })
      setActiveTab('history')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setScanError(msg)
      addToHistory({
        id: scanId,
        tenantId: settings.tenantId,
        startedAt,
        status: 'failed',
        totalApps: 0,
        criticalCount: 0,
        highRiskCount: 0,
        shadowFindingsCount: 0,
        errorMessage: msg,
      })
    } finally {
      setIsScanning(false)
      setScanProgress('')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scan</h1>
          <p className="text-muted-foreground">Analyse OAuth app security in your Entra ID tenant</p>
        </div>
        <div className="flex gap-2">
          <Button variant={activeTab === 'run' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('run')}>
            Run Scan
          </Button>
          <Button variant={activeTab === 'history' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('history')}>
            History ({scanHistory.length})
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'run' ? (
          <motion.div key="run" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <Card>
              <CardHeader><CardTitle>New Scan</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-accent/30 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tenant ID</span>
                    <span className="font-mono text-xs">{settings.tenantId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Signed in as</span>
                    <span className="text-xs">{account?.username || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mode</span>
                    <span>{settings.useLimitedScopes ? 'Limited (no sign-in data)' : 'Full'}</span>
                  </div>
                </div>

                {isScanning && (
                  <div className="space-y-2 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                      <p className="text-sm flex-1">{scanProgress || 'Running…'}</p>
                      <span className="text-xs text-muted-foreground font-mono">{scanPct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-primary/10 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${scanPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {scanError && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-500">Scan failed</p>
                      <p className="text-xs text-muted-foreground mt-1">{scanError}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleStartScan} disabled={isScanning || !account}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Retry
                    </Button>
                  </div>
                )}

                <Button className="w-full" size="lg" onClick={handleStartScan} disabled={isScanning || !account}>
                  {isScanning ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Scanning…</>
                  ) : (
                    <><Play className="h-4 w-4 mr-2" />Start Scan</>
                  )}
                </Button>

                {!account && (
                  <p className="text-sm text-center text-muted-foreground">Sign in with Microsoft to start a scan.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">What gets analysed</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {[
                    'All app registrations and their credentials',
                    'All enterprise apps (service principals) in the tenant',
                    'Delegated permission grants (OAuth2 consent)',
                    'Application permission assignments',
                    'App owners and orphaned application detection',
                    settings.useLimitedScopes ? null : 'Sign-in activity for inactive app detection',
                  ].filter(Boolean).map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Card>
              <CardHeader><CardTitle>Scan History</CardTitle></CardHeader>
              <CardContent>
                {scanHistory.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p>No scans yet. Run your first scan to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scanHistory.map((scan, index) => (
                      <motion.div
                        key={scan.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-shrink-0">
                          {scan.status === 'completed' ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : scan.status === 'failed' ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{scan.tenantId}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            <span>{formatDate(scan.startedAt)}</span>
                            {scan.status === 'completed' && (
                              <><span>·</span><span>{scan.totalApps} apps</span><span>·</span><span>{scan.shadowFindingsCount} findings</span></>
                            )}
                            {scan.status === 'failed' && scan.errorMessage && (
                              <span className="text-red-500 truncate max-w-xs">{scan.errorMessage}</span>
                            )}
                          </div>
                        </div>

                        {scan.status === 'completed' && (
                          <div className="flex items-center gap-2">
                            {scan.criticalCount > 0 && (
                              <div className="flex items-center gap-1">
                                <ShieldX className="h-3 w-3 text-red-500" />
                                <span className="text-xs font-medium text-red-500">{scan.criticalCount}</span>
                              </div>
                            )}
                            {scan.highRiskCount > 0 && (
                              <div className="flex items-center gap-1">
                                <ShieldAlert className="h-3 w-3 text-orange-500" />
                                <span className="text-xs font-medium text-orange-500">{scan.highRiskCount}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {scan.status === 'completed' && currentScan && (
                          <Link to="/scans/current">
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
