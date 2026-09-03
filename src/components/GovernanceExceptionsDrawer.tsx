import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { listAssignableRootAreas, type GoverningArea } from '../services/areaService'
import {
  GOVERNANCE_ACTION_LABELS,
  GOVERNANCE_ACTIONS,
  listActionGrantEntries,
} from '../services/governanceAccess'
import { patchUserActionGrants, type GovernanceAction } from '../services/usersApi'
import type { UserProfile } from '../services/userService'

const MIN_REASON_LENGTH = 15

interface GovernanceExceptionsDrawerProps {
  user: UserProfile
  onClose: () => void
  onSaved: (uid: string) => void
}

export function GovernanceExceptionsDrawer({
  user,
  onClose,
  onSaved,
}: GovernanceExceptionsDrawerProps) {
  const [areas, setAreas] = useState<GoverningArea[]>([])
  const [loadingAreas, setLoadingAreas] = useState(true)
  const [grants, setGrants] = useState(user.actionGrants ?? {})
  const [addOpen, setAddOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{
    action: GovernanceAction
    areaId: string
  } | null>(null)
  const [draftAction, setDraftAction] = useState<GovernanceAction>('approval')
  const [draftAreaId, setDraftAreaId] = useState('')
  const [reason, setReason] = useState('')
  const [acting, setActing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingAreas(true)
    listAssignableRootAreas()
      .then((rows) => {
        if (!cancelled) setAreas(rows)
      })
      .catch((err) => {
        console.error(err)
        toast.error('No se pudieron cargar las áreas')
      })
      .finally(() => {
        if (!cancelled) setLoadingAreas(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !addOpen && !revokeTarget) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [addOpen, onClose, revokeTarget])

  const areaNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const area of areas) {
      if (area.id) map.set(area.id, area.name)
    }
    return map
  }, [areas])

  const entries = useMemo(() => listActionGrantEntries(grants), [grants])

  const grantableAreas = useMemo(
    () =>
      areas.filter(
        (area) =>
          area.id &&
          !(user.managedAreaIds ?? []).includes(area.id) &&
          !(grants[draftAction] ?? []).includes(area.id),
      ),
    [areas, draftAction, grants, user.managedAreaIds],
  )

  const handleGrant = async () => {
    if (!draftAreaId) {
      toast.error('Elegí un área')
      return
    }
    if (reason.trim().length < MIN_REASON_LENGTH) {
      toast.error(`El motivo debe tener al menos ${MIN_REASON_LENGTH} caracteres`)
      return
    }
    setActing(true)
    try {
      const result = await patchUserActionGrants(user.uid, {
        action: draftAction,
        areaId: draftAreaId,
        operation: 'grant',
        reason: reason.trim(),
      })
      setGrants(result.actionGrants)
      toast.success('Excepción agregada')
      setAddOpen(false)
      setReason('')
      setDraftAreaId('')
      onSaved(user.uid)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo agregar la excepción')
    } finally {
      setActing(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    if (reason.trim().length < MIN_REASON_LENGTH) {
      toast.error(`El motivo debe tener al menos ${MIN_REASON_LENGTH} caracteres`)
      return
    }
    setActing(true)
    try {
      const result = await patchUserActionGrants(user.uid, {
        action: revokeTarget.action,
        areaId: revokeTarget.areaId,
        operation: 'revoke',
        reason: reason.trim(),
      })
      setGrants(result.actionGrants)
      toast.success('Excepción quitada')
      setRevokeTarget(null)
      setReason('')
      onSaved(user.uid)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo quitar la excepción')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-zinc-900">
        <header className="flex items-start justify-between border-b border-neutral-200 px-6 py-5 dark:border-zinc-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Permisos individuales adicionales
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900 dark:text-gray-100">
              Excepciones de gobernanza
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-gray-400">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-gray-400">
            Acciones puntuales sobre un área sin convertir a la persona en jefe completo. No
            reemplaza «Áreas que gobierna». El usuario aún necesita acceso de lectura en Drive para
            ver los archivos.
          </p>

          {(user.managedAreaIds?.length ?? 0) > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Ya gobierna {(user.managedAreaIds ?? []).length} área(s) vía rol de admin; esas
              áreas no necesitan excepciones.
            </p>
          )}

          {entries.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-gray-400">Sin excepciones activas.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map(({ action, areaId }) => (
                <li
                  key={`${action}-${areaId}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-zinc-700"
                >
                  <div className="min-w-0 text-sm">
                    <span className="font-medium text-neutral-800 dark:text-gray-100">
                      {GOVERNANCE_ACTION_LABELS[action]}
                    </span>
                    <span className="text-neutral-400"> · </span>
                    <span className="text-neutral-600 dark:text-gray-300">
                      {areaNameById.get(areaId) ?? areaId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRevokeTarget({ action, areaId })
                      setReason('')
                    }}
                    className="shrink-0 text-xs font-medium text-danger hover:underline"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setAddOpen(true)
              setReason('')
              setDraftAction('approval')
              setDraftAreaId('')
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            Agregar excepción
          </button>
        </div>
      </aside>

      {addOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-gray-100">
              Agregar excepción
            </h3>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="grant-action" className="mb-1 block text-sm font-medium">
                  Acción
                </label>
                <select
                  id="grant-action"
                  value={draftAction}
                  onChange={(e) => {
                    setDraftAction(e.target.value as GovernanceAction)
                    setDraftAreaId('')
                  }}
                  className="input-brand-focus w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {GOVERNANCE_ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {GOVERNANCE_ACTION_LABELS[action]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="grant-area" className="mb-1 block text-sm font-medium">
                  Área
                </label>
                {loadingAreas ? (
                  <p className="text-sm text-neutral-400">Cargando áreas…</p>
                ) : grantableAreas.length === 0 ? (
                  <p className="text-sm text-neutral-500">No hay áreas disponibles para esta acción.</p>
                ) : (
                  <select
                    id="grant-area"
                    value={draftAreaId}
                    onChange={(e) => setDraftAreaId(e.target.value)}
                    className="input-brand-focus w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">Seleccionar…</option>
                    {grantableAreas.map((area) =>
                      area.id ? (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ) : null,
                    )}
                  </select>
                )}
              </div>
              <div>
                <label htmlFor="grant-reason" className="mb-1 block text-sm font-medium">
                  Motivo (mín. {MIN_REASON_LENGTH} caracteres)
                </label>
                <textarea
                  id="grant-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="input-brand-focus w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={acting || grantableAreas.length === 0}
                onClick={handleGrant}
                className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {acting ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {revokeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-gray-100">
              Quitar excepción
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-gray-300">
              {GOVERNANCE_ACTION_LABELS[revokeTarget.action]} ·{' '}
              {areaNameById.get(revokeTarget.areaId) ?? revokeTarget.areaId}
            </p>
            <div className="mt-4">
              <label htmlFor="revoke-reason" className="mb-1 block text-sm font-medium">
                Motivo (mín. {MIN_REASON_LENGTH} caracteres)
              </label>
              <textarea
                id="revoke-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="input-brand-focus w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={handleRevoke}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {acting ? 'Quitando…' : 'Quitar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
