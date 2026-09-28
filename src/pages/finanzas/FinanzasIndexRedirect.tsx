import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context'
import { FINANZAS_DEFAULT_PATH } from '../../components/finanzas/finanzasNavConfig'
import { hasFinanzasAccess } from '../../services/userService'

export function FinanzasIndexRedirect() {
  const { userProfile, profileLoading } = useAuth()
  if (profileLoading) return null
  if (!hasFinanzasAccess(userProfile)) {
    return <Navigate to="/finanzas/cajas" replace />
  }
  return <Navigate to={FINANZAS_DEFAULT_PATH} replace />
}
