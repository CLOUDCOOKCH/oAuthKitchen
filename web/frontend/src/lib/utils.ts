import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return 'Unknown'
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  } catch {
    return 'Unknown'
  }
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return 'N/A'
  try {
    return format(new Date(date), 'MMM d, yyyy HH:mm')
  } catch {
    return 'N/A'
  }
}

export function formatScore(score: number): string {
  return Math.round(score).toString()
}

export function getRiskColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'critical':
      return 'text-red-500'
    case 'high':
      return 'text-orange-500'
    case 'medium':
      return 'text-yellow-500'
    case 'low':
      return 'text-green-500'
    default:
      return 'text-muted-foreground'
  }
}

export function getRiskBgColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'critical':
      return 'bg-red-500/10 border-red-500/20'
    case 'high':
      return 'bg-orange-500/10 border-orange-500/20'
    case 'medium':
      return 'bg-yellow-500/10 border-yellow-500/20'
    case 'low':
      return 'bg-green-500/10 border-green-500/20'
    default:
      return 'bg-muted/10 border-muted/20'
  }
}
