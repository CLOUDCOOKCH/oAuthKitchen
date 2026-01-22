import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  AlertTriangle,
  Shield,
  Users,
  Check,
  Clock,
  FileText,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import StatsCard from '@/components/StatsCard'
import RiskBadge from '@/components/RiskBadge'
import { getScan, getScanFindings, acknowledgeFinding } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import { useState } from 'react'

export default function ScanDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [selectedFinding, setSelectedFinding] = useState<any>(null)

  const { data: scan, isLoading: scanLoading } = useQuery({
    queryKey: ['scan', id],
    queryFn: () => getScan(Number(id)),
    enabled: !!id,
  })

  const { data: findings = [] } = useQuery({
    queryKey: ['scan-findings', id],
    queryFn: () => getScanFindings(Number(id)),
    enabled: !!id,
  })

  const acknowledgeMutation = useMutation({
    mutationFn: ({ findingId, notes }: { findingId: number; notes?: string }) =>
      acknowledgeFinding(Number(id), findingId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan-findings', id] })
      setSelectedFinding(null)
    },
  })

  if (scanLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!scan) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Scan not found</p>
        <Link to="/scans">
          <Button variant="outline" className="mt-4">
            Back to Scans
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/scans">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{scan.tenant_name}</h1>
          <p className="text-muted-foreground">
            Scan completed {formatDate(scan.completed_at)}
          </p>
        </div>
        <Badge variant="outline" className="ml-auto">
          {scan.mode} mode
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatsCard
          title="Applications"
          value={scan.total_apps}
          icon={FileText}
          delay={0}
        />
        <StatsCard
          title="Service Principals"
          value={scan.total_service_principals}
          icon={Shield}
          delay={0.1}
        />
        <StatsCard
          title="Critical"
          value={scan.critical_count}
          icon={AlertTriangle}
          variant="critical"
          delay={0.2}
        />
        <StatsCard
          title="High Risk"
          value={scan.high_risk_count}
          icon={AlertTriangle}
          variant="high"
          delay={0.3}
        />
        <StatsCard
          title="Findings"
          value={scan.shadow_findings_count}
          icon={Users}
          delay={0.4}
        />
      </div>

      {/* Findings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Security Findings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {findings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No findings detected in this scan.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {findings.map((finding: any, index: number) => (
                <motion.div
                  key={finding.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    'rounded-lg border p-4',
                    finding.severity === 'Critical'
                      ? 'border-red-500/30 bg-red-500/5'
                      : finding.severity === 'High'
                      ? 'border-orange-500/30 bg-orange-500/5'
                      : finding.severity === 'Medium'
                      ? 'border-yellow-500/30 bg-yellow-500/5'
                      : 'border-green-500/30 bg-green-500/5'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <RiskBadge level={finding.severity} />
                        <h3 className="font-semibold">{finding.title}</h3>
                        {finding.is_acknowledged && (
                          <Badge variant="outline" className="text-green-500 border-green-500/30">
                            <Check className="h-3 w-3 mr-1" />
                            Acknowledged
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {finding.description}
                      </p>

                      {/* App Info */}
                      <div className="text-sm mb-3">
                        <span className="text-muted-foreground">App: </span>
                        <span className="font-medium">{finding.service_principal_name}</span>
                      </div>

                      {/* Affected Scopes */}
                      {finding.affected_scopes?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {finding.affected_scopes.map((scope: string) => (
                            <Badge key={scope} variant="secondary" className="text-xs font-mono">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Affected Users */}
                      {finding.affected_user_count > 0 && (
                        <p className="text-sm text-muted-foreground">
                          <Users className="h-4 w-4 inline mr-1" />
                          {finding.affected_user_count} affected users
                        </p>
                      )}

                      {/* Recommendation */}
                      {finding.recommendation && (
                        <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                          <p className="text-sm">
                            <span className="font-medium text-primary">Recommendation: </span>
                            {finding.recommendation}
                          </p>
                        </div>
                      )}

                      {/* Acknowledgment Notes */}
                      {finding.is_acknowledged && finding.notes && (
                        <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                          <p className="text-sm">
                            <span className="font-medium text-green-500">Notes: </span>
                            {finding.notes}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Acknowledged by {finding.acknowledged_by} on{' '}
                            {formatDate(finding.acknowledged_at)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!finding.is_acknowledged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedFinding(finding)}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Risky Apps */}
      {scan.results?.top_risky_apps?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Risky Applications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scan.results.top_risky_apps.map((app: any, index: number) => (
                <div
                  key={app.app_id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-accent/50"
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
                  <div className="flex-1">
                    <p className="font-medium">{app.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {app.app_type.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{app.risk_score}</p>
                    <RiskBadge level={app.risk_level} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Acknowledge Dialog */}
      {selectedFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Acknowledge Finding</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedFinding.title}
              </p>
              <textarea
                placeholder="Add notes (optional)..."
                className="w-full h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                id="ack-notes"
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setSelectedFinding(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const notes = (document.getElementById('ack-notes') as HTMLTextAreaElement)?.value
                    acknowledgeMutation.mutate({
                      findingId: selectedFinding.id,
                      notes: notes || undefined,
                    })
                  }}
                  disabled={acknowledgeMutation.isPending}
                >
                  Acknowledge
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}