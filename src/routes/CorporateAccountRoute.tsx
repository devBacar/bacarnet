import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context'
import { isExternalAccount } from '../services/userService'

/** Usuarios corporativos activos; cuentas externas usan una experiencia reducida sin Ayuda. */
export function CorporateAccountRoute() {
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

  if (isExternalAccount(userProfile)) {
    return <Navigate to="/intranet" replace />
  }

  return <Outlet />
}
