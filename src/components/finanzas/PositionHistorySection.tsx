import { CircleAlert } from 'lucide-react'
import { Fragment, useState, type CSSProperties, type ReactNode } from 'react'
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
      className={`inline-flex max-w-full whitespace-normal rounded-full px-2 py-0.5 text-left text-xs font-medium ${ETIQUETA_ESTADO_CLASES[estado.tono]}`}
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
      <span className="font-medium text-red-600 tabular-nums dark:text-red-400">
        Pasado {formatMoneyCentavos(estado.excesoCentavos, 'ARS')}
      </span>
    )
  }
  return <span className="tabular-nums">{formatMoneyCentavos(estado.leQuedaCentavos, 'ARS')}</span>
}

function CifraOGuion({ mostrar, centavos }: { mostrar: boolean; centavos: number }) {
  if (!mostrar) return <span className="text-body-muted">—</span>
  return <span className="tabular-nums">{formatMoneyCentavos(centavos, 'ARS')}</span>
}

function NombreDia({ row, abierto }: { row: FinanzasPosicionCierre; abierto: boolean }) {
  return (
    <span className={`capitalize ${abierto ? '' : 'text-heading font-medium'}`}>
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
    </span>
  )
}

function EstadoDia({ dia }: { dia: ReturnType<typeof resumenDelDia> }) {
  if (!dia.peor) return null
  return <Etiqueta estado={dia.peor} detalle={dia.pasados.length > 0 ? dia.pasados.join(', ') : undefined} />
}

function Flecha({ abierta }: { abierta: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-4 text-center text-base leading-none ${
        abierta ? '' : 'text-neutral-500 dark:text-zinc-400'
      }`}
    >
      {abierta ? '▾' : '▸'}
    </span>
  )
}

function CampoBanco({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-muted shrink-0">{etiqueta}</dt>
      <dd className="min-w-0 text-right [&_span]:text-sm">{children}</dd>
    </div>
  )
}

const RECUADRO_DETALLE: CSSProperties = {
  borderStyle: 'solid',
  borderWidth: '1px 1px 1px 3px',
  borderColor: 'var(--color-primary-muted)',
  borderLeftColor: 'var(--color-primary)',
}

function DetalleBancos({
  bancos,
  syncError,
  lista,
}: {
  bancos: BancoDelCierre[]
  syncError: string | null
  lista: boolean
}) {
  return (
    <div className="rounded-none bg-white dark:bg-zinc-900" style={RECUADRO_DETALLE}>
      {bancos.length === 0 ? (
        <p className="text-body-muted px-2.5 py-2 text-xs">Este cierre no tiene bancos.</p>
      ) : lista ? (
        <ul className="divide-y divide-neutral-200 dark:divide-zinc-800">
          {bancos.map((banco) => (
            <li key={banco.bancoNombre} className="px-2.5 py-2">
              <p className="text-heading text-sm font-medium">{banco.bancoNombre}</p>
              <dl className="mt-1.5 space-y-1 text-xs">
                <CampoBanco etiqueta="Pesos">
                  <PosicionMonto centavos={banco.arsCentavos} moneda="ARS" size="sm" />
                </CampoBanco>
                <CampoBanco etiqueta="Descubierto">
                  <CifraOGuion
                    mostrar={banco.estado.descubiertoCentavos != null}
                    centavos={banco.estado.descubiertoCentavos ?? 0}
                  />
                </CampoBanco>
                <CampoBanco etiqueta="Le queda">
                  <LeQueda estado={banco.estado} />
                </CampoBanco>
                <CampoBanco etiqueta="Estado">
                  <Etiqueta estado={banco.estado} />
                </CampoBanco>
                <CampoBanco etiqueta="Dólares">
                  <PosicionMonto centavos={banco.usdCentavos} moneda="USD" size="sm" />
                </CampoBanco>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="text-body-muted border-b border-neutral-200 text-left dark:border-zinc-700">
              <th className="w-[18%] px-2 py-1 font-medium">Banco</th>
              <th className="w-[16%] px-2 py-1 text-right font-medium">Pesos</th>
              <th className="w-[16%] px-2 py-1 text-right font-medium">Descubierto</th>
              <th className="w-[18%] px-2 py-1 text-right font-medium">Le queda</th>
              <th className="w-[16%] px-2 py-1 font-medium">Estado</th>
              <th className="w-[16%] px-2 py-1 text-right font-medium">Dólares</th>
            </tr>
          </thead>
          <tbody>
            {bancos.map((banco) => (
              <tr key={banco.bancoNombre} className="border-b border-neutral-100 last:border-b-0 dark:border-zinc-800">
                <td className="text-heading px-2 py-1 align-middle font-medium break-words">{banco.bancoNombre}</td>
                <td className="px-2 py-1 text-right align-middle [&_span]:text-xs [&_span]:tracking-tight">
                  <PosicionMonto centavos={banco.arsCentavos} moneda="ARS" size="sm" />
                </td>
                <td className="px-2 py-1 text-right align-middle tabular-nums">
                  <CifraOGuion
                    mostrar={banco.estado.descubiertoCentavos != null}
                    centavos={banco.estado.descubiertoCentavos ?? 0}
                  />
                </td>
                <td className="px-2 py-1 text-right align-middle">
                  <LeQueda estado={banco.estado} />
                </td>
                <td className="px-2 py-1 align-middle">
                  <Etiqueta estado={banco.estado} />
                </td>
                <td className="px-2 py-1 text-right align-middle [&_span]:text-xs [&_span]:tracking-tight">
                  <PosicionMonto centavos={banco.usdCentavos} moneda="USD" size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {syncError ? (
        <p className="border-t border-neutral-200 px-2.5 py-1.5 text-xs text-amber-700 dark:border-zinc-700 dark:text-amber-300">
          La sincronización falló: {syncError}
        </p>
      ) : null}
    </div>
  )
}

export function PositionHistorySection({ rows, isLoading, error }: PositionHistorySectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const visibles = verTodos ? rows : rows.slice(0, FILAS_VISIBLES)
  const preparados = visibles.map((row) => {
    const bancos = bancosDelCierre(row)
    const dia = resumenDelDia(bancos)
    const syncError = !row.syncProveedor.ok && row.syncProveedor.error ? row.syncProveedor.error : null
    return { row, bancos, dia, syncError }
  })
  const th = 'px-1 py-1.5 align-bottom text-xs font-medium leading-tight'
  const tdBase = 'px-1 py-2 align-middle'
  const tdAbierto = `${tdBase} bg-[var(--color-primary-light)] font-medium text-[var(--color-primary)]`
  const tdCerrado = `${tdBase} border-b border-neutral-200 dark:border-zinc-700`

  return (
    <section
      data-tour="saldos-historial"
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
          <div className="mt-2 md:hidden">
            {preparados.map(({ row, bancos, dia, syncError }) => {
              const open = expanded === row.fechaId
              const toggle = () => setExpanded(open ? null : row.fechaId)
              return (
                <div key={row.fechaId} className="border-b border-neutral-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={open}
                    className={`w-full px-0.5 py-2.5 text-left text-sm ${
                      open
                        ? 'bg-[var(--color-primary-light)] font-medium text-[var(--color-primary)]'
                        : 'hover:bg-neutral-50 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <NombreDia row={row} abierto={open} />
                      <Flecha abierta={open} />
                      <span className="sr-only">{open ? 'Ocultar bancos' : 'Ver por banco'}</span>
                    </span>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-normal">
                      <div className="min-w-0">
                        <dt className="text-body-muted">Pesos</dt>
                        <dd className="mt-0.5 min-w-0 [&_span]:text-sm">
                          <PosicionMonto centavos={row.totales.arsCentavos} moneda="ARS" size="sm" />
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-body-muted">Descubierto</dt>
                        <dd className="mt-0.5">
                          <CifraOGuion mostrar={dia.tieneDescubierto} centavos={dia.descubierto} />
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-body-muted">Le queda para usar</dt>
                        <dd className="mt-0.5">
                          <CifraOGuion mostrar={dia.tieneDescubierto} centavos={dia.leQueda} />
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-body-muted">Estado</dt>
                        <dd className="mt-0.5">
                          <EstadoDia dia={dia} />
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-body-muted">Dólares</dt>
                        <dd className="mt-0.5 min-w-0 [&_span]:text-sm">
                          <PosicionMonto centavos={row.totales.usdCentavos} moneda="USD" size="sm" />
                        </dd>
                      </div>
                    </dl>
                  </button>
                  {open ? (
                    <div className="bg-[var(--color-primary-light)] px-[10px] pb-[10px]">
                      <DetalleBancos bancos={bancos} syncError={syncError} lista />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="mt-2 hidden md:block">
            <table className="w-full table-fixed border-collapse text-left text-xs xl:text-sm">
              <thead>
                <tr className="text-body-muted border-b border-neutral-200 dark:border-zinc-700">
                  <th className={`${th} w-[13%]`}>Día</th>
                  <th className={`${th} w-[17%] text-right`}>Pesos</th>
                  <th className={`${th} w-[16%] text-right`}>Descubierto</th>
                  <th className={`${th} w-[17%] text-right`}>Le queda para usar</th>
                  <th className={`${th} w-[15%]`}>Estado</th>
                  <th className={`${th} w-[16%] text-right`}>Dólares</th>
                  <th className={`${th} w-[6%]`}>
                    <span className="sr-only">Ver por banco</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {preparados.map(({ row, bancos, dia, syncError }) => {
                  const open = expanded === row.fechaId
                  const toggle = () => setExpanded(open ? null : row.fechaId)
                  const td = open ? tdAbierto : tdCerrado
                  return (
                    <Fragment key={row.fechaId}>
                      <tr
                        onClick={toggle}
                        className={
                          open
                            ? 'cursor-pointer'
                            : 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-zinc-800/60'
                        }
                      >
                        <td className={td}>
                          <NombreDia row={row} abierto={open} />
                        </td>
                        <td className={`${td} text-right [&_span]:text-xs [&_span]:tracking-tight xl:[&_span]:text-sm`}>
                          <PosicionMonto centavos={row.totales.arsCentavos} moneda="ARS" size="sm" />
                        </td>
                        <td className={`${td} text-right`}>
                          <CifraOGuion mostrar={dia.tieneDescubierto} centavos={dia.descubierto} />
                        </td>
                        <td className={`${td} text-right`}>
                          <CifraOGuion mostrar={dia.tieneDescubierto} centavos={dia.leQueda} />
                        </td>
                        <td className={td}>
                          <EstadoDia dia={dia} />
                        </td>
                        <td className={`${td} text-right [&_span]:tracking-tight [&_span]:text-xs xl:[&_span]:text-sm`}>
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
                            className="rounded px-0.5 leading-none"
                          >
                            <Flecha abierta={open} />
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="border-b border-neutral-200 bg-[var(--color-primary-light)] px-[10px] pt-0 pb-[10px] dark:border-zinc-700"
                          >
                            <DetalleBancos bancos={bancos} syncError={syncError} lista={false} />
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
