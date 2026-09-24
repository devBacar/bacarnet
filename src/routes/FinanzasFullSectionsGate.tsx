import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context'
import { hasFinanzasAccess } from '../services/userService'

/** Saldos y Agenda: requiere view_finanzas (no alcanza ser solo responsable de caja). */
export function FinanzasFullSectionsGate() {
  const { userProfile, profileLoading } = useAuth()

  if (profileLoading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <div className="spinner-brand h-6 w-6 animate-spin rounded-full border-4" />
      </div>
    )
  }

  if (!hasFinanzasAccess(userProfile)) {
    return <Navigate to="/finanzas/cajas" replace />
  }

  return <Outlet />
}
