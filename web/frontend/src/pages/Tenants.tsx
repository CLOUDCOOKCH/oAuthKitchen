import { Navigate } from 'react-router-dom'

// Tenants page replaced by Settings — redirect to preserve old links
export default function Tenants() {
  return <Navigate to="/settings" replace />
}
