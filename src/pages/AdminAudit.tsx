import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react'
import {
  fetchAuditLogs,
  type AuditFilterBy,
  type AuditLogDto,
} from '../services/auditApi'
import { GOVERNANCE_ACTION_LABELS } from '../services/governanceAccess'
import type { GovernanceAction } from '../services/userService'

const ACTION_LABELS: Record<string, string> = {
  create: 'Crear',
  delete: 'Eliminar',
  edit: 'Editar',
  rename: 'Renombrar',
  permission_grant: 'Otorgar permiso',
  permission_revoke: 'Revocar permiso',
  role_change: 'Cambio de rol',
  managed_areas_change: 'Cambio de áreas',
  member_areas_change: 'Cambio de pertenencia',
  action_grants_change: 'Excepción de gobernanza',
  classification_change: 'Clasificación',
  authorized_copy: 'Copia autorizada',
  approval: 'Aprobación',
  board_view: 'Vista de tablero',
  board_access_grant: 'Acceso a tablero',
  board_access_revoke: 'Revocar acceso a tablero',
}

const ACTION_OPTIONS = [
  'create',
  'delete',
  'edit',
  'rename',
  'permission_grant',
  'permission_revoke',
  'classification_change',
  'authorized_copy',
  'approval',
  'board_view',
  'board_access_grant',
  'board_access_revoke',
  'role_change',
  'managed_areas_change',
  'member_areas_change',
  'action_grants_change',
] as const

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' })
}

function areaIdsSummary(before: unknown, after: unknown): string | null {
  const beforeIds = Array.isArray(before) ? before.map(String) : []
  const afterIds = Array.isArray(after) ? after.map(String) : []
  if (beforeIds.length === afterIds.length && beforeIds.every((id, i) => id === afterIds[i])) {
    return null
  }
  return `${beforeIds.length} → ${afterIds.length} área(s)`
}

function metadataSummary(log: AuditLogDto): string | null {
  const m = log.metadata ?? {}
  if (log.action === 'action_grants_change') {
    const operation = m.operation === 'grant' ? 'Otorgar' : m.operation === 'revoke' ? 'Quitar' : null
    const actionKey = typeof m.governanceAction === 'string' ? m.governanceAction : null
    const actionLabel =
      actionKey && actionKey in GOVERNANCE_ACTION_LABELS
        ? GOVERNANCE_ACTION_LABELS[actionKey as GovernanceAction]
        : actionKey
    const areaName = typeof m.areaName === 'string' ? m.areaName : null
    const parts = [operation, actionLabel, areaName].filter(Boolean)
    if (parts.length) return parts.join(' · ')
  }
  if (log.action === 'member_areas_change' || log.action === 'managed_areas_change') {
    const summary = areaIdsSummary(m.antes, m.despues)
    if (summary) return summary
  }
  if (log.action === 'classification_change') {
    const from = m.previousClassification
    const to = m.classification
    if (from || to) return `${String(from ?? '—')} → ${String(to ?? '—')}`
  }
  if (log.action === 'authorized_copy') {
    const name = typeof m.recipientName === 'string' ? m.recipientName : null
    const email = typeof m.recipientEmail === 'string' ? m.recipientEmail : null
    const parts = [name, email].filter(Boolean)
    if (parts.length) return parts.join(' · ')
  }
  if (log.action === 'permission_grant' || log.action === 'permission_revoke') {
    const email = typeof m.granteeEmail === 'string' ? m.granteeEmail : null
    const role = typeof m.role === 'string' ? m.role : null
    const parts = [email, role].filter(Boolean)
    if (parts.length) return parts.join(' · ')
  }
  if (log.action === 'board_access_grant' || log.action === 'board_access_revoke') {
    const email = typeof m.granteeEmail === 'string' ? m.granteeEmail : null
    if (email) return email
  }
  if (log.action === 'approval') {
    const from = m.previousStatus
    const to = m.status
    if (from || to) return `${String(from ?? '—')} → ${String(to ?? '—')}`
  }
  if (typeof m.classification === 'string' && log.action === 'create') {
    return m.classification
  }
  return null
}

function hasMetadata(log: AuditLogDto): boolean {
  return Object.keys(log.metadata ?? {}).length > 0
}

export function AdminAudit() {
  const [filterBy, setFilterBy] = useState<'' | AuditFilterBy>('')
  const [value, setValue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [logs, setLogs] = useState<AuditLogDto[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const queryInput = useMemo(
    () => ({
      filterBy: filterBy || undefined,
      value: filterBy ? value.trim() : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      pageSize: 25,
    }),
    [filterBy, value, startDate, endDate],
  )

  const load = useCallback(
    async (pageToken?: string | null, append = false) => {
      if (filterBy && !value.trim()) {
        setError('Completá el valor del filtro')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const result = await fetchAuditLogs({ ...queryInput, pageToken })
        setLogs((prev) => (append ? [...prev, ...result.logs] : result.logs))
        setNextPageToken(result.nextPageToken)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los logs')
        if (!append) setLogs([])
      } finally {
        setLoading(false)
      }
    },
    [filterBy, value, queryInput],
  )

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="w-full space-y-6">
      <header>
        <p className="text-brand-primary mb-1 text-sm font-medium uppercase tracking-wide">
          Administración
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-gray-100">Auditoría</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Registro de acciones sobre Drive y la intranet. Solo visible para super_admin.
        </p>
      </header>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        onSubmit={(e) => {
          e.preventDefault()
          void load()
        }}
      >
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-gray-400">
          Filtrar por
          <select
            value={filterBy}
            onChange={(e) => {
              setFilterBy(e.target.value as '' | AuditFilterBy)
              setValue('')
            }}
            className="input-brand-focus rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-100"
          >
            <option value="">Sin filtro (recientes)</option>
            <option value="userId">Usuario (uid)</option>
            <option value="targetId">Archivo (id)</option>
            <option value="action">Tipo de acción</option>
          </select>
        </label>

        {filterBy === 'action' ? (
          <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-gray-400">
            Acción
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input-brand-focus rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-100"
            >
              <option value="">Elegí una acción</option>
              {ACTION_OPTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action] ?? action}
                </option>
              ))}
            </select>
          </label>
        ) : filterBy ? (
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-gray-400">
            {filterBy === 'userId' ? 'UID del usuario' : 'ID de archivo'}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input-brand-focus rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-100"
              placeholder={filterBy === 'userId' ? 'uid de Firebase Auth' : 'id de Drive'}
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-gray-400">
          Desde
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input-brand-focus rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-gray-400">
          Hasta
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input-brand-focus rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-100"
          />
        </label>

        <button type="submit" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium" disabled={loading}>
          {loading ? 'Cargando…' : 'Consultar'}
        </button>
      </form>

      {error && (
        <p className="rounded-lg alert-error px-4 py-3 text-sm text-brand-primary ">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-zinc-800 dark:bg-zinc-950">
                <th className="w-8 px-3 py-3.5" />
                <th className="px-4 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Fecha</th>
                <th className="px-4 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Usuario</th>
                <th className="px-4 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Acción</th>
                <th className="px-4 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Tipo</th>
                <th className="px-4 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Objetivo</th>
                <th className="px-4 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Motivo</th>
                <th className="px-4 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-neutral-500 dark:text-gray-400">
                    <ScrollText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No hay registros para este filtro
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const open = Boolean(expanded[log.id])
                  const summary = metadataSummary(log)
                  return (
                    <Fragment key={log.id}>
                      <tr
                        key={log.id}
                        className="border-b border-neutral-100 dark:border-zinc-800"
                      >
                        <td className="px-3 py-3">
                          {hasMetadata(log) ? (
                            <button
                              type="button"
                              aria-label={open ? 'Ocultar metadata' : 'Ver metadata'}
                              onClick={() =>
                                setExpanded((prev) => ({ ...prev, [log.id]: !prev[log.id] }))
                              }
                              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                            >
                              {open ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-700 dark:text-gray-300">
                          {formatWhen(log.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-neutral-800 dark:text-gray-200">{log.userEmail}</td>
                        <td className="px-4 py-3">{ACTION_LABELS[log.action] ?? log.action}</td>
                        <td className="px-4 py-3 text-neutral-600 dark:text-gray-400">{log.targetType}</td>
                        <td className="max-w-[16rem] truncate px-4 py-3" title={log.targetName}>
                          {log.targetName || log.targetId}
                        </td>
                        <td className="max-w-[18rem] truncate px-4 py-3 text-neutral-600 dark:text-gray-400" title={log.reason ?? ''}>
                          {log.reason || '—'}
                        </td>
                        <td className="max-w-[14rem] truncate px-4 py-3 text-neutral-600 dark:text-gray-400" title={summary ?? ''}>
                          {summary || '—'}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-neutral-100 bg-neutral-50 dark:border-zinc-800 dark:bg-zinc-950">
                          <td colSpan={8} className="px-6 py-3">
                            <pre className="overflow-x-auto text-xs text-neutral-700 dark:text-gray-300">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                            <p className="mt-2 text-xs text-neutral-500">
                              targetId: {log.targetId}
                              {log.mimeType ? ` · ${log.mimeType}` : ''}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {nextPageToken && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(nextPageToken, true)}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
        >
          {loading ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </div>
  )
}
