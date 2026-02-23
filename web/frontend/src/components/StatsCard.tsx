import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; positive: boolean }
  variant?: 'default' | 'critical' | 'high' | 'medium' | 'low'
  delay?: number
}

export default function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  delay = 0,
}: StatsCardProps) {
  const variants = {
    default: 'from-amber-500/10 to-orange-500/10 border-amber-500/20',
    critical: 'from-red-500/10 to-red-600/10 border-red-500/20',
    high: 'from-orange-500/10 to-orange-600/10 border-orange-500/20',
    medium: 'from-yellow-500/10 to-yellow-600/10 border-yellow-500/20',
    low: 'from-green-500/10 to-green-600/10 border-green-500/20',
  }

  const iconColors = {
    default: 'text-amber-500',
    critical: 'text-red-500',
    high: 'text-orange-500',
    medium: 'text-yellow-500',
    low: 'text-green-500',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        'relative overflow-hidden rounded-xl border bg-gradient-to-br p-5',
        variants[variant]
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p
              className={cn(
                'mt-2 text-xs font-medium',
                trend.positive ? 'text-green-500' : 'text-red-500'
              )}
            >
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div
          className={cn(
            'rounded-lg p-2.5',
            variant === 'default' ? 'bg-amber-500/10' : `bg-${variant}-500/10`
          )}
        >
          <Icon className={cn('h-5 w-5', iconColors[variant])} />
        </div>
      </div>

      {/* Decorative gradient */}
      <div
        className={cn(
          'absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl',
          variant === 'default'
            ? 'bg-amber-500'
            : variant === 'critical'
            ? 'bg-red-500'
            : variant === 'high'
            ? 'bg-orange-500'
            : variant === 'medium'
            ? 'bg-yellow-500'
            : 'bg-green-500'
        )}
      />
    </motion.div>
  )
}