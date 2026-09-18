import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context'
import {
  disconnectGoogleWidgets,
  fetchGoogleWidgetsStatus,
  isGoogleReconnectError,
  startGoogleWidgetsOAuth,
} from '../services/googleWidgetsApi'

export function useGoogleWidgetsConnection() {
  const { user } = useAuth()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const refreshStatus = useCallback(async () => {
    if (!user) {
      setConnected(null)
      return false
    }
    try {
      const status = await fetchGoogleWidgetsStatus()
      setConnected(status.connected)
      return status.connected
    } catch {
      setConnected(false)
      return false
    }
  }, [user])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('googleConnected') === '1' || params.get('googleConnectError')) {
      void refreshStatus()
      params.delete('googleConnected')
      params.delete('googleConnectError')
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`
      window.history.replaceState({}, '', next)
    }
  }, [refreshStatus])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      await startGoogleWidgetsOAuth('/intranet')
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    setDisconnecting(true)
    try {
      await disconnectGoogleWidgets()
      setConnected(false)
    } finally {
      setDisconnecting(false)
    }
  }, [])

  return {
    connected,
    connecting,
    disconnecting,
    connect,
    disconnect,
    refreshStatus,
    isGoogleReconnectError,
  }
}
