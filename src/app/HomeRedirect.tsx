import { Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'

export const HomeRedirect = () => {
  const { userDoc } = useAuth()
  if (!userDoc) {
    return <Navigate to="/login" replace />
  }
  if (userDoc.role === 'superadmin') {
    return <Navigate to="/admin/dashboard" replace />
  }
  if (userDoc.role === 'branch_admin') {
    return <Navigate to="/branch" replace />
  }
  if (userDoc.role === 'moderator') {
    return <Navigate to="/branch" replace />
  }
  return <Navigate to="/vote" replace />
}
