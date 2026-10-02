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

const FILTER_CHIP_ACTIVE = 'bg-brand-primary text-white shadow-sm'
const FILTER_CHIP_IDLE =
  'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'

const BTN_SECONDARY =
  'inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'

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
    <div className="mt-4 space-y-3 rounded-lg border border-subtle bg-neutral-50 p-4 dark:bg-zinc-950/70">
      <label
        className="block text-sm font-medium text-heading"
        htmlFor={`dev-review-${interaction.id}`}
      >
        ¿Qué faltó? <span className="font-normal text-body-muted">(opcional)</span>
      </label>
      <textarea
        id={`dev-review-${interaction.id}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        placeholder="Ej.: cancelar eventos de calendario, leer adjuntos PDF, consultar otro buzón…"
        className="input-surface input-brand-focus w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed shadow-sm"
      />
      <p className="text-xs leading-relaxed text-body-muted">
        Esto no entrena al asistente: queda como pendiente de desarrollo real para revisar juntos.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
          Marcar para revisión
        </button>
        <button type="button" onClick={onCancel} className={BTN_SECONDARY}>
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

  const cardAccent = interaction.userReported
    ? 'border-amber-400/80 ring-2 ring-amber-400/25 dark:border-amber-500/60 dark:ring-amber-500/20'
    : isPending
      ? 'border-brand-primary/40 ring-2 ring-brand-primary/15 dark:border-brand-primary/50'
      : 'border-subtle'

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
    <article className={`surface-card p-4 shadow-sm ${cardAccent}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-body-muted">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-heading">{interaction.userEmail}</span>
          {isPending ? (
            <span className="rounded-full border border-brand-primary/25 bg-brand-tint/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-primary dark:bg-brand-primary/15 dark:text-blue-200">
              Pendiente de desarrollo
            </span>
          ) : null}
          {interaction.userReported ? (
            <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-100">
              Reportada por usuario
            </span>
          ) : interaction.userFeedback === 'up' ? (
            <span className="rounded-full border border-emerald-300/80 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
              Útil
            </span>
          ) : null}
        </div>
        <span className="tabular-nums">
          {formatWhen(interaction.createdAt)} · {interaction.latencyMs} ms
        </span>
      </div>

      <div className="space-y-4 text-sm leading-relaxed">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-body-muted">
            Pregunta
          </p>
          <p className="whitespace-pre-wrap break-words text-heading">{interaction.question}</p>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-body-muted">
            Respuesta
          </p>
          <p className="whitespace-pre-wrap break-words text-neutral-800 dark:text-gray-200">
            {interaction.answer}
          </p>
        </div>
        {interaction.toolsUsed.length > 0 ? (
          <p className="text-xs text-body-muted">
            <span className="font-medium text-heading">Tools:</span>{' '}
            {interaction.toolsUsed.join(', ')}
          </p>
        ) : null}
        {interaction.devReviewNote ? (
          <div className="rounded-lg border border-subtle bg-neutral-50 px-3 py-2.5 dark:bg-zinc-950/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">
              Qué faltó
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-heading">{interaction.devReviewNote}</p>
            {interaction.devReviewMarkedBy ? (
              <p className="mt-2 text-xs text-body-muted">
                Marcada por {interaction.devReviewMarkedBy}
                {interaction.devReviewMarkedAt
                  ? ` · ${formatWhen(interaction.devReviewMarkedAt)}`
                  : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-subtle pt-4">
        <button type="button" onClick={() => void copyContext()} className={BTN_SECONDARY}>
          <ClipboardCopy className="h-3.5 w-3.5" />
          Copiar contexto
        </button>
        {allowMarkForReview && !showModal ? (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/35 bg-brand-tint/30 px-3 py-1.5 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-tint/50 dark:border-brand-primary/45 dark:bg-brand-primary/10 dark:text-blue-200 dark:hover:bg-brand-primary/20"
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/60 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
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
    <section className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-heading">Revisión de interacciones</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-body-muted">
          Preguntas reales del piloto, categorizadas automáticamente. Cuando falte una capacidad
          real (no un texto), marcala para revisión de desarrollo. Usá «Copiar contexto» para
          traer el caso a una conversación con Sistemas.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar interacciones">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={category === tab.id}
            onClick={() => setCategory(tab.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              category === tab.id ? FILTER_CHIP_ACTIVE : FILTER_CHIP_IDLE
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
        <p className="surface-card rounded-xl border border-dashed border-neutral-300 p-6 text-sm leading-relaxed text-body-muted dark:border-zinc-700">
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
