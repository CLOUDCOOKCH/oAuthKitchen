import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/lib/store'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Scans from '@/pages/Scans'
import ScanDetail from '@/pages/ScanDetail'
import Tenants from '@/pages/Tenants'
import Permissions from '@/pages/Permissions'
import Settings from '@/pages/Settings'
import Login from '@/pages/Login'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/scans" element={<Scans />} />
                <Route path="/scans/:id" element={<ScanDetail />} />
                <Route path="/tenants" element={<Tenants />} />
                <Route path="/permissions" element={<Permissions />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}