import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context'
import { useGlobalSettings } from '../context/GlobalSettingsContext'
import { queryKeys } from '../lib/queryKeys'
import { fetchCajasAcceso } from '../services/finanzasCajasApi'
import { permisosFinanzasDe } from '../services/userService'

/** Acceso al módulo Finanzas: ver pantallas, líder de cajas o encargado de alguna caja. */
export function FinanzasModuleGate() {
  const { user, userProfile, profileLoading } = useAuth()
  const { settings, loading: settingsLoading } = useGlobalSettings()
  const permisos = permisosFinanzasDe(userProfile)
  const finanzasAmplio = permisos.ver || permisos.liderCajas
  const accesoCaja = useQuery({
    queryKey: queryKeys.finanzas.cajasAcceso(user?.uid),
    queryFn: fetchCajasAcceso,
    enabled: !profileLoading && Boolean(user) && settings.finanzasEnabled && !finanzasAmplio,
  })

  const esperandoCaja = !finanzasAmplio && accesoCaja.isLoading

  if (profileLoading || settingsLoading || esperandoCaja) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          <p className="text-sm text-neutral-500 dark:text-gray-400">Verificando acceso...</p>
        </div>
      </div>
    )
  }

  if (!settings.finanzasEnabled || (!finanzasAmplio && accesoCaja.data !== true)) {
    return <Navigate to="/intranet" replace />
  }

  return <Outlet />
}
