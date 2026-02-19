import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider, useIsAuthenticated, useMsal } from '@azure/msal-react'
import { buildMsalConfig } from '@/lib/msalConfig'
import { useSettingsStore } from '@/lib/store'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Scans from '@/pages/Scans'
import ScanDetail from '@/pages/ScanDetail'
import Permissions from '@/pages/Permissions'
import Settings from '@/pages/Settings'
import Login from '@/pages/Login'
import Landing from '@/pages/Landing'

// ============================================================================
// PROTECTED ROUTE
// ============================================================================

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useIsAuthenticated()
  const { instance, inProgress } = useMsal()

  if (inProgress !== 'none') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Silence unused-variable warning — instance is used indirectly via hooks
  void instance

  return <>{children}</>
}

// ============================================================================
// INNER APP (rendered inside MsalProvider)
// ============================================================================

function AppRoutes() {
  return (
    <Routes>
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/settings" element={<Settings />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/scans" element={<Scans />} />
                <Route path="/scans/:id" element={<ScanDetail />} />
                <Route path="/permissions" element={<Permissions />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

// ============================================================================
// ROOT APP — initialises MSAL dynamically from persisted settings
// ============================================================================

export default function App() {
  const { settings, isConfigured } = useSettingsStore()
  const [msalInstance, setMsalInstance] = useState<PublicClientApplication | null>(null)
  const [msalError, setMsalError] = useState<string | null>(null)

  useEffect(() => {
    if (!isConfigured) {
      setMsalInstance(null)
      return
    }

    let cancelled = false

    const config = buildMsalConfig(settings.clientId, settings.tenantId)
    const instance = new PublicClientApplication(config)

    instance
      .initialize()
      .then(() => {
        if (!cancelled) setMsalInstance(instance)
      })
      .catch((err) => {
        if (!cancelled) setMsalError(String(err))
      })

    return () => {
      cancelled = true
    }
  }, [settings.clientId, settings.tenantId, isConfigured])

  // Not configured → landing page, settings accessible
  if (!isConfigured) {
    return (
      <Routes>
        <Route path="/"        element={<Landing />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*"        element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  // MSAL errored
  if (msalError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <p className="text-red-500 font-semibold">Failed to initialise Microsoft login</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">{msalError}</p>
        <Routes>
          <Route path="*" element={<Settings />} />
        </Routes>
      </div>
    )
  }

  // MSAL not yet ready
  if (!msalInstance) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <MsalProvider instance={msalInstance}>
      <AppRoutes />
    </MsalProvider>
  )
}
