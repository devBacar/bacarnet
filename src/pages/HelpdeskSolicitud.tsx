import { CalendarClock, CheckCircle2, Headphones, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import {
  crearSolicitud,
  fetchDisponibilidadInicial,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  type HelpdeskSlotDisponibilidad,
  type HelpdeskUrgencia,
} from '../services/helpdeskApi'
import {
  HELPDESK_BUSINESS_HOURS,
  HELPDESK_OFFICE_HOURS_SHORT_LABEL,
} from '@intranet/helpdesk-scheduling'
import {
  collectHelpdeskBusinessDayLabels,
  formatHelpdeskDayHeader,
} from '../utils/helpdeskBusinessDays'

const URGENCIA_OPTIONS: { value: HelpdeskUrgencia; label: string; hint: string }[] = [
  { value: 'baja', label: 'Baja', hint: 'Puede esperar unos días' },
  { value: 'media', label: 'Media', hint: 'Afecta el trabajo del área' },
  { value: 'alta', label: 'Alta', hint: 'Bloquea tareas críticas' },
]

const INVALID_LINK_MESSAGE =
  'Este enlace no es válido. Pedile a Sistemas que te reenvíe el correo.'

function slotKey(fecha: string, hora: string): string {
  return `${fecha}|${hora}`
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

function HelpdeskPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-surface-page)] text-brand-body dark:bg-zinc-950">
      <main className="layout-container py-8 sm:py-10">
        <div className="mx-auto w-full max-w-4xl space-y-8">{children}</div>
      </main>
    </div>
  )
}

function HelpdeskHeader() {
  return (
    <header className="space-y-3">
      <div className="flex items-center gap-3 text-brand-primary">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint/50 text-brand-primary dark:bg-brand-tint/20">
          <Headphones className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.14em]">Sistemas · Desarrollo</p>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-heading sm:text-3xl">
        Solicitar primera reunión
      </h1>
      <p className="max-w-2xl text-sm leading-relaxed text-body-muted">
        Contanos en qué podemos ayudarte, estamos a disposición. Agendá una reunión con nosotros y
        nos das más detalles.
      </p>
    </header>
  )
}

function StatusPanel({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'success'
  title: string
  children: ReactNode
}) {
  const isError = tone === 'error'
  return (
    <section
      className={
        isError
          ? 'rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30'
          : 'card-minimal p-6'
      }
    >
      <div className="flex items-start gap-3">
        {isError ? (
          <CalendarClock className="mt-0.5 h-6 w-6 shrink-0 text-red-700 dark:text-red-300" aria-hidden />
        ) : (
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-brand-primary" aria-hidden />
        )}
        <div className="min-w-0 space-y-2">
          <h2 className="text-lg font-semibold text-heading">{title}</h2>
          <div className="text-sm leading-relaxed text-body-muted">{children}</div>
        </div>
      </div>
    </section>
  )
}

export function HelpdeskSolicitud() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('t')?.trim() ?? ''

  const [loadingAvailability, setLoadingAvailability] = useState(Boolean(token))
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [slots, setSlots] = useState<HelpdeskSlotDisponibilidad[]>([])
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [problematica, setProblematica] = useState('')
  const [urgencia, setUrgencia] = useState<HelpdeskUrgencia | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{ fecha: string; hora: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const availabilityRequestRef = useRef(0)

  const slotMap = useMemo(() => {
    const map = new Map<string, HelpdeskSlotDisponibilidad>()
    for (const slot of slots ?? []) {
      map.set(slotKey(slot.fecha, slot.hora), slot)
    }
    return map
  }, [slots])

  const dayColumns = useMemo(
    () => collectHelpdeskBusinessDayLabels(semanaOffset),
    [semanaOffset],
  )

  const loadAvailability = useCallback(
    async (offset: number, options?: { clearSelection?: boolean }) => {
      if (!token) return
      const requestId = ++availabilityRequestRef.current
      setLoadingAvailability(true)
      if (options?.clearSelection !== false) {
        setSelectedSlot(null)
      }
      try {
        const data = await fetchDisponibilidadInicial(token, offset)
        if (requestId !== availabilityRequestRef.current) return
        setSlots(Array.isArray(data.slots) ? data.slots : [])
        setFatalError(null)
      } catch (err) {
        if (err instanceof HelpdeskApiError && err.status === 401) {
          setFatalError(err.message)
          setSlots([])
          return
        }
        const message =
          err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE
        toast.error(message)
      } finally {
        if (requestId === availabilityRequestRef.current) {
          setLoadingAvailability(false)
        }
      }
    },
    [token],
  )

  useEffect(() => {
    if (!token) return
    void loadAvailability(semanaOffset)
  }, [token, semanaOffset, loadAvailability])

  const canSubmit =
    Boolean(problematica.trim()) &&
    urgencia !== null &&
    selectedSlot !== null &&
    !submitting &&
    !loadingAvailability

  const handleSubmit = async () => {
    if (!token || !urgencia || !selectedSlot || !canSubmit) return

    setSubmitting(true)
    try {
      await crearSolicitud({
        token,
        problematica: problematica.trim(),
        urgencia,
        fecha: selectedSlot.fecha,
        hora: selectedSlot.hora,
      })
      setSubmitted(true)
    } catch (err) {
      if (err instanceof HelpdeskApiError) {
        if (err.status === 401) {
          setFatalError(err.message)
          return
        }
        if (err.status === 409 && err.code === 'slot_ocupado') {
          toast.error(err.message)
          await loadAvailability(semanaOffset)
          return
        }
        toast.error(err.message)
        return
      }
      toast.error(HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <HelpdeskPageShell>
        <HelpdeskHeader />
        <StatusPanel tone="error" title="Enlace inválido">
          <p>{INVALID_LINK_MESSAGE}</p>
        </StatusPanel>
      </HelpdeskPageShell>
    )
  }

  if (submitted) {
    return (
      <HelpdeskPageShell>
        <StatusPanel tone="success" title="Proyecto enviado">
          <p>
            Recibimos tu pedido. Te va a llegar la invitación de la reunión por correo con el
            horario que elegiste.
          </p>
          <p className="mt-2">Podés cerrar esta pestaña.</p>
        </StatusPanel>
      </HelpdeskPageShell>
    )
  }

  if (fatalError) {
    return (
      <HelpdeskPageShell>
        <HelpdeskHeader />
        <StatusPanel tone="error" title="No podemos abrir este formulario">
          <p>{fatalError}</p>
        </StatusPanel>
      </HelpdeskPageShell>
    )
  }

  return (
    <HelpdeskPageShell>
      <HelpdeskHeader />

      <div className="space-y-6">
        <section className="card-minimal p-5 sm:p-6">
          <label htmlFor="helpdesk-problematica" className="block text-sm font-semibold text-heading">
            ¿Qué necesitás resolver?
          </label>
          <p className="mt-1 text-sm text-body-muted">
            Contanos el contexto: qué falla, desde cuándo y qué impacto tiene en el área.
          </p>
          <textarea
            id="helpdesk-problematica"
            value={problematica}
            onChange={(e) => setProblematica(e.target.value)}
            rows={5}
            required
            placeholder="Ej.: No puedo acceder a… / Necesitamos integrar…"
            className="input-brand-focus input-surface mt-3 w-full resize-y rounded-lg px-3 py-2.5 text-sm shadow-sm"
          />
        </section>

        <section className="card-minimal p-5 sm:p-6">
          <p className="text-sm font-semibold text-heading">Urgencia</p>
          <p className="mt-1 text-sm text-body-muted">Elegí la opción que mejor describa la situación.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {URGENCIA_OPTIONS.map((option) => {
              const selected = urgencia === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setUrgencia(option.value)}
                  className={`rounded-full border px-4 py-2 text-left text-sm transition-colors ${
                    selected
                      ? 'border-brand-primary bg-brand-tint/50 text-brand-primary dark:bg-brand-tint/20'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-brand-primary/30 hover:bg-brand-tint/30 hover:text-brand-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300'
                  }`}
                >
                  <span className="font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-body-muted">{option.hint}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="card-minimal p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-heading">Horario de reunión</p>
              <p className="mt-1 text-sm text-body-muted">
                Elegí un turno libre (duración aproximada 45 min). Horario de oficina{' '}
                {HELPDESK_OFFICE_HOURS_SHORT_LABEL}.
              </p>
            </div>
            <button
              type="button"
              disabled={loadingAvailability}
              onClick={() => setSemanaOffset((prev) => prev + 1)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-primary/30 hover:bg-brand-tint/30 hover:text-brand-primary disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300"
            >
              Semana siguiente
            </button>
          </div>

          <div className="relative mt-6 overflow-x-auto">
            {loadingAvailability ? (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-zinc-900/80"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="flex items-center gap-2 text-sm text-body-muted">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-primary" aria-hidden />
                  Cargando horarios…
                </div>
              </div>
            ) : null}
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-body-muted dark:bg-zinc-900">
                    Hora
                  </th>
                  {dayColumns.map((fecha) => (
                    <th
                      key={fecha}
                      className="min-w-[5.5rem] px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-body-muted"
                    >
                      {formatHelpdeskDayHeader(fecha)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HELPDESK_BUSINESS_HOURS.map((hour) => {
                  const hora = formatHourLabel(hour)
                  return (
                    <tr key={hora} className="border-t border-neutral-100 dark:border-zinc-800">
                      <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-heading dark:bg-zinc-900">
                        {hora}
                      </td>
                      {dayColumns.map((fecha) => {
                        const entry = slotMap.get(slotKey(fecha, hora))
                        if (!entry) {
                          return (
                            <td key={fecha} className="px-1 py-1.5 text-center text-neutral-300">
                              —
                            </td>
                          )
                        }
                        const isSelected =
                          selectedSlot?.fecha === fecha && selectedSlot?.hora === hora
                        const disabled = !entry.libre || loadingAvailability
                        return (
                          <td key={fecha} className="px-1 py-1.5">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => setSelectedSlot({ fecha, hora })}
                              aria-pressed={isSelected}
                              aria-label={`${fecha} ${hora}${entry.libre ? ', disponible' : ', ocupado'}`}
                              className={`h-9 w-full rounded-md border text-xs font-medium transition-colors ${
                                !entry.libre
                                  ? 'cursor-not-allowed border-neutral-100 bg-neutral-100 text-neutral-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-600'
                                  : isSelected
                                    ? 'border-brand-primary bg-brand-primary text-white shadow-sm ring-2 ring-brand ring-offset-1 dark:ring-offset-zinc-900'
                                    : 'border-neutral-200 bg-white text-brand-primary hover:border-brand-primary/40 hover:bg-brand-tint/40 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-brand-tint/20'
                              }`}
                            >
                              {entry.libre ? (isSelected ? 'Elegido' : 'Libre') : 'Ocupado'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-100 pt-2 dark:border-zinc-800">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            className="btn-primary inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Enviando…
              </>
            ) : (
              'Enviar proyecto'
            )}
          </button>
        </div>
      </div>
    </HelpdeskPageShell>
  )
}
