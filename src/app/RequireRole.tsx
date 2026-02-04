import { Navigate } from 'react-router-dom'
import type { Role } from '../lib/types'
import { useAuth } from '../features/auth/AuthProvider'

export const RequireRole = ({
  roles,
  children,
}: {
  roles: Role[]
  children: React.ReactNode
}) => {
  const { userDoc, loading } = useAuth()
  if (loading) {
    return (
      <div className="page">
        <div className="card">Yüklənir...</div>
      </div>
    )
  }
  if (!userDoc) {
    return <Navigate to="/login" replace />
  }
  if (!roles.includes(userDoc.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
