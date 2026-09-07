import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context'
import { useGlobalSettings } from '../context/GlobalSettingsContext'
import type { GlobalModuleFlag } from '../services/configService'
import type { UserPermissions } from '../services/userService'

interface ModulePermissionRouteProps {
  permission: keyof UserPermissions
  module: GlobalModuleFlag
  redirectTo?: string
}

export function ModulePermissionRoute({
  permission,
  module,
  redirectTo = '/intranet',
}: ModulePermissionRouteProps) {
  const { userProfile, profileLoading } = useAuth()
  const { settings, loading: settingsLoading } = useGlobalSettings()

  if (profileLoading || settingsLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          <p className="text-sm text-neutral-500 dark:text-gray-400">Verificando acceso...</p>
        </div>
      </div>
    )
  }

  const moduleEnabled = settings[module]
  const hasPermission = userProfile?.permissions[permission]

  if (!moduleEnabled || !hasPermission) {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}
