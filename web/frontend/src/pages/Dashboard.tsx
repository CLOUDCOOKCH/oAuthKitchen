import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ShieldAlert,
  ShieldX,
  Activity,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Key,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import StatsCard from '@/components/StatsCard'
import RiskBadge from '@/components/RiskBadge'
import { useScanStore } from '@/lib/store'
import { getTopRiskyApps } from '@/types/models'
import { formatDate, cn } from '@/lib/utils'

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#6b7280']

export default function Dashboard() {
  const { currentScan, scanHistory } = useScanStore()

  const topRisky = useMemo(
    () => (currentScan ? getTopRiskyApps(currentScan) : []),
    [currentScan]
  )

  const { pieData, barData } = useMemo(() => {
    if (!currentScan) return { pieData: [], barData: [] }
    const findingsByType: Record<string, number> = {}
    for (const finding of currentScan.shadowFindings || []) {
      const label = finding.findingType.replace(/_/g, ' ')
      findingsByType[label] = (findingsByType[label] || 0) + 1
    }
    const pd = Object.entries(findingsByType).map(([name, value]) => ({ name, value }))
    const riskDist = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const score of Object.values(currentScan.riskScores || {})) {
      const level = score.riskLevel as keyof typeof riskDist
      if (level in riskDist) riskDist[level]++
    }
    const bd = [
      { name: 'Critical', value: riskDist.critical, fill: '#ef4444' },
      { name: 'High', value: riskDist.high, fill: '#f97316' },
      { name: 'Medium', value: riskDist.medium, fill: '#eab308' },
      { name: 'Low', value: riskDist.low, fill: '#22c55e' },
    ]
    return { pieData: pd, barData: bd }
  }, [currentScan])

  if (!currentScan) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Overview of your OAuth security posture</p>
          </div>
          <Link to="/scans">
            <Button className="group">
              Run First Scan
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Activity className="h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No scan data yet</h2>
            <p className="text-muted-foreground text-sm text-center max-w-sm">
              Run your first scan to see the OAuth security posture of your Microsoft Entra ID
              tenant.
            </p>
            <Link to="/scans">
              <Button>Start Scan</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Last scan: {formatDate(currentScan.analysisTimestamp)} ·{' '}
            <span className="capitalize">{currentScan.mode} mode</span>
          </p>
        </div>
        <Link to="/scans">
          <Button className="group">
            New Scan
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Service Principals"
          value={currentScan.totalServicePrincipals ?? 0}
          icon={Activity}
          delay={0}
        />
        <StatsCard
          title="Critical Risk"
          value={currentScan.criticalCount ?? 0}
          icon={ShieldX}
          variant="critical"
          delay={0.1}
        />
        <StatsCard
          title="High Risk"
          value={currentScan.highRiskCount ?? 0}
          icon={ShieldAlert}
          variant="high"
          delay={0.2}
        />
        <StatsCard
          title="Shadow Findings"
          value={currentScan.shadowFindings?.length ?? 0}
          icon={AlertTriangle}
          variant="high"
          delay={0.3}
        />
      </div>

      {(currentScan.expiringCredentials30Days ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4"
        >
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-yellow-500" />
            <p className="font-medium">
              {currentScan.expiringCredentials30Days} credential(s) expiring within 30 days
            </p>
          </div>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Findings by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          borderColor: 'hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-1">
                  {pieData.slice(0, 4).map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="capitalize">{item.name}</span>
                      </div>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                No shadow findings
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {topRisky.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-orange-500" />
              Top Risky Applications
            </CardTitle>
            <Link to="/scans">
              <Button variant="ghost" size="sm">View full results</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topRisky.slice(0, 8).map(([sp, score], i) => (
                <div key={sp.objectId} className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                  <div className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold flex-shrink-0',
                    i === 0 ? 'bg-red-500/20 text-red-500' : i === 1 ? 'bg-orange-500/20 text-orange-500' : 'bg-yellow-500/20 text-yellow-500'
                  )}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{sp.displayName}</p>
                    <p className="text-xs text-muted-foreground">Score: {score.totalScore}</p>
                  </div>
                  <RiskBadge level={score.riskLevel} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {scanHistory.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recent Scans</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scanHistory.slice(0, 5).map((scan) => (
                <div key={scan.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/30">
                  <div>
                    <p className="text-sm font-medium">{scan.tenantId}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(scan.startedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {scan.criticalCount > 0 && <RiskBadge level="critical" />}
                    {scan.highRiskCount > 0 && <RiskBadge level="high" />}
                    <span className={cn('text-xs font-medium', scan.status === 'completed' ? 'text-green-500' : scan.status === 'failed' ? 'text-red-500' : 'text-blue-500')}>
                      {scan.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
