import { Loader2, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  deleteHelpdeskColaboradorSolicitante,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  postHelpdeskColaboradorSolicitante,
  type HelpdeskColaboradorSolicitanteDto,
  type HelpdeskMisProyectoRolAcceso,
} from '../../services/helpdeskApi'

export function HelpdeskColaboradoresSolicitante({
  ticketId,
  miRolAcceso,
  colaboradores,
  onUpdated,
}: {
  ticketId: string
  miRolAcceso: HelpdeskMisProyectoRolAcceso
  colaboradores: HelpdeskColaboradorSolicitanteDto[]
  onUpdated: () => void
}) {
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<'lector' | 'editor'>('lector')
  const [busy, setBusy] = useState(false)

  const isOwner = miRolAcceso === 'propio'

  if (!isOwner && miRolAcceso !== 'lector' && miRolAcceso !== 'editor') {
    return null
  }

  const remove = async (targetEmail: string) => {
    setBusy(true)
    try {
      await deleteHelpdeskColaboradorSolicitante(ticketId, targetEmail)
      toast.success('Colaborador quitado')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const invite = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      toast.error('Ingresá un email')
      return
    }
    setBusy(true)
    try {
      await postHelpdeskColaboradorSolicitante(ticketId, { email: trimmed, rol })
      setEmail('')
      toast.success('Invitación enviada')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rounded-lg border border-neutral-100 bg-neutral-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
      data-testid="helpdesk-colaboradores-solicitante"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Colaboradores</p>
      {!isOwner ? (
        <p className="mt-1 text-sm text-body-muted" data-testid="helpdesk-mis-proyectos-rol-etiqueta">
          {miRolAcceso === 'lector'
            ? 'Colaborás como Lector'
            : 'Colaborás como Editor'}
        </p>
      ) : null}
      {isOwner ? (
        <>
          {colaboradores.length === 0 ? (
            <p className="mt-2 text-sm text-body-muted">Todavía no invitaste a nadie.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {colaboradores.map((c) => (
                <li
                  key={c.email}
                  className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-sm dark:bg-zinc-900"
                >
                  <span className="min-w-0 truncate text-heading">
                    {c.nombre}{' '}
                    <span className="text-body-muted">
                      ({c.email}) · {c.rol === 'editor' ? 'Editor' : 'Lector'}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(c.email)}
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
              Email corporativo
              <input
                type="email"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@bacarsa.com.ar"
                className="input-brand-focus mt-1 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                data-testid="helpdesk-colaboradores-solicitante-email"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-body-muted sm:w-32">
              Rol
              <select
                value={rol}
                disabled={busy}
                onChange={(e) => setRol(e.target.value as 'lector' | 'editor')}
                className="input-brand-focus mt-1 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                data-testid="helpdesk-colaboradores-solicitante-rol"
              >
                <option value="lector">Lector</option>
                <option value="editor">Editor</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void invite()}
              className="btn-primary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
              data-testid="helpdesk-colaboradores-solicitante-invitar"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden />
              )}
              Invitar
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
