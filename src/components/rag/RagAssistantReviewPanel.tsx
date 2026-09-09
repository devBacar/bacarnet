import { CheckCircle2, ClipboardCopy, Loader2, Wrench } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  fetchAssistantInteractions,
  updateAssistantInteractionDevReview,
  type AssistantInteractionDto,
  type AssistantInteractionListCategory,
} from '../../services/ragApi'

const CATEGORY_TABS: Array<{ id: AssistantInteractionListCategory; label: string }> = [
  { id: 'resolved', label: 'Resueltas' },
  { id: 'could_not_answer', label: 'No supo responder' },
  { id: 'broken', label: 'Se rompió' },
  { id: 'pending_dev_review', label: 'Pendientes de revisión' },
]

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function buildInteractionContext(interaction: AssistantInteractionDto): string {
  const lines = [
    '--- Interacción del asistente BacarNet ---',
    `ID: ${interaction.id}`,
    `Usuario: ${interaction.userEmail}`,
    `Fecha: ${formatWhen(interaction.createdAt)}`,
    `Categoría: ${interaction.category}`,
    interaction.devReviewNote ? `Nota de revisión: ${interaction.devReviewNote}` : null,
    '',
    'Pregunta:',
    interaction.question,
    '',
    'Respuesta:',
    interaction.answer,
  ]

  if (interaction.toolsUsed.length > 0) {
    lines.push('', `Tools usadas: ${interaction.toolsUsed.join(', ')}`)
  }

  return lines.filter((line) => line !== null).join('\n')
}

type DevReviewModalProps = {
  interaction: AssistantInteractionDto
  onSaved: () => void
  onCancel: () => void
}

function DevReviewModal({ interaction, onSaved, onCancel }: DevReviewModalProps) {
  const [note, setNote] = useState(interaction.devReviewNote ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await updateAssistantInteractionDevReview(interaction.id, {
        action: 'mark_pending',
        note: note.trim() || undefined,
      })
      toast.success('Marcada para revisión de desarrollo')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo marcar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-violet-200 bg-violet-50/70 p-3 dark:border-violet-900/50 dark:bg-violet-950/30">
      <label className="block text-xs font-medium text-violet-950 dark:text-violet-100" htmlFor={`dev-review-${interaction.id}`}>
        ¿Qué faltó? (opcional)
      </label>
      <textarea
        id={`dev-review-${interaction.id}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        placeholder="Ej.: cancelar eventos de calendario, leer adjuntos PDF, consultar otro buzón…"
        className="input-surface w-full rounded-lg px-3 py-2 text-sm shadow-sm input-brand-focus"
      />
      <p className="text-xs text-violet-900/80 dark:text-violet-200/80">
        Esto no entrena al asistente: queda como pendiente de desarrollo real para revisar juntos.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
          Marcar para revisión
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function InteractionCard({
  interaction,
  listCategory,
  onUpdated,
}: {
  interaction: AssistantInteractionDto
  listCategory: AssistantInteractionListCategory
  onUpdated: () => void
}) {
  const [showModal, setShowModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const isPending = interaction.devReviewStatus === 'pending'
  const allowMarkForReview =
    listCategory !== 'pending_dev_review' &&
    listCategory !== 'resolved' &&
    !isPending

  async function copyContext() {
    try {
      await navigator.clipboard.writeText(buildInteractionContext(interaction))
      toast.success('Contexto copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar el contexto')
    }
  }

  async function markDone() {
    setActionLoading(true)
    try {
      await updateAssistantInteractionDevReview(interaction.id, { action: 'mark_done' })
      toast.success('Marcada como resuelta')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        interaction.userReported
          ? 'border-amber-400 ring-2 ring-amber-200/80'
          : isPending
            ? 'border-violet-300 ring-2 ring-violet-200/70'
            : 'border-slate-200'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-2">
          <span>{interaction.userEmail}</span>
          {isPending ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-900">
              Pendiente de desarrollo
            </span>
          ) : null}
          {interaction.userReported ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
              Reportada por usuario
            </span>
          ) : interaction.userFeedback === 'up' ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
              Útil
            </span>
          ) : null}
        </div>
        <span>
          {formatWhen(interaction.createdAt)} · {interaction.latencyMs} ms
        </span>
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <p className="mb-1 font-medium text-slate-700">Pregunta</p>
          <p className="whitespace-pre-wrap break-words text-slate-900">{interaction.question}</p>
        </div>
        <div>
          <p className="mb-1 font-medium text-slate-700">Respuesta</p>
          <p className="whitespace-pre-wrap break-words text-slate-800">{interaction.answer}</p>
        </div>
        {interaction.toolsUsed.length > 0 ? (
          <p className="text-xs text-slate-500">Tools: {interaction.toolsUsed.join(', ')}</p>
        ) : null}
        {interaction.devReviewNote ? (
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-xs text-violet-950">
            <p className="font-medium">Qué faltó</p>
            <p className="mt-1 whitespace-pre-wrap">{interaction.devReviewNote}</p>
            {interaction.devReviewMarkedBy ? (
              <p className="mt-2 text-violet-800/80">
                Marcada por {interaction.devReviewMarkedBy}
                {interaction.devReviewMarkedAt
                  ? ` · ${formatWhen(interaction.devReviewMarkedAt)}`
                  : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyContext()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
          Copiar contexto
        </button>
        {allowMarkForReview && !showModal ? (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100"
          >
            <Wrench className="h-3.5 w-3.5" />
            Marcar para revisión
          </button>
        ) : null}
        {listCategory === 'pending_dev_review' && isPending ? (
          <button
            type="button"
            onClick={() => void markDone()}
            disabled={actionLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
          >
            {actionLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Marcar como resuelta
          </button>
        ) : null}
      </div>
      {allowMarkForReview && showModal ? (
        <DevReviewModal
          interaction={interaction}
          onSaved={() => {
            setShowModal(false)
            onUpdated()
          }}
          onCancel={() => setShowModal(false)}
        />
      ) : null}
    </article>
  )
}

export function RagAssistantReviewPanel() {
  const [category, setCategory] = useState<AssistantInteractionListCategory>('could_not_answer')
  const [interactions, setInteractions] = useState<AssistantInteractionDto[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchAssistantInteractions(category)
      setInteractions(result.interactions)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron cargar interacciones')
      setInteractions([])
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-heading">Revisión de interacciones</h2>
        <p className="text-sm text-body-muted">
          Preguntas reales del piloto, categorizadas automáticamente. Cuando falte una capacidad
          real (no un texto), marcala para revisión de desarrollo. Usá «Copiar contexto» para
          traer el caso a una conversación con Sistemas.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCategory(tab.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              category === tab.id
                ? 'bg-brand-primary text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-body-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando interacciones…
        </div>
      ) : interactions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          {category === 'pending_dev_review'
            ? 'No hay interacciones pendientes de revisión de desarrollo.'
            : 'Todavía no hay interacciones en esta categoría.'}
        </p>
      ) : (
        <div className="space-y-3">
          {interactions.map((interaction) => (
            <InteractionCard
              key={interaction.id}
              interaction={interaction}
              listCategory={category}
              onUpdated={() => void load()}
            />
          ))}
        </div>
      )}
    </section>
  )
}
