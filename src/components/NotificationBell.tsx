import { Bell, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationsContext'
import {
  approveAccessRequest,
  rejectAccessRequest,
} from '../services/approvalRequestsService'
import type { NotificationSnapshot } from '../services/notificationsTypes'
import { isValidReason, REASON_REQUIRED_ERROR } from '../utils/reasonValidation'

function formatRelativeTime(createdAtMs: number): string {
  if (!createdAtMs) return ''
  const diffMs = Date.now() - createdAtMs
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `Hace ${days} d`
}

function requestIdFromContext(item: NotificationSnapshot): string | null {
  const requestId = item.context.requestId
  return typeof requestId === 'string' && requestId.length > 0 ? requestId : null
}

function fileNameFromContext(item: NotificationSnapshot): string | null {
  const fileName = item.context.fileName
  return typeof fileName === 'string' && fileName.length > 0 ? fileName : null
}

function bodyWithLinkedFileName(body: string, fileName: string, href: string) {
  const quoted = `«${fileName}»`
  const index = body.indexOf(quoted)
  if (index === -1) {
    return <p className="mt-0.5 text-sm text-neutral-600 dark:text-gray-400">{body}</p>
  }

  return (
    <p className="mt-0.5 text-sm text-neutral-600 dark:text-gray-400">
      {body.slice(0, index)}
      <Link
        to={href}
        className="font-medium text-brand-primary hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {quoted}
      </Link>
      {body.slice(index + quoted.length)}
    </p>
  )
}

function requestStatusFromContext(
  item: NotificationSnapshot,
): 'approved' | 'rejected' | null {
  const status = item.context.requestStatus
  if (status === 'approved' || status === 'rejected') return status
  return null
}

function resolvedStatusMessage(
  status: 'approved' | 'rejected',
  isOfficeUpload: boolean,
): string {
  if (status === 'approved') {
    return isOfficeUpload
      ? 'Este documento ya fue aceptado.'
      : 'Esta solicitud ya fue aceptada.'
  }
  return isOfficeUpload
    ? 'Este documento ya fue rechazado.'
    : 'Esta solicitud ya fue rechazada.'
}

function ActionableApprovalItem({
  item,
  onResolved,
  approveLabel = 'Aprobar',
  rejectLabel = 'Rechazar',
  filePreviewHref,
  isOfficeUpload = false,
}: {
  item: NotificationSnapshot
  onResolved: () => void
  approveLabel?: string
  rejectLabel?: string
  filePreviewHref?: string | null
  isOfficeUpload?: boolean
}) {
  const [reason, setReason] = useState('')
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null)
  const [localStatus, setLocalStatus] = useState<'approved' | 'rejected' | null>(null)
  const requestId = requestIdFromContext(item)
  const persistedStatus = requestStatusFromContext(item)
  const resolvedStatus = localStatus ?? persistedStatus
  const requestReason =
    typeof item.context.requestReason === 'string' ? item.context.requestReason : null
  const fileName = fileNameFromContext(item)
  const requestedRole =
    typeof item.context.requestedRole === 'string' ? item.context.requestedRole : null

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!requestId) {
      toast.error('Solicitud no encontrada en la notificación')
      return
    }
    if (!isValidReason(reason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }

    setActing(action)
    try {
      if (action === 'approve') {
        await approveAccessRequest(requestId, reason)
        toast.success(approveLabel === 'Aprobar' ? 'Acceso aprobado' : 'Subida aprobada')
        setLocalStatus('approved')
      } else {
        await rejectAccessRequest(requestId, reason)
        toast.success('Solicitud rechazada')
        setLocalStatus('rejected')
      }
      onResolved()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo completar la acción'
      const requestStatus =
        err && typeof err === 'object' && 'requestStatus' in err
          ? (err as { requestStatus?: string }).requestStatus
          : undefined
      if (requestStatus === 'approved' || requestStatus === 'rejected') {
        setLocalStatus(requestStatus)
        onResolved()
      } else if (message.includes('ya fue resuelta')) {
        setLocalStatus('approved')
      }
      toast.error(message)
    } finally {
      setActing(null)
    }
  }

  return (
    <div
      className={`border-b border-neutral-100 px-4 py-3 dark:border-zinc-800 ${
        item.read ? 'opacity-80' : 'bg-brand-tint/20 dark:bg-brand-tint/10'
      }`}
    >
      <div className="flex items-start gap-2">
        {!item.read && (
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-primary" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 dark:text-gray-100">{item.title}</p>
          {filePreviewHref && fileName
            ? bodyWithLinkedFileName(item.body, fileName, filePreviewHref)
            : (
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-gray-400">{item.body}</p>
            )}
          {requestedRole && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-gray-500">
              Rol solicitado:{' '}
              {requestedRole === 'writer'
                ? 'Editor'
                : requestedRole === 'commenter'
                  ? 'Comentarista'
                  : 'Lector'}
            </p>
          )}
          {requestReason && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-gray-500">
              Motivo del solicitante: {requestReason}
            </p>
          )}
          {item.createdAtMs > 0 && (
            <p className="mt-1 text-xs text-neutral-400 dark:text-gray-500">
              {formatRelativeTime(item.createdAtMs)}
            </p>
          )}
          {resolvedStatus ? (
            <p
              className={`mt-2 rounded-md px-2.5 py-2 text-xs font-medium ${
                resolvedStatus === 'approved'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-neutral-100 text-neutral-700 dark:bg-zinc-800 dark:text-gray-300'
              }`}
            >
              {resolvedStatusMessage(resolvedStatus, Boolean(isOfficeUpload))}
            </p>
          ) : (
            <>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                placeholder="Motivo de tu decisión (obligatorio)"
                className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-900 outline-none focus:border-brand-primary dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-100"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={acting !== null || !requestId}
                  onClick={() => void handleAction('approve')}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-brand-primary px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {acting === 'approve' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {approveLabel}
                </button>
                <button
                  type="button"
                  disabled={acting !== null || !requestId}
                  onClick={() => void handleAction('reject')}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-800"
                >
                  {acting === 'reject' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {rejectLabel}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NotificationItem({
  item,
  onOpen,
}: {
  item: NotificationSnapshot
  onOpen: (item: NotificationSnapshot) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`w-full border-b border-neutral-100 px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:border-zinc-800 dark:hover:bg-zinc-900/70 ${
        item.read ? 'opacity-80' : 'bg-brand-tint/20 dark:bg-brand-tint/10'
      }`}
    >
      <div className="flex items-start gap-2">
        {!item.read && (
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-primary" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 dark:text-gray-100">{item.title}</p>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-gray-400">{item.body}</p>
          {item.createdAtMs > 0 && (
            <p className="mt-1 text-xs text-neutral-400 dark:text-gray-500">
              {formatRelativeTime(item.createdAtMs)}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

export function NotificationBell() {
  const navigate = useNavigate()
  const { unreadCount, recentNotifications, markRead, markAllRead, loading } = useNotifications()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const handleOpenItem = async (item: NotificationSnapshot) => {
    if (!item.read) {
      try {
        await markRead(item.id)
      } catch {
        // onSnapshot actualizará cuando la API responda; no bloqueamos navegación.
      }
    }
    setOpen(false)
    if (item.deepLink?.path) {
      navigate(item.deepLink.path)
    }
  }

  const handleActionableResolved = async (item: NotificationSnapshot) => {
    if (!item.read) {
      try {
        await markRead(item.id)
      } catch {
        // best effort
      }
    }
  }

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={
          unreadCount > 0
            ? `Notificaciones, ${unreadCount} sin leer`
            : 'Notificaciones'
        }
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-zinc-700 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-semibold leading-none text-white">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-zinc-800">
            <p className="text-sm font-semibold text-neutral-900 dark:text-gray-100">
              Notificaciones
            </p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-brand-primary hover:underline"
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-neutral-500 dark:text-gray-400">Cargando…</p>
            ) : recentNotifications.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-500 dark:text-gray-400">
                No tenés notificaciones todavía.
              </p>
            ) : (
              recentNotifications.map((item) =>
                item.category === 'actionable' && item.type === 'access_request' ? (
                  <ActionableApprovalItem
                    key={item.id}
                    item={item}
                    onResolved={() => void handleActionableResolved(item)}
                  />
                ) : item.category === 'actionable' && item.type === 'office_upload_request' ? (
                  <ActionableApprovalItem
                    key={item.id}
                    item={item}
                    onResolved={() => void handleActionableResolved(item)}
                    isOfficeUpload
                    approveLabel="Aprobar subida"
                    filePreviewHref={
                      requestIdFromContext(item)
                        ? `/recursos/office-preview/${requestIdFromContext(item)}`
                        : null
                    }
                  />
                ) : (
                  <NotificationItem key={item.id} item={item} onOpen={handleOpenItem} />
                ),
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
