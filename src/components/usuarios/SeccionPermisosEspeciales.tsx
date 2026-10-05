import { KeyRound, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GoverningArea } from '../../services/areaService'
import {
  GOVERNANCE_ACTION_LABELS,
  GOVERNANCE_ACTIONS,
  listActionGrantEntries,
} from '../../services/governanceAccess'
import type { ActionGrants, GovernanceAction } from '../../services/userService'
import { isValidReason, REASON_REQUIRED_ERROR, REASON_REQUIRED_LABEL } from '../../utils/reasonValidation'
import toast from 'react-hot-toast'
import { SeccionFicha } from './SeccionFicha'

export function SeccionPermisosEspeciales({
  grants,
  areas,
  cargandoAreas,
  jefeIds,
  puedeEditar,
  onAgregar,
  onQuitar,
  onDialogo,
}: {
  grants: ActionGrants
  areas: GoverningArea[]
  cargandoAreas: boolean
  jefeIds: string[]
  puedeEditar: boolean
  onAgregar: (action: GovernanceAction, areaId: string, reason: string) => void
  onQuitar: (action: GovernanceAction, areaId: string, reason: string) => void
  onDialogo: (abierto: boolean) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{ action: GovernanceAction; areaId: string } | null>(null)
  const [draftAction, setDraftAction] = useState<GovernanceAction>('approval')
  const [draftAreaId, setDraftAreaId] = useState('')
  const [reason, setReason] = useState('')

  const nombres = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const area of areas) {
      if (area.id) mapa.set(area.id, area.name)
    }
    return mapa
  }, [areas])

  const entradas = useMemo(() => listActionGrantEntries(grants), [grants])

  const disponibles = useMemo(
    () =>
      areas.filter(
        (area) =>
          area.id &&
          !jefeIds.includes(area.id) &&
          !(grants[draftAction] ?? []).includes(area.id),
      ),
    [areas, draftAction, grants, jefeIds],
  )

  useEffect(() => {
    onDialogo(addOpen || revokeTarget !== null)
  }, [addOpen, onDialogo, revokeTarget])

  useEffect(() => {
    if (!addOpen && !revokeTarget) return
    const cerrar = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setAddOpen(false)
      setRevokeTarget(null)
    }
    document.addEventListener('keydown', cerrar)
    return () => document.removeEventListener('keydown', cerrar)
  }, [addOpen, revokeTarget])

  const confirmarAlta = () => {
    if (!draftAreaId) {
      toast.error('Elegí un área')
      return
    }
    if (!isValidReason(reason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }
    onAgregar(draftAction, draftAreaId, reason.trim())
    setAddOpen(false)
    setReason('')
    setDraftAreaId('')
  }

  const confirmarBaja = () => {
    if (!revokeTarget) return
    if (!isValidReason(reason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }
    onQuitar(revokeTarget.action, revokeTarget.areaId, reason.trim())
    setRevokeTarget(null)
    setReason('')
  }

  return (
    <>
      <SeccionFicha
        icono={KeyRound}
        titulo="Permisos especiales de Archivos"
        abierta={abierta}
        onToggle={() => setAbierta((actual) => !actual)}
        extra={
          entradas.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
              {entradas.length}
            </span>
          ) : null
        }
      >
        {!puedeEditar && (
          <p className="text-xs text-neutral-500 dark:text-gray-400">
            Solo un super admin puede cambiar estos permisos.
          </p>
        )}
        <p className="text-xs leading-relaxed text-neutral-500 dark:text-gray-400">
          Permisos puntuales sobre un área, sin hacerlo jefe. No reemplazan las áreas de las que ya
          es jefe. Igual necesita poder ver Archivos.
        </p>
        {jefeIds.length > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Ya es jefe de {jefeIds.length === 1 ? 'un área' : `${jefeIds.length} áreas`}. Esas no
            necesitan un permiso especial.
          </p>
        )}
        {entradas.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-gray-400">No tiene permisos especiales.</p>
        ) : (
          <ul className="space-y-2">
            {entradas.map(({ action, areaId }) => (
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
                    {nombres.get(areaId) ?? 'Área'}
                  </span>
                </div>
                {puedeEditar && (
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
                )}
              </li>
            ))}
          </ul>
        )}
        {puedeEditar && (
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
            Agregar permiso
          </button>
        )}
      </SeccionFicha>

      {addOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-gray-100">
                Agregar permiso especial
              </h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="permiso-accion" className="mb-1 block text-sm font-medium">
                    Qué puede hacer
                  </label>
                  <select
                    id="permiso-accion"
                    value={draftAction}
                    onChange={(event) => {
                      setDraftAction(event.target.value as GovernanceAction)
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
                  <label htmlFor="permiso-area" className="mb-1 block text-sm font-medium">
                    Área
                  </label>
                  {cargandoAreas ? (
                    <p className="text-sm text-neutral-400">Cargando áreas…</p>
                  ) : disponibles.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-gray-400">
                      No hay áreas disponibles para esto.
                    </p>
                  ) : (
                    <select
                      id="permiso-area"
                      value={draftAreaId}
                      onChange={(event) => setDraftAreaId(event.target.value)}
                      className="input-brand-focus w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="">Elegí un área</option>
                      {disponibles.map((area) =>
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
                  <label htmlFor="permiso-motivo" className="mb-1 block text-sm font-medium">
                    {REASON_REQUIRED_LABEL}
                  </label>
                  <textarea
                    id="permiso-motivo"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
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
                  disabled={disponibles.length === 0}
                  onClick={confirmarAlta}
                  className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {revokeTarget &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-gray-100">
                Quitar permiso especial
              </h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-gray-300">
                {GOVERNANCE_ACTION_LABELS[revokeTarget.action]} ·{' '}
                {nombres.get(revokeTarget.areaId) ?? 'Área'}
              </p>
              <div className="mt-4">
                <label htmlFor="quitar-permiso-motivo" className="mb-1 block text-sm font-medium">
                  {REASON_REQUIRED_LABEL}
                </label>
                <textarea
                  id="quitar-permiso-motivo"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
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
                  onClick={confirmarBaja}
                  className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
