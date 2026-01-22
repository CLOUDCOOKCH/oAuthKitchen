import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Search,
  Shield,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Loader2,
  BookOpen,
  Zap,
  Lock,
  Users,
  Mail,
  FileText,
  Settings,
  Database,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  translatePermission,
  getHighImpactPermissions,
  getPermissionCategories,
} from '@/lib/api'
import { cn, getRiskLevelColor } from '@/lib/utils'

interface PermissionInfo {
  permission: string
  display_name: string
  description: string
  category: string
  risk_score: number
  risk_level: string
  abuse_scenarios: string[]
  remediation: string
}

const categoryIcons: Record<string, any> = {
  'Mail': Mail,
  'Files': FileText,
  'Directory': Users,
  'Applications': Settings,
  'Security': Shield,
  'All': Database,
}

export default function Permissions() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPermission, setSelectedPermission] = useState<PermissionInfo | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [isSearching, setIsSearching] = useState(false)

  const { data: categories = [] } = useQuery({
    queryKey: ['permission-categories'],
    queryFn: getPermissionCategories,
  })

  const { data: highImpactPermissions = [], isLoading: isLoadingHighImpact } = useQuery({
    queryKey: ['high-impact-permissions'],
    queryFn: () => getHighImpactPermissions(70),
  })

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const result = await translatePermission(searchQuery.trim())
      setSelectedPermission(result)
    } catch (error) {
      console.error('Failed to translate permission:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const selectPermission = async (permission: string) => {
    setIsSearching(true)
    try {
      const result = await translatePermission(permission)
      setSelectedPermission(result)
    } catch (error) {
      console.error('Failed to translate permission:', error)
    } finally {
      setIsSearching(false)
    }
  }

  // Group high impact permissions by category
  const permissionsByCategory = highImpactPermissions.reduce((acc: Record<string, PermissionInfo[]>, perm: PermissionInfo) => {
    const category = perm.category || 'Other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(perm)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Permission Explorer</h1>
        <p className="text-muted-foreground">
          Translate Microsoft Graph permissions to plain English and understand their risk
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter a permission (e.g., Mail.Read, User.ReadWrite.All)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Translate'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Permission Details */}
        <Card className="lg:row-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Permission Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedPermission ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Permission Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold font-mono">
                      {selectedPermission.permission}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedPermission.display_name}
                    </p>
                  </div>
                  <Badge className={cn(getRiskLevelColor(selectedPermission.risk_level))}>
                    {selectedPermission.risk_level}
                  </Badge>
                </div>

                {/* Risk Score */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Risk Score</span>
                    <span className="font-medium">{selectedPermission.risk_score}/100</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${selectedPermission.risk_score}%` }}
                      transition={{ duration: 0.5 }}
                      className={cn(
                        'h-full rounded-full',
                        selectedPermission.risk_score >= 80
                          ? 'bg-red-500'
                          : selectedPermission.risk_score >= 60
                          ? 'bg-orange-500'
                          : selectedPermission.risk_score >= 40
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      )}
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-500" />
                    What it does
                  </h4>
                  <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
                    {selectedPermission.description}
                  </p>
                </div>

                {/* Category */}
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Category:</span>
                  <Badge variant="outline">{selectedPermission.category}</Badge>
                </div>

                {/* Abuse Scenarios */}
                {selectedPermission.abuse_scenarios && selectedPermission.abuse_scenarios.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      Potential Abuse Scenarios
                    </h4>
                    <ul className="space-y-2">
                      {selectedPermission.abuse_scenarios.map((scenario, index) => (
                        <motion.li
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Zap className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{scenario}</span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Remediation */}
                {selectedPermission.remediation && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-500" />
                      Remediation Guidance
                    </h4>
                    <p className="text-sm text-muted-foreground bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                      {selectedPermission.remediation}
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">Search for a permission</p>
                <p className="text-sm text-muted-foreground">
                  Enter a Microsoft Graph permission above or select one from the high-impact list
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* High Impact Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              High-Impact Permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingHighImpact ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {Object.entries(permissionsByCategory).map(([category, permissions]) => {
                  const CategoryIcon = categoryIcons[category] || Shield
                  const isExpanded = expandedCategories.has(category)

                  return (
                    <div key={category} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between p-3 hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{category}</span>
                          <Badge variant="secondary" className="text-xs">
                            {(permissions as PermissionInfo[]).length}
                          </Badge>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          className="border-t"
                        >
                          {(permissions as PermissionInfo[]).map((perm) => (
                            <button
                              key={perm.permission}
                              onClick={() => selectPermission(perm.permission)}
                              className={cn(
                                'w-full flex items-center justify-between p-2 pl-10 text-sm hover:bg-secondary/50 transition-colors',
                                selectedPermission?.permission === perm.permission && 'bg-secondary'
                              )}
                            >
                              <span className="font-mono text-xs">{perm.permission}</span>
                              <Badge
                                variant="outline"
                                className={cn('text-xs', getRiskLevelColor(perm.risk_level))}
                              >
                                {perm.risk_score}
                              </Badge>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Categories Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Permission Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((category: string, index: number) => {
                const CategoryIcon = categoryIcons[category] || Shield
                return (
                  <motion.button
                    key={category}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => {
                      setExpandedCategories(new Set([category]))
                    }}
                    className="flex items-center gap-2 p-3 rounded-lg border hover:bg-secondary/50 transition-colors text-left"
                  >
                    <CategoryIcon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{category}</span>
                  </motion.button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Level Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { level: 'Critical', range: '90-100', color: 'bg-red-500', description: 'Immediate security concern, enables full compromise' },
              { level: 'High', range: '70-89', color: 'bg-orange-500', description: 'Significant data access or privilege escalation potential' },
              { level: 'Medium', range: '40-69', color: 'bg-yellow-500', description: 'Notable access that should be reviewed' },
              { level: 'Low', range: '0-39', color: 'bg-green-500', description: 'Limited access with minimal risk' },
            ].map((item, index) => (
              <motion.div
                key={item.level}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50"
              >
                <div className={cn('w-3 h-3 rounded-full mt-1', item.color)} />
                <div>
                  <p className="font-medium">{item.level}</p>
                  <p className="text-xs text-muted-foreground">{item.range}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}