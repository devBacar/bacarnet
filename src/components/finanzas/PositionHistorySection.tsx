import { ChevronDown, CircleAlert } from 'lucide-react'
import { Fragment, useState } from 'react'
import type { FinanzasPosicionCierre } from '../../services/finanzasApi'
import { ETIQUETA_ESTADO_CLASES, estadoDescubierto, type EstadoDescubierto } from './estadoDescubierto'
import { formatMoneyCentavos } from './formatMoney'
import { PosicionMonto } from './PosicionMonto'

const FILAS_VISIBLES = 5

interface PositionHistorySectionProps {
  rows: FinanzasPosicionCierre[]
  isLoading: boolean
  error: Error | null
}

interface BancoDelCierre {
  bancoNombre: string
  arsCentavos: number
  usdCentavos: number
  estado: EstadoDescubierto
}

function formatDay(fechaId: string): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(year, month - 1, day))
}

/** Descubierto acordado de cada banco ese día (suma de sus cuentas corrientes en pesos). */
function bancosDelCierre(row: FinanzasPosicionCierre): BancoDelCierre[] {
  const descubiertoPorBanco = new Map<string, number>()
  for (const cuenta of row.cuentas ?? []) {
    if (cuenta.tipo !== 'CC' || cuenta.moneda !== 'ARS' || !cuenta.descubiertoCentavos) continue
    descubiertoPorBanco.set(
      cuenta.bancoNombre,
      (descubiertoPorBanco.get(cuenta.bancoNombre) ?? 0) + cuenta.descubiertoCentavos,
    )
  }
  return row.bancos.map((banco) => ({
    ...banco,
    estado: estadoDescubierto(banco.arsCentavos, descubiertoPorBanco.get(banco.bancoNombre) ?? null),
  }))
}

const PRIORIDAD_ESTADO: Record<EstadoDescubierto['clave'], number> = {
  pasado: 5,
  al_limite: 4,
  queda_poco: 3,
  sin_descubierto: 2,
  con_margen: 1,
  a_favor: 0,
}

/** El día toma el estado del banco más complicado ("Pasado" si alguno se pasó). */
function resumenDelDia(bancos: BancoDelCierre[]) {
  const conDescubierto = bancos.filter((banco) => banco.estado.descubiertoCentavos != null)
  const descubierto = conDescubierto.reduce((suma, banco) => suma + (banco.estado.descubiertoCentavos ?? 0), 0)
  // Como en Saldos: lo que realmente queda para usar (no resta lo pasado de un banco a otro).
  const leQueda = conDescubierto.reduce((suma, banco) => suma + Math.max(0, banco.estado.leQuedaCentavos ?? 0), 0)
  const peor = [...bancos].sort((a, b) => PRIORIDAD_ESTADO[b.estado.clave] - PRIORIDAD_ESTADO[a.estado.clave])[0]
  return {
    tieneDescubierto: conDescubierto.length > 0,
    descubierto,
    leQueda,
    peor: peor?.estado ?? null,
    pasados: bancos.filter((banco) => banco.estado.clave === 'pasado').map((banco) => banco.bancoNombre),
  }
}

function Etiqueta({ estado, detalle }: { estado: EstadoDescubierto; detalle?: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA_ESTADO_CLASES[estado.tono]}`}
    >
      {estado.etiqueta}
      {detalle ? ` · ${detalle}` : ''}
    </span>
  )
}

function LeQueda({ estado }: { estado: EstadoDescubierto }) {
  if (estado.leQuedaCentavos == null) return <span className="text-body-muted">—</span>
  if (estado.leQuedaCentavos < 0) {
    return (
      <span className="font-medium whitespace-nowrap text-red-600 tabular-nums dark:text-red-400">
        Pasado {formatMoneyCentavos(estado.excesoCentavos, 'ARS')}
      </span>
    )
  }
  return <span className="whitespace-nowrap tabular-nums">{formatMoneyCentavos(estado.leQuedaCentavos, 'ARS')}</span>
}

export function PositionHistorySection({ rows, isLoading, error }: PositionHistorySectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const visibles = verTodos ? rows : rows.slice(0, FILAS_VISIBLES)
  const th = 'py-1.5 pr-3 font-medium last:pr-0'
  const td = 'py-1.5 pr-3 align-middle last:pr-0'

  return (
    <section
      aria-labelledby="finanzas-historial-heading"
      className="surface-card rounded-2xl border border-t-4 border-amber-200 border-t-amber-400 bg-gradient-to-b from-amber-50/80 to-transparent to-40% p-4 dark:border-amber-900/50 dark:border-t-amber-500 dark:from-amber-950/25"
    >
      <h2 id="finanzas-historial-heading" className="text-heading text-base font-semibold">
        Historial de cierres
      </h2>
      <p className="text-body-muted mt-0.5 text-xs">
        Cómo quedó la posición a las 15 hs de cada día, con el descubierto que tenía cada banco. Tocá un
        día para verlo por banco.
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
          <div className="-mx-4 mt-2 overflow-x-auto px-4">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="text-body-muted border-b border-neutral-100 text-left text-xs dark:border-zinc-800">
                  <th className={th}>Día</th>
                  <th className={`${th} text-right`}>Pesos</th>
                  <th className={`${th} text-right`}>Descubierto</th>
                  <th className={`${th} text-right`}>Le queda para usar</th>
                  <th className={th}>Estado</th>
                  <th className={`${th} text-right`}>Dólares</th>
                  <th className={th}>
                    <span className="sr-only">Ver por banco</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((row) => {
                  const open = expanded === row.fechaId
                  const bancos = bancosDelCierre(row)
                  const dia = resumenDelDia(bancos)
                  const toggle = () => setExpanded(open ? null : row.fechaId)
                  return (
                    <Fragment key={row.fechaId}>
                      <tr
                        onClick={toggle}
                        className="cursor-pointer border-b border-neutral-100 transition hover:bg-neutral-50 dark:border-zinc-800 dark:hover:bg-zinc-800/70"
                      >
                        <td className={`${td} text-heading font-medium capitalize whitespace-nowrap`}>
                          {formatDay(row.fechaId)}
                          {!row.syncProveedor.ok ? (
                            <span
                              className="ml-1 text-amber-600 dark:text-amber-400"
                              title="Ese día no se pudo sincronizar: es el último saldo conocido"
                            >
                              <span aria-hidden>*</span>
                              <span className="sr-only">(sin sincronizar: último saldo conocido)</span>
                            </span>
                          ) : null}
                        </td>
                        <td className={`${td} text-right`}>
                          <PosicionMonto centavos={row.totales.arsCentavos} moneda="ARS" size="sm" />
                        </td>
                        <td className={`${td} text-right whitespace-nowrap tabular-nums`}>
                          {dia.tieneDescubierto ? (
                            formatMoneyCentavos(dia.descubierto, 'ARS')
                          ) : (
                            <span className="text-body-muted">—</span>
                          )}
                        </td>
                        <td className={`${td} text-right whitespace-nowrap tabular-nums`}>
                          {dia.tieneDescubierto ? (
                            formatMoneyCentavos(dia.leQueda, 'ARS')
                          ) : (
                            <span className="text-body-muted">—</span>
                          )}
                        </td>
                        <td className={td}>
                          {dia.peor ? (
                            <Etiqueta
                              estado={dia.peor}
                              detalle={dia.pasados.length > 0 ? dia.pasados.join(', ') : undefined}
                            />
                          ) : null}
                        </td>
                        <td className={`${td} text-right`}>
                          <PosicionMonto centavos={row.totales.usdCentavos} moneda="USD" size="sm" />
                        </td>
                        <td className={`${td} text-right`}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggle()
                            }}
                            aria-expanded={open}
                            aria-label={open ? 'Ocultar bancos' : 'Ver por banco'}
                            className="rounded p-0.5 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                          >
                            <ChevronDown
                              className={`h-4 w-4 text-neutral-400 transition ${open ? 'rotate-180' : ''}`}
                              aria-hidden
                            />
                          </button>
                        </td>
                      </tr>
                      {open
                        ? bancos.map((banco) => (
                            <tr
                              key={`${row.fechaId}-${banco.bancoNombre}`}
                              className="border-b border-neutral-100 bg-neutral-50 dark:border-zinc-800 dark:bg-zinc-950/40"
                            >
                              <td className={`${td} text-body-muted pl-3`}>{banco.bancoNombre}</td>
                              <td className={`${td} text-right`}>
                                <PosicionMonto centavos={banco.arsCentavos} moneda="ARS" size="sm" />
                              </td>
                              <td className={`${td} text-right whitespace-nowrap tabular-nums`}>
                                {banco.estado.descubiertoCentavos != null ? (
                                  formatMoneyCentavos(banco.estado.descubiertoCentavos, 'ARS')
                                ) : (
                                  <span className="text-body-muted">—</span>
                                )}
                              </td>
                              <td className={`${td} text-right`}>
                                <LeQueda estado={banco.estado} />
                              </td>
                              <td className={td}>
                                <Etiqueta estado={banco.estado} />
                              </td>
                              <td className={`${td} text-right`}>
                                <PosicionMonto centavos={banco.usdCentavos} moneda="USD" size="sm" />
                              </td>
                              <td className={td} />
                            </tr>
                          ))
                        : null}
                      {open && !row.syncProveedor.ok && row.syncProveedor.error ? (
                        <tr>
                          <td colSpan={7} className="pb-2 text-xs text-amber-700 dark:text-amber-300">
                            La sincronización falló: {row.syncProveedor.error}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
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
