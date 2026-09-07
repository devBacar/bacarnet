import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context'
import {
  isAccountPending,
  isAccountRejected,
} from '../services/userService'

export function AccountStatusRoute() {
  const { userProfile, profileLoading } = useAuth()

  if (profileLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          <p className="text-sm text-neutral-500 dark:text-gray-400">Verificando acceso...</p>
        </div>
      </div>
    )
  }

  if (isAccountPending(userProfile)) {
    return <Navigate to="/cuenta-pendiente" replace />
  }

  if (isAccountRejected(userProfile)) {
    return <Navigate to="/cuenta-rechazada" replace />
  }

  return <Outlet />
}
