import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context'
import { isSuperAdmin } from '../services/userService'

/** super_admin siempre; usuarios piloto cuando rag.enabled=true (validado en la API). */
export function RagPilotRoute() {
  const { user, userProfile, loading, profileLoading } = useAuth()

  if (loading || profileLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  if (isSuperAdmin(userProfile)) {
    return <Outlet />
  }

  // Usuarios no super_admin: la página carga y la API devuelve 403 si no están en el piloto.
  return <Outlet />
}
