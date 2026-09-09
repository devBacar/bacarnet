import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context'
import { RagAssistantProvider } from '../../context/RagAssistantContext'
import { fetchRagStatus } from '../../services/ragApi'
import { hasRagAssistantAccess } from '../../services/userService'
import { RagAssistantWidget } from './RagAssistantWidget'

const ALLOWED_PREFIXES = ['/intranet', '/recursos', '/tableros', '/ayuda', '/accesos-directos']

function isAllowedRoute(pathname: string): boolean {
  if (pathname.startsWith('/admin')) return false
  if (pathname.startsWith('/cuenta-')) return false
  if (pathname.startsWith('/recursos/documento/')) return false
  if (pathname === '/') return true
  return ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function RagAssistantInner() {
  const location = useLocation()
  const onAllowedRoute = isAllowedRoute(location.pathname)
  if (!onAllowedRoute) return null
  return <RagAssistantWidget />
}

export function RagAssistantHost() {
  const { user, userProfile, loading, profileLoading } = useAuth()
  const [pilotAccess, setPilotAccess] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (loading || profileLoading) return
    if (!user || !hasRagAssistantAccess(userProfile)) {
      setPilotAccess(false)
      setChecked(true)
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        await fetchRagStatus()
        if (!cancelled) {
          setPilotAccess(true)
          setChecked(true)
        }
      } catch {
        if (!cancelled) {
          setPilotAccess(false)
          setChecked(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user, userProfile, loading, profileLoading])

  if (!checked || !pilotAccess) return null

  return (
    <RagAssistantProvider pilotAccess={pilotAccess}>
      <RagAssistantInner />
    </RagAssistantProvider>
  )
}
