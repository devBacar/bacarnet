import { useMemo } from 'react'
import { useAuth } from '../../context'
import { hasFinanzasAccess } from '../../services/userService'
import { FINANZAS_NAV_ITEMS, type FinanzasNavItem } from './finanzasNavConfig'
import { usePermisosFinanzas } from './permisosFinanzas'

/** Quien solo entra a Cajas ve esa sección. El resto ve todas las que están habilitadas. */
export function useFinanzasNavItems(): FinanzasNavItem[] {
  const { userProfile } = useAuth()
  const finanzasCompleto = hasFinanzasAccess(userProfile)
  const permisos = usePermisosFinanzas()

  return useMemo(
    () =>
      FINANZAS_NAV_ITEMS.filter((item) => item.enabled !== false)
        .filter((item) => finanzasCompleto || item.to.includes('/finanzas/cajas'))
        .filter((item) => {
          if (item.requiere === 'inversiones') return permisos.inversiones
          return true
        }),
    [finanzasCompleto, permisos.inversiones],
  )
}
