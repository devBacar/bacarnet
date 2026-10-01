import { useMemo } from 'react'
import { useAuth } from '../../context'
import { hasFinanzasAccess } from '../../services/userService'
import { FINANZAS_NAV_ITEMS, type FinanzasNavItem } from './finanzasNavConfig'

/** Quien solo entra a Cajas ve esa sección. El resto ve todas las que están habilitadas. */
export function useFinanzasNavItems(): FinanzasNavItem[] {
  const { userProfile } = useAuth()
  const finanzasCompleto = hasFinanzasAccess(userProfile)

  return useMemo(
    () =>
      FINANZAS_NAV_ITEMS.filter((item) => item.enabled !== false).filter(
        (item) => finanzasCompleto || item.to.includes('/finanzas/cajas'),
      ),
    [finanzasCompleto],
  )
}
