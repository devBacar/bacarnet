import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context'
import { useGlobalSettings } from '../context/GlobalSettingsContext'
import { fetchCajasAcceso } from '../services/finanzasCajasApi'
import { hasFinanzasAccess, isSuperAdmin } from '../services/userService'

/** Acceso al módulo Finanzas: view_finanzas o responsable/líder de caja chica. */
export function FinanzasModuleGate() {
  const { userProfile, profileLoading } = useAuth()
  const { settings, loading: settingsLoading } = useGlobalSettings()
  const [cajaAcceso, setCajaAcceso] = useState<boolean | null>(null)

  const finanzasAmplio =
    hasFinanzasAccess(userProfile) ||
    userProfile?.permissions.manage_finanzas_caja === true ||
    isSuperAdmin(userProfile)

  useEffect(() => {
    if (profileLoading || finanzasAmplio) return
    let cancelled = false
    void fetchCajasAcceso()
      .then((ok) => {
        if (!cancelled) setCajaAcceso(ok)
      })
      .catch(() => {
        if (!cancelled) setCajaAcceso(false)
      })
    return () => {
      cancelled = true
    }
  }, [profileLoading, finanzasAmplio])

  if (profileLoading || settingsLoading || (!finanzasAmplio && cajaAcceso === null)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          <p className="text-sm text-neutral-500 dark:text-gray-400">Verificando acceso...</p>
        </div>
      </div>
    )
  }

  if (!settings.finanzasEnabled || (!finanzasAmplio && !cajaAcceso)) {
    return <Navigate to="/intranet" replace />
  }

  return <Outlet />
}
