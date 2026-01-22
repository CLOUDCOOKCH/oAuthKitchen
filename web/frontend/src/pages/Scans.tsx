import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Play,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Eye,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import RiskBadge from '@/components/RiskBadge'
import { getScans, getTenants, createScan, deleteScan } from '@/lib/api'
import { formatDate, formatRelativeTime, cn } from '@/lib/utils'

export default function Scans() {
  const queryClient = useQueryClient()
  const [selectedTenant, setSelectedTenant] = useState<number | null>(null)

  const { data: scans = [], isLoading: scansLoading } = useQuery({
    queryKey: ['scans'],
    queryFn: () => getScans(),
    refetchInterval: 5000, // Poll for status updates
  })

  const { data: tenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: getTenants,
  })

  const createScanMutation = useMutation({
    mutationFn: (tenantId: number) => createScan(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] })
      setSelectedTenant(null)
    },
  })

  const deleteScanMutation = useMutation({
    mutationFn: deleteScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] })
    },
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scans</h1>
          <p className="text-muted-foreground">
            View and manage security scans
          </p>
        </div>

        {/* New Scan Section */}
        <div className="flex items-center gap-2">
          <select
            value={selectedTenant ?? ''}
            onChange={(e) => setSelectedTenant(e.target.value ? Number(e.target.value) : null)}
            className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select tenant...</option>
            {tenants.map((tenant: any) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => selectedTenant && createScanMutation.mutate(selectedTenant)}
            disabled={!selectedTenant || createScanMutation.isPending}
          >
            {createScanMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Scan
              </>
            )}
          </Button>
        </div>
      </div>

      {/* No Tenants Warning */}
      {tenants.length === 0 && (
        <Card className="border-yellow-500/20 bg-yellow-500/10">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="font-medium">No tenants configured</p>
              <p className="text-sm text-muted-foreground">
                Add a tenant configuration before starting a scan.
              </p>
            </div>
            <Link to="/tenants" className="ml-auto">
              <Button variant="outline">Add Tenant</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Scans List */}
      <Card>
        <CardHeader>
          <CardTitle>Scan History</CardTitle>
        </CardHeader>
        <CardContent>
          {scansLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : scans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No scans yet. Select a tenant and start a scan.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scans.map((scan: any, index: number) => (
                <motion.div
                  key={scan.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {getStatusIcon(scan.status)}
                  </div>

                  {/* Scan Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{scan.tenant_name}</p>
                      <Badge variant="outline" className="text-xs">
                        {scan.mode}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{formatRelativeTime(scan.created_at)}</span>
                      {scan.status === 'completed' && (
                        <>
                          <span>•</span>
                          <span>{scan.total_service_principals} apps</span>
                          <span>•</span>
                          <span>{scan.shadow_findings_count} findings</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Risk Badges */}
                  {scan.status === 'completed' && (
                    <div className="flex items-center gap-2">
                      {scan.critical_count > 0 && (
                        <div className="flex items-center gap-1">
                          <RiskBadge level="critical" />
                          <span className="text-xs font-medium">{scan.critical_count}</span>
                        </div>
                      )}
                      {scan.high_risk_count > 0 && (
                        <div className="flex items-center gap-1">
                          <RiskBadge level="high" />
                          <span className="text-xs font-medium">{scan.high_risk_count}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Message */}
                  {scan.status === 'failed' && scan.error_message && (
                    <p className="text-sm text-red-500 truncate max-w-xs">
                      {scan.error_message}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {scan.status === 'completed' && (
                      <Link to={`/scans/${scan.id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteScanMutation.mutate(scan.id)}
                      disabled={scan.status === 'running' || deleteScanMutation.isPending}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}