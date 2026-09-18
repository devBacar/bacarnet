import { X } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { NOTIFICATION_TYPE_HELPDESK_ANALISIS_PENDIENTE } from '../../constants/notificationTypes'
import { useNotifications } from '../../context/NotificationsContext'
import type { HelpdeskAnalisisPendienteItem } from '../../services/helpdeskApi'
import { AprobacionesPendientesPanel } from './AprobacionesPendientesPanel'

export function AprobacionesPendientesModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { recentNotifications, markRead } = useNotifications()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const markNotificationForItem = useCallback(
    async (item: HelpdeskAnalisisPendienteItem) => {
      const match = recentNotifications.find((n) => {
        if (n.type !== NOTIFICATION_TYPE_HELPDESK_ANALISIS_PENDIENTE || n.read) return false
        const ticketId = n.context.ticketId
        const analisisId = n.context.analisisId
        return ticketId === item.ticketId && analisisId === item.analisisId
      })
      if (match) {
        try {
          await markRead(match.id)
        } catch {
          /* best effort */
        }
      }
    },
    [markRead, recentNotifications],
  )

  const handleItemDecided = useCallback(
    async (item: HelpdeskAnalisisPendienteItem, remainingCount: number) => {
      await markNotificationForItem(item)
      if (remainingCount === 0) onClose()
    },
    [markNotificationForItem, onClose],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aprobaciones-pendientes-modal-title"
        className="app-modal-panel flex max-h-[min(90vh,48rem)] w-full max-w-3xl flex-col"
        data-testid="aprobaciones-pendientes-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 id="aprobaciones-pendientes-modal-title" className="text-lg font-semibold text-heading">
              Aprobaciones pendientes
            </h2>
            <p className="mt-1 text-sm text-body-muted">
              Documentos de análisis de proyectos a Sistemas que requieren tu decisión.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-body-muted hover:bg-neutral-100 dark:hover:bg-zinc-800"
            data-testid="aprobaciones-pendientes-modal-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="app-modal-scroll flex-1 px-5 py-4">
          <AprobacionesPendientesPanel
            onListEmpty={onClose}
            onItemDecided={(item, remaining) => void handleItemDecided(item, remaining)}
          />
        </div>
      </div>
    </div>
  )
}
