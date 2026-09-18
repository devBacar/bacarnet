import { Loader2, UserPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  deleteHelpdeskColaboradorSistemas,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  postHelpdeskColaboradorSistemas,
  type HelpdeskColaboradorSistemasDto,
  type HelpdeskTeamMemberDto,
} from '../../services/helpdeskApi'

export function HelpdeskColaboradoresSistemas({
  ticketId,
  asignadoATeamId,
  colaboradores,
  teamMembers,
  onUpdated,
  embedded = false,
}: {
  ticketId: string
  asignadoATeamId: string | null
  colaboradores: HelpdeskColaboradorSistemasDto[]
  teamMembers: HelpdeskTeamMemberDto[]
  onUpdated: () => void
  embedded?: boolean
}) {
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)

  const takenIds = useMemo(() => {
    const ids = new Set(colaboradores.map((c) => c.teamMemberId))
    if (asignadoATeamId) ids.add(asignadoATeamId)
    return ids
  }, [colaboradores, asignadoATeamId])

  const addable = teamMembers.filter((m) => !takenIds.has(m.id))

  const add = async () => {
    if (!selectedId) {
      toast.error('Elegí un miembro del equipo')
      return
    }
    setBusy(true)
    try {
      await postHelpdeskColaboradorSistemas(ticketId, selectedId)
      setSelectedId('')
      toast.success('Colaborador agregado')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (teamMemberId: string) => {
    setBusy(true)
    try {
      await deleteHelpdeskColaboradorSistemas(ticketId, teamMemberId)
      toast.success('Colaborador quitado')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={
        embedded
          ? 'mt-4 border-t border-neutral-100 pt-4 dark:border-zinc-800'
          : 'mt-4 rounded-lg border border-neutral-100 bg-neutral-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40'
      }
      data-testid="helpdesk-colaboradores-sistemas"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Colaboradores</p>
      <p className="mt-0.5 text-xs text-body-muted">
        Registro informativo: no cambia permisos en el panel.
      </p>
      {colaboradores.length === 0 ? (
        <p className="mt-2 text-sm text-body-muted">Nadie más registrado todavía.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {colaboradores.map((c) => (
            <li
              key={c.teamMemberId}
              className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-sm dark:bg-zinc-900"
            >
              <span className="min-w-0 truncate text-heading">
                {c.nombre}{' '}
                <span className="text-body-muted">({c.email})</span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(c.teamMemberId)}
                className="shrink-0 rounded p-1 text-body-muted hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-zinc-800"
                aria-label={`Quitar a ${c.nombre}`}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block flex-1 text-xs font-semibold uppercase tracking-wide text-body-muted">
          Agregar
          <select
            value={selectedId}
            disabled={busy || addable.length === 0}
            onChange={(e) => setSelectedId(e.target.value)}
            className="input-brand-focus mt-1 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            data-testid="helpdesk-colaboradores-sistemas-select"
          >
            <option value="">Elegí un miembro</option>
            {addable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} — {m.rol}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !selectedId}
          onClick={() => void add()}
          className="btn-primary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
          data-testid="helpdesk-colaboradores-sistemas-agregar"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <UserPlus className="h-4 w-4" aria-hidden />
          )}
          Agregar
        </button>
      </div>
    </div>
  )
}
