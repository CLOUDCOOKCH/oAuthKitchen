import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Building2,
  Scan,
  AlertTriangle,
  ShieldAlert,
  ShieldX,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import StatsCard from '@/components/StatsCard'
import RiskBadge from '@/components/RiskBadge'
import { getDashboardStats } from '@/lib/api'
import { formatRelativeTime, cn } from '@/lib/utils'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#6b7280']

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => getDashboardStats(30),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const pieData = stats?.findings_by_type
    ? Object.entries(stats.findings_by_type).map(([name, value]) => ({
        name: name.replace(/_/g, ' '),
        value,
      }))
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your OAuth security posture
          </p>
        </div>
        <Link to="/scans">
          <Button className="group">
            New Scan
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Tenants"
          value={stats?.total_tenants ?? 0}
          icon={Building2}
          delay={0}
        />
        <StatsCard
          title="Total Scans"
          value={stats?.total_scans ?? 0}
          icon={Scan}
          delay={0.1}
        />
        <StatsCard
          title="Critical Findings"
          value={stats?.critical_findings ?? 0}
          icon={ShieldX}
          variant="critical"
          delay={0.2}
        />
        <StatsCard
          title="High Risk"
          value={stats?.high_findings ?? 0}
          icon={ShieldAlert}
          variant="high"
          delay={0.3}
        />
      </div>

      {/* Unacknowledged Alert */}
      {(stats?.unacknowledged_findings ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <div className="flex-1">
              <p className="font-medium">
                {stats?.unacknowledged_findings} unacknowledged findings
              </p>
              <p className="text-sm text-muted-foreground">
                Review and acknowledge findings to track your remediation progress
              </p>
            </div>
            <Link to="/scans">
              <Button variant="outline" size="sm">
                Review
              </Button>
            </Link>
          </div>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Findings Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Findings Trend (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.findings_trend ?? []}>
                  <defs>
                    <linearGradient id="colorFindings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(210, 100%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(210, 100%, 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(210, 100%, 50%)"
                    fillOpacity={1}
                    fill="url(#colorFindings)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Findings by Type */}
        <Card>
          <CardHeader>
            <CardTitle>Findings by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No findings data
              </div>
            )}
            <div className="mt-4 space-y-2">
              {pieData.slice(0, 4).map((item, index) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="capitalize">{item.name}</span>
                  </div>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Scans */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Recent Scans
            </CardTitle>
            <Link to="/scans">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.recent_scans?.length ? (
                stats.recent_scans.map((scan: any) => (
                  <Link
                    key={scan.id}
                    to={`/scans/${scan.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="font-medium">{scan.tenant_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatRelativeTime(scan.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {scan.critical_count > 0 && (
                        <RiskBadge level="critical" />
                      )}
                      {scan.high_risk_count > 0 && (
                        <RiskBadge level="high" />
                      )}
                      <span
                        className={cn(
                          'text-sm font-medium',
                          scan.status === 'completed'
                            ? 'text-green-500'
                            : scan.status === 'running'
                            ? 'text-blue-500'
                            : scan.status === 'failed'
                            ? 'text-red-500'
                            : 'text-yellow-500'
                        )}
                      >
                        {scan.status}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No scans yet. Start by adding a tenant configuration.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Risky Apps */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-orange-500" />
              Top Risky Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.top_risky_apps?.length ? (
                stats.top_risky_apps.slice(0, 5).map((app: any, index: number) => (
                  <div
                    key={app.app_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-accent/50"
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
                        index === 0
                          ? 'bg-red-500/20 text-red-500'
                          : index === 1
                          ? 'bg-orange-500/20 text-orange-500'
                          : 'bg-yellow-500/20 text-yellow-500'
                      )}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{app.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Score: {app.risk_score}
                      </p>
                    </div>
                    <RiskBadge level={app.risk_level} />
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No risk data available
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
