import { ChevronDown, CircleAlert } from 'lucide-react'
import { useState } from 'react'
import type { FinanzasPosicionCierre } from '../../services/finanzasApi'
import { PosicionMonto } from './PosicionMonto'

const FILAS_VISIBLES = 5

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
  }).format(new Date(year, month - 1, day))
}

export function PositionHistorySection({ rows, isLoading, error }: PositionHistorySectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const visibles = verTodos ? rows : rows.slice(0, FILAS_VISIBLES)

  return (
    <section
      aria-labelledby="finanzas-historial-heading"
      className="surface-card rounded-2xl border border-t-4 border-amber-200 border-t-amber-400 bg-gradient-to-b from-amber-50/80 to-transparent to-40% p-4 dark:border-amber-900/50 dark:border-t-amber-500 dark:from-amber-950/25"
    >
      <h2 id="finanzas-historial-heading" className="text-heading text-base font-semibold">
        Historial de cierres
      </h2>
      <p className="text-body-muted mt-0.5 text-xs">
        Cómo quedó la posición a las 15 hs de cada día. Tocá un día para verlo por banco.
      </p>

      {isLoading ? (
        <div className="mt-3 h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-zinc-800" />
      ) : error ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
          No se pudo cargar el historial.
        </div>
      ) : rows.length === 0 ? (
        <p className="text-body-muted mt-3 text-sm">
          Todavía no hay cierres. El primero se guarda solo a las 15 hs.
        </p>
      ) : (
        <>
          <ul className="mt-2">
            {visibles.map((row) => {
              const open = expanded === row.fechaId
              return (
                <li
                  key={row.fechaId}
                  className="border-b border-neutral-100 last:border-b-0 dark:border-zinc-800"
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : row.fechaId)}
                    aria-expanded={open}
                    className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto_auto] items-center gap-3 py-1.5 text-left text-sm transition hover:bg-neutral-50 dark:hover:bg-zinc-800/70"
                  >
                    <span className="text-heading font-medium capitalize">
                      {formatDay(row.fechaId)}
                      {!row.syncProveedor.ok ? (
                        <span
                          className="ml-1 text-amber-600 dark:text-amber-400"
                          title="Ese día no se pudo sincronizar: es el último saldo conocido"
                        >
                          <span aria-hidden>*</span>
                          <span className="sr-only">
                            (sin sincronizar: último saldo conocido)
                          </span>
                        </span>
                      ) : null}
                    </span>
                    <PosicionMonto centavos={row.totales.arsCentavos} moneda="ARS" size="sm" />
                    <PosicionMonto centavos={row.totales.usdCentavos} moneda="USD" size="sm" />
                    <ChevronDown
                      className={`h-4 w-4 text-neutral-400 transition ${open ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>

                  {open ? (
                    <div className="mb-2 space-y-1 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-zinc-950/40">
                      {row.bancos.map((banco) => (
                        <div
                          key={banco.bancoNombre}
                          className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
                        >
                          <span className="text-body-muted">{banco.bancoNombre}</span>
                          <PosicionMonto centavos={banco.arsCentavos} moneda="ARS" size="sm" />
                          <PosicionMonto centavos={banco.usdCentavos} moneda="USD" size="sm" />
                        </div>
                      ))}
                      {!row.syncProveedor.ok && row.syncProveedor.error ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          La sincronización falló: {row.syncProveedor.error}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {rows.length > FILAS_VISIBLES ? (
            <button
              type="button"
              onClick={() => setVerTodos((prev) => !prev)}
              className="text-brand-primary mt-2 text-xs font-medium hover:underline"
            >
              {verTodos ? 'Ver menos' : `Ver los ${rows.length} días`}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
