import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { openRagAssistantSession } from '../context/RagAssistantContext'

/** Abre el chat flotante y redirige — mantiene links guardados a /recursos/asistente-sistemas. */
export function RagAssistantRedirect() {
  useEffect(() => {
    openRagAssistantSession()
  }, [])

  return <Navigate to="/recursos" replace />
}
