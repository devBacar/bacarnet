import { AlertTriangle, BarChart3, Loader2, MessageSquareText, RefreshCw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { RagAssistantReviewPanel } from '../components/rag/RagAssistantReviewPanel'
import { RagAssistantUsagePanel } from '../components/rag/RagAssistantUsagePanel'
import { useAuth } from '../context'
import { isSuperAdmin } from '../services/userService'
import {
  askRagPilot,
  fetchRagStatus,
  isRegulatoryRagError,
  reindexRagPilot,
  type RagAskResponse,
  type RagStatusResponse,
} from '../services/ragApi'

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

type MainTab = 'review' | 'usage' | 'pilot'

export function RagPilotSistemas() {
  const { userProfile } = useAuth()
  const isSuperAdminUser = isSuperAdmin(userProfile)
  const [mainTab, setMainTab] = useState<MainTab>('review')
  const [status, setStatus] = useState<RagStatusResponse | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [answer, setAnswer] = useState<RagAskResponse | null>(null)
  const [regulatoryAlert, setRegulatoryAlert] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const next = await fetchRagStatus()
      setStatus(next)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar el estado del piloto')
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  async function handleAsk(event: FormEvent) {
    event.preventDefault()
    const trimmed = question.trim()
    if (trimmed.length < 4) {
      toast.error('Escribí una pregunta un poco más larga')
      return
    }

    setAsking(true)
    setAnswer(null)
    setRegulatoryAlert(null)
    try {
      const result = await askRagPilot(trimmed)
      setAnswer(result)
      if (result.regulatoryNotice) {
        setRegulatoryAlert(result.regulatoryNotice)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Consulta fallida'
      if (isRegulatoryRagError(message)) {
        setRegulatoryAlert(message)
      }
      toast.error(message, { duration: 8000 })
    } finally {
      setAsking(false)
    }
  }

  async function handleReindex() {
    setReindexing(true)
    try {
      const result = await reindexRagPilot()
      if (result.ok) {
        toast.success(
          `Índice actualizado: ${result.stats?.chunksWritten ?? 0} chunks en ${Math.round(result.latencyMs / 1000)}s`,
        )
      } else {
        toast.error('Reindexación completada con violaciones regulatorias', { duration: 10000 })
      }
      await refreshStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo reindexar')
    } finally {
      setReindexing(false)
    }
  }

  const indexState = status?.indexState
  const chunksReady = (indexState?.chunkCount ?? 0) > 0

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-brand-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
          <h1 className="text-2xl font-semibold text-heading">Piloto: Sistemas</h1>
        </div>
        <p className="text-sm text-body-muted">
          Revisión de interacciones reales y herramientas de diagnóstico del asistente.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setMainTab('review')}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            mainTab === 'review'
              ? 'bg-brand-primary text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          Revisión
        </button>
        {isSuperAdminUser ? (
          <button
            type="button"
            onClick={() => setMainTab('usage')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
              mainTab === 'usage'
                ? 'bg-brand-primary text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="h-4 w-4" aria-hidden />
            Consumo
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setMainTab('pilot')}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            mainTab === 'pilot'
              ? 'bg-brand-primary text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          Estado del piloto
        </button>
      </div>

      {mainTab === 'review' ? <RagAssistantReviewPanel /> : null}

      {mainTab === 'usage' && isSuperAdminUser ? <RagAssistantUsagePanel /> : null}

      {mainTab === 'pilot' ? (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="space-y-1">
                <p className="font-medium">Exclusiones regulatorias activas</p>
                <p>
                  Documentos <strong>RESTRINGIDO</strong> y todo el área de{' '}
                  <strong>{status?.excludedAreaLabels?.[status.excludedGoverningAreaIds[0] ?? ''] ?? 'Cumplimiento'}</strong>{' '}
                  quedan fuera del índice y de las respuestas.
                </p>
                {status?.regulatoryMessage ? (
                  <p className="text-amber-900/90">{status.regulatoryMessage}</p>
                ) : null}
              </div>
            </div>
          </div>

          {!status?.enabled ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              El flag global <code className="rounded bg-white px-1">rag.enabled</code> sigue en{' '}
              <strong>false</strong>.
              {isSuperAdminUser
                ? ' Solo super_admin puede probar consultas hasta activarlo; luego quedará habilitado para cuentas con permiso Asistente BacarNet.'
                : ' El asistente estará disponible para tu cuenta cuando Sistemas active el piloto.'}
            </div>
          ) : null}

          {regulatoryAlert ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {regulatoryAlert}
            </div>
          ) : null}

          <section className="surface-card p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium text-heading">Estado del índice</h2>
                {loadingStatus ? (
                  <p className="text-sm text-body-muted">Cargando…</p>
                ) : (
                  <p className="text-sm text-body-muted">
                    {chunksReady
                      ? `${indexState?.chunkCount ?? 0} chunks · ${indexState?.fileCount ?? 0} archivos · última indexación ${formatWhen(indexState?.lastIndexedAt)}`
                      : 'Sin índice listo — hay que reindexar el contenido actual de Sistemas.'}
                  </p>
                )}
              </div>
              {(status?.canReindex ?? isSuperAdminUser) ? (
                <button
                  type="button"
                  onClick={() => void handleReindex()}
                  disabled={reindexing || status?.reindexInProgress}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {reindexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Actualizar índice
                </button>
              ) : null}
            </div>

            <form onSubmit={handleAsk} className="space-y-3">
              <label className="block text-sm font-medium text-heading" htmlFor="rag-question">
                Pregunta de prueba
              </label>
              <textarea
                id="rag-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                placeholder="Ej.: ¿Qué mails me llegaron hoy a la bandeja de entrada?"
                className="input-surface w-full rounded-lg px-3 py-2 text-sm shadow-sm input-brand-focus"
              />
              {!loadingStatus && !chunksReady ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  El índice todavía no está listo; no se pueden enviar consultas hasta que haya chunks indexados.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={asking || loadingStatus || !chunksReady}
                  className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                >
                  {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                  Consultar
                </button>
              </div>
            </form>
          </section>

          {answer ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium text-slate-900">Respuesta</h2>
                <span className="text-xs text-slate-500">{answer.latencyMs} ms · como {answer.impersonatedAs}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                {answer.answer}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
