import { ExternalLink, Loader2, MessageSquarePlus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  fetchHelpdeskTicketBitacora,
  postHelpdeskTicketBitacora,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  type HelpdeskBitacoraEntradaDto,
} from '../../services/helpdeskApi'

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export function HelpdeskBitacoraSection({
  ticketId,
  estadoIdx,
  mode,
}: {
  ticketId: string
  estadoIdx: number
  mode: 'panel' | 'mis-proyectos'
}) {
  const [entradas, setEntradas] = useState<HelpdeskBitacoraEntradaDto[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const visible = estadoIdx >= 3 && estadoIdx <= 5

  const load = useCallback(async () => {
    if (!visible) {
      setEntradas([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await fetchHelpdeskTicketBitacora(ticketId)
      setEntradas(data.entradas)
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [ticketId, visible])

  useEffect(() => {
    void load()
  }, [load])

  const publish = async () => {
    if (!texto.trim()) {
      toast.error('Escribí un texto')
      return
    }
    setBusy(true)
    try {
      const file = mode === 'panel' ? fileRef.current?.files?.[0] : undefined
      await postHelpdeskTicketBitacora(ticketId, { texto: texto.trim(), file })
      setTexto('')
      if (fileRef.current) fileRef.current.value = ''
      toast.success(mode === 'panel' ? 'Avance publicado' : 'Comentario publicado')
      await load()
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null

  return (
    <section
      className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
      data-testid="helpdesk-bitacora-section"
    >
      <h3 className="text-sm font-semibold text-heading">Bitácora del proyecto</h3>
      <p className="mt-1 text-xs text-body-muted">Avances del equipo y comentarios del área solicitante.</p>

      {loading ? (
        <div className="mt-4 flex justify-center text-body-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
      ) : entradas.length === 0 ? (
        <p className="mt-3 text-sm text-body-muted">Todavía no hay entradas.</p>
      ) : (
        <ul className="mt-4 space-y-3" data-testid="helpdesk-bitacora-feed">
          {entradas.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/60"
              data-bitacora-tipo={e.tipo}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-body-muted">
                <span className="font-semibold uppercase tracking-wide text-brand-primary">
                  {e.tipo === 'avance' ? 'Avance' : 'Comentario'}
                </span>
                <span>{e.autorNombre}</span>
                <span>{formatWhen(e.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-heading">{e.texto}</p>
              {e.adjuntoDriveLink ? (
                <a
                  href={e.adjuntoDriveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
                >
                  Ver adjunto
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2 rounded-lg border border-dashed border-neutral-200 p-3 dark:border-zinc-700">
        <label className="block text-xs font-semibold uppercase tracking-wide text-body-muted">
          {mode === 'panel' ? 'Publicar avance' : 'Comentar'}
          <textarea
            rows={3}
            value={texto}
            maxLength={5000}
            onChange={(ev) => setTexto(ev.target.value)}
            className="input-brand-focus mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            data-testid="helpdesk-bitacora-texto"
          />
        </label>
        {mode === 'panel' ? (
          <label className="block text-xs font-semibold uppercase tracking-wide text-body-muted">
            Adjunto opcional (Office o PDF)
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              className="mt-1 block w-full text-sm"
              data-testid="helpdesk-bitacora-file"
            />
          </label>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void publish()}
          className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
          data-testid="helpdesk-bitacora-publicar"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <MessageSquarePlus className="h-4 w-4" aria-hidden />
          )}
          Publicar
        </button>
      </div>
    </section>
  )
}
