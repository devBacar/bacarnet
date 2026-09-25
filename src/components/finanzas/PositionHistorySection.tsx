import { CalendarClock, ChevronDown, CircleAlert, Landmark } from 'lucide-react'
import { useState } from 'react'
import type { FinanzasPosicionCierre } from '../../services/finanzasApi'
import { PosicionMonto } from './PosicionMonto'

interface PositionHistorySectionProps {
  rows: FinanzasPosicionCierre[]
  isLoading: boolean
  error: Error | null
}

function formatDay(fechaId: string): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function PositionHistorySection({ rows, isLoading, error }: PositionHistorySectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <section aria-labelledby="finanzas-historial-heading" className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-brand-primary" aria-hidden />
          <h2 id="finanzas-historial-heading" className="text-heading text-lg font-semibold">
            Historial de cierres
          </h2>
        </div>
        <p className="text-body-muted mt-1 text-sm">
          Foto diaria de la posición bancaria a las 15:00 · últimos 30 días.
        </p>
      </div>

      {isLoading ? (
        <div className="surface-card rounded-2xl border border-neutral-200 p-6 dark:border-zinc-800">
          <div className="h-5 w-48 animate-pulse rounded bg-neutral-200 dark:bg-zinc-700" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
          No se pudo cargar el historial.
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card rounded-2xl border border-dashed border-neutral-300 px-6 py-8 text-center dark:border-zinc-700">
          <p className="text-heading text-sm font-medium">Todavía no hay cierres registrados</p>
          <p className="text-body-muted mt-1 text-xs">
            El primer cierre se guardará automáticamente a las 15:00.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {rows.map((row) => {
            const open = expanded === row.fechaId
            return (
              <article
                key={row.fechaId}
                className="border-b border-neutral-100 last:border-b-0 dark:border-zinc-800"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : row.fechaId)}
                  aria-expanded={open}
                  className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-neutral-50 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center dark:hover:bg-zinc-800/70"
                >
                  <div>
                    <p className="text-heading text-sm font-semibold capitalize">
                      {formatDay(row.fechaId)}
                    </p>
                    <p className="text-body-muted mt-0.5 text-xs">
                      {row.syncProveedor.ok ? 'Posición consolidada' : 'Último saldo conocido'}
                    </p>
                  </div>
                  <PosicionMonto centavos={row.totales.arsCentavos} moneda="ARS" size="sm" />
                  <PosicionMonto centavos={row.totales.usdCentavos} moneda="USD" size="sm" />
                  <ChevronDown
                    className={`h-5 w-5 text-neutral-400 transition ${open ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>

                {open ? (
                  <div className="border-t border-neutral-100 bg-neutral-50/70 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="grid gap-3 md:grid-cols-2">
                      {row.bancos.map((banco) => (
                        <div
                          key={banco.bancoNombre}
                          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <div className="mb-3 flex items-center gap-2">
                            <Landmark className="h-4 w-4 text-brand-primary" aria-hidden />
                            <p className="text-heading text-sm font-semibold">{banco.bancoNombre}</p>
                          </div>
                          <div className="flex flex-wrap gap-x-8 gap-y-2">
                            <PosicionMonto centavos={banco.arsCentavos} moneda="ARS" size="sm" />
                            <PosicionMonto centavos={banco.usdCentavos} moneda="USD" size="sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                    {!row.syncProveedor.ok && row.syncProveedor.error ? (
                      <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                        La sincronización falló: {row.syncProveedor.error}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
