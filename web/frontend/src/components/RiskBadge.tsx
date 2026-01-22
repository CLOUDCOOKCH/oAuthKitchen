import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface RiskBadgeProps {
  level: string
  className?: string
}

export default function RiskBadge({ level, className }: RiskBadgeProps) {
  const variant = level.toLowerCase() as 'critical' | 'high' | 'medium' | 'low'

  return (
    <Badge
      variant={variant}
      className={cn('capitalize', className)}
    >
      {level}
    </Badge>
  )
}