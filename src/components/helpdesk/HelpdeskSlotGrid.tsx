import { Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import type { HelpdeskSlotDisponibilidad } from '../../services/helpdeskApi'
import {
  HELPDESK_BUSINESS_HOURS,
  HELPDESK_OFFICE_HOURS_SHORT_LABEL,
} from '@intranet/helpdesk-scheduling'
import { collectHelpdeskBusinessDayLabels, formatHelpdeskDayHeader } from '../../utils/helpdeskBusinessDays'

function slotKey(fecha: string, hora: string): string {
  return `${fecha}|${hora}`
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export function HelpdeskSlotGrid({
  slots,
  semanaOffset,
  loading,
  selectedSlot,
  onSelectSlot,
  onNextWeek,
}: {
  slots: HelpdeskSlotDisponibilidad[]
  semanaOffset: number
  loading: boolean
  selectedSlot: { fecha: string; hora: string } | null
  onSelectSlot: (slot: { fecha: string; hora: string }) => void
  onNextWeek: () => void
}) {
  const slotMap = useMemo(() => {
    const map = new Map<string, HelpdeskSlotDisponibilidad>()
    for (const slot of slots) {
      map.set(slotKey(slot.fecha, slot.hora), slot)
    }
    return map
  }, [slots])

  const dayColumns = useMemo(() => {
    if (slots.length > 0) {
      const seen = new Set<string>()
      const dates: string[] = []
      for (const slot of slots) {
        if (!seen.has(slot.fecha)) {
          seen.add(slot.fecha)
          dates.push(slot.fecha)
        }
      }
      return dates
    }
    return collectHelpdeskBusinessDayLabels(semanaOffset)
  }, [slots, semanaOffset])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-body-muted">
          Elegí un turno libre (45 min aprox., {HELPDESK_OFFICE_HOURS_SHORT_LABEL}).
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={onNextWeek}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-primary/30 hover:bg-brand-tint/30 hover:text-brand-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300"
        >
          Semana siguiente
        </button>
      </div>

      <div className="relative mt-4 overflow-x-auto">
        {loading ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/75 dark:bg-zinc-900/75"
            aria-live="polite"
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
                    const disabled = !entry.libre || loading
                    return (
                      <td key={fecha} className="px-1 py-1.5">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onSelectSlot({ fecha, hora })}
                          aria-pressed={isSelected}
                          className={`h-9 w-full rounded-md border text-xs font-medium transition-colors ${
                            !entry.libre
                              ? 'cursor-not-allowed border-neutral-100 bg-neutral-100 text-neutral-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-600'
                              : isSelected
                                ? 'border-brand-primary bg-brand-primary text-white'
                                : 'border-neutral-200 bg-white text-brand-primary hover:border-brand-primary/40 hover:bg-brand-tint/40 dark:border-zinc-700 dark:bg-zinc-950'
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
    </div>
  )
}
