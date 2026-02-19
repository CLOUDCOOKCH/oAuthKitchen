/**
 * Store barrel — re-exports all Zustand stores for convenience.
 *
 * Auth is now handled entirely by MSAL via @azure/msal-react hooks
 * (useMsal, useIsAuthenticated, useAccount). This store only tracks
 * a thin flag used for ProtectedRoute before MSAL finishes initialising.
 */

export { useSettingsStore } from './settingsStore'
export type { AppSettings } from './settingsStore'

export { useScanStore } from './scanStore'
export type { ScanSummary } from './scanStore'
