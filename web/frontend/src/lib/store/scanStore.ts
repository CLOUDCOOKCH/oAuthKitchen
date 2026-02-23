import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnalysisResult } from '@/types/models'

export interface ScanSummary {
  id: string
  tenantId: string
  tenantName?: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed'
  totalApps: number
  criticalCount: number
  highRiskCount: number
  shadowFindingsCount: number
  errorMessage?: string
}

interface ScanState {
  currentScan: AnalysisResult | null
  scanHistory: ScanSummary[]
  isScanning: boolean
  scanProgress: string
  scanPct: number
  scanError: string | null

  setCurrentScan: (result: AnalysisResult) => void
  setIsScanning: (scanning: boolean) => void
  setScanProgress: (progress: string, pct?: number) => void
  setScanError: (error: string | null) => void
  addToHistory: (summary: ScanSummary) => void
  clearHistory: () => void
}

export const useScanStore = create<ScanState>()(
  persist(
    (set) => ({
      currentScan: null,
      scanHistory: [],
      isScanning: false,
      scanProgress: '',
      scanPct: 0,
      scanError: null,

      setCurrentScan: (result) => set({ currentScan: result }),
      setIsScanning: (scanning) => set({ isScanning: scanning }),
      setScanProgress: (progress, pct) =>
        set((s) => ({ scanProgress: progress, scanPct: pct ?? s.scanPct })),
      setScanError: (error) => set({ scanError: error }),
      addToHistory: (summary) =>
        set((state) => ({
          scanHistory: [summary, ...state.scanHistory].slice(0, 20),
        })),
      clearHistory: () => set({ scanHistory: [], currentScan: null }),
    }),
    {
      name: 'oauthkitchen-scans',
      partialize: (state) => ({
        scanHistory: state.scanHistory,
        // Don't persist the full currentScan (too large)
      }),
    }
  )
)
