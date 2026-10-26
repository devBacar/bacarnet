import { type ReactNode, useMemo, useState } from 'react'
import type {
  CuentaCompleta,
  EstadoCuotaCalendario,
  KpisMoneda,
  MonedaCuenta,
  MovimientoCuenta,
} from '../../../services/finanzasInversionesApi'
import { formatMoneyCentavos } from '../formatMoney'

function formatFecha(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

function diasHasta(hoy: string, fecha: string): number {
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000)
}

function textoDias(dias: number): string {
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias < 0) return `hace ${-dias} días`
  return `en ${dias} días`
}

const NOMBRE_MONEDA: Record<MonedaCuenta, string> = { ARS: 'Pesos', USD: 'Dólares' }

// ── Piezas visuales ──────────────────────────────────────────

type Tono = 'rojo' | 'ambar' | 'verde' | 'azul' | 'violeta' | 'neutro'

const TONO_TARJETA: Record<Tono, string> = {
  rojo: 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30',
  ambar: 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30',
  verde: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30',
  azul: 'border-sky-200 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30',
  violeta: 'border-violet-200 bg-violet-50 dark:border-violet-900/60 dark:bg-violet-950/30',
  neutro: 'border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
}

const TONO_TEXTO: Record<Tono, string> = {
  rojo: 'text-red-700 dark:text-red-300',
  ambar: 'text-amber-800 dark:text-amber-300',
  verde: 'text-emerald-700 dark:text-emerald-300',
  azul: 'text-sky-800 dark:text-sky-300',
  violeta: 'text-violet-700 dark:text-violet-300',
  neutro: 'text-heading',
}

const TONO_CHIP: Record<Tono, string> = {
  rojo: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  ambar: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  verde: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  azul: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  violeta: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  neutro: 'bg-neutral-100 text-neutral-700 dark:bg-zinc-800 dark:text-zinc-300',
}

function Chip({ tono, children }: { tono: Tono; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONO_CHIP[tono]}`}>
      {children}
    </span>
  )
}

function Tarjeta({
  tono,
  titulo,
  valor,
  detalle,
}: {
  tono: Tono
  titulo: string
  valor: ReactNode
  detalle?: ReactNode
}) {
  return (
    <div className={`rounded-2xl border p-4 ${TONO_TARJETA[tono]}`}>
      <p className="text-body-muted text-sm font-medium">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${TONO_TEXTO[tono]}`}>{valor}</p>
      {detalle ? <p className="text-body-muted mt-1 text-xs">{detalle}</p> : null}
    </div>
  )
}

function Segmentos<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: ReadonlyArray<{ id: T; texto: string; cuenta?: number }>
  valor: T
  onCambio: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1 dark:border-zinc-800 dark:bg-zinc-950">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onCambio(o.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            valor === o.id
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-body-muted hover:bg-white dark:hover:bg-zinc-800'
          }`}
        >
          {o.texto}
          {o.cuenta != null ? <span className="ml-1.5 opacity-75">({o.cuenta})</span> : null}
        </button>
      ))}
    </div>
  )
}

function Aviso({ tono, titulo, children }: { tono: Tono; titulo: string; children?: ReactNode }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${TONO_TARJETA[tono]}`}>
      <p className={`font-semibold ${TONO_TEXTO[tono]}`}>{titulo}</p>
      {children ? <div className="text-body-muted mt-1 text-sm">{children}</div> : null}
    </div>
  )
}

const ESTADO_CUOTA: Record<EstadoCuotaCalendario, { tono: Tono; texto: string }> = {
  pagada: { tono: 'verde', texto: 'Pagada' },
  pendiente: { tono: 'azul', texto: 'A pagar' },
  vencida: { tono: 'rojo', texto: 'Atrasada' },
}

const TIPO_MOVIMIENTO: Record<MovimientoCuenta['tipo'], { tono: Tono; texto: string }> = {
  ingreso_capital: { tono: 'violeta', texto: 'Entró capital' },
  cuota_pagada: { tono: 'verde', texto: 'Cuota pagada' },
  cuota_parcial: { tono: 'ambar', texto: 'Pago parcial' },
}

// ── Resumen de una moneda ────────────────────────────────────

function ResumenMoneda({ k, hoy }: { k: KpisMoneda; hoy: string }) {
  const m = k.moneda
  const total = k.pagadoCentavos + k.aPagarTotalCentavos
  const pctPagado = total > 0 ? Math.round((k.pagadoCentavos / total) * 100) : 0
  const prox = k.proximoVencimiento

  return (
    <div className="space-y-4">
      {/* Bloque principal: cuánto falta y cuánto va pagado */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-body-muted text-sm font-medium">Falta pagar</p>
            <p className="text-heading text-3xl font-bold tabular-nums sm:text-4xl">
              {formatMoneyCentavos(k.aPagarTotalCentavos, m)}
            </p>
            <p className="text-body-muted mt-1 text-sm">
              {k.cuotasPendientes === 0
                ? 'No quedan cuotas por pagar'
                : `${k.cuotasPendientes} ${k.cuotasPendientes === 1 ? 'cuota pendiente' : 'cuotas pendientes'}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-body-muted text-sm font-medium">Ya pagado</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatMoneyCentavos(k.pagadoCentavos, m)}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-3 overflow-hidden rounded-full bg-neutral-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pctPagado}%` }} />
          </div>
          <p className="text-body-muted mt-1.5 text-xs">Pagado el {pctPagado} % del total comprometido</p>
        </div>
        {prox ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-sm dark:bg-zinc-950">
            <span className="text-body-muted">Próximo pago:</span>
            <span className="text-heading font-semibold">{formatFecha(prox.fecha)}</span>
            <Chip tono={diasHasta(hoy, prox.fecha) <= 7 ? 'ambar' : 'azul'}>{textoDias(diasHasta(hoy, prox.fecha))}</Chip>
            <span className="text-heading font-semibold tabular-nums">
              {formatMoneyCentavos(prox.montoCentavos, prox.monedaPago)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Tarjetas de detalle */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          tono={k.atrasado.cantidad > 0 ? 'rojo' : 'verde'}
          titulo="Atrasado"
          valor={k.atrasado.cantidad > 0 ? formatMoneyCentavos(k.atrasado.montoCentavos, m) : 'Al día'}
          detalle={
            k.atrasado.cantidad > 0
              ? `${k.atrasado.cantidad} ${k.atrasado.cantidad === 1 ? 'cuota vencida' : 'cuotas vencidas'} sin pagar`
              : 'Ninguna cuota vencida'
          }
        />
        <Tarjeta
          tono={k.proximos30Centavos > 0 ? 'ambar' : 'neutro'}
          titulo="A pagar en los próximos 30 días"
          valor={formatMoneyCentavos(k.proximos30Centavos, m)}
          detalle="Plata que tiene que haber en caja"
        />
        <Tarjeta
          tono="azul"
          titulo="Intereses"
          valor={formatMoneyCentavos(k.interesesPagadosCentavos, m)}
          detalle={<>pagados · faltan <b>{formatMoneyCentavos(k.interesesAPagarCentavos, m)}</b></>}
        />
        <Tarjeta
          tono="violeta"
          titulo="Retención Ganancias"
          valor={formatMoneyCentavos(k.retencionesAnioCentavos, m)}
          detalle={<>retenido este año · a retener <b>{formatMoneyCentavos(k.retencionesARetenerCentavos, m)}</b></>}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Tarjeta
          tono="neutro"
          titulo="Capital vigente"
          valor={formatMoneyCentavos(k.capitalVigenteCentavos, m)}
          detalle={`${k.inversionesVigentes} ${k.inversionesVigentes === 1 ? 'inversión vigente' : 'inversiones vigentes'}`}
        />
        <Tarjeta
          tono="neutro"
          titulo="Capital a devolver (sin intereses)"
          valor={formatMoneyCentavos(Math.max(0, k.aPagarTotalCentavos - k.interesesAPagarCentavos), m)}
          detalle="Lo que falta pagar menos los intereses"
        />
      </div>
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────

type Vista = 'calendario' | 'movimientos' | 'documentos'
type FiltroCalendario = 'proximos' | 'atrasadas' | 'todo'

export function CuentaPanel({
  cuenta,
  general,
  onVerInversion,
  onAbrirDocumento,
}: {
  cuenta: CuentaCompleta
  general: boolean
  onVerInversion: (id: string) => void
  onAbrirDocumento?: (inversionId: string, docId: string) => void
}) {
  const hoy = cuenta.hoy
  const monedas = cuenta.kpisPorMoneda
  const [moneda, setMoneda] = useState<MonedaCuenta>(monedas[0]?.moneda ?? 'ARS')
  const kpis = monedas.find((k) => k.moneda === moneda) ?? monedas[0]

  const [vista, setVista] = useState<Vista>('calendario')
  const [filtro, setFiltro] = useState<FiltroCalendario>('proximos')
  const [movimientosVisibles, setMovimientosVisibles] = useState(20)

  const atrasadas = useMemo(
    () => cuenta.calendario.flatMap((mes) => mes.cuotas).filter((c) => c.estado === 'vencida'),
    [cuenta.calendario],
  )

  const meses = useMemo(() => {
    const mesActual = hoy.slice(0, 7)
    return cuenta.calendario
      .map((mes) => ({
        ...mes,
        cuotas: mes.cuotas.filter((c) =>
          filtro === 'todo' ? true : filtro === 'atrasadas' ? c.estado === 'vencida' : mes.mes >= mesActual,
        ),
      }))
      .filter((mes) => mes.cuotas.length > 0)
  }, [cuenta.calendario, filtro, hoy])

  const columnaPersona = general
  const sinDatos = monedas.length === 0

  return (
    <div className="space-y-6">
      {/* Alarmas arriba de todo */}
      {atrasadas.length > 0 ? (
        <Aviso tono="rojo" titulo={`Hay ${atrasadas.length} ${atrasadas.length === 1 ? 'cuota atrasada' : 'cuotas atrasadas'} sin pagar`}>
          <button
            type="button"
            onClick={() => {
              setVista('calendario')
              setFiltro('atrasadas')
            }}
            className="font-semibold text-red-700 underline hover:no-underline dark:text-red-300"
          >
            Ver cuáles son
          </button>
        </Aviso>
      ) : null}

      {sinDatos ? (
        <Aviso tono="neutro" titulo="Todavía no hay inversiones vigentes">
          Los números aparecen cuando se aprueba una inversión. Las que están "Para aprobar" todavía no cuentan.
        </Aviso>
      ) : (
        <>
          {monedas.length > 1 ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-body-muted text-sm">Ver en:</span>
              <Segmentos
                opciones={monedas.map((k) => ({ id: k.moneda, texto: NOMBRE_MONEDA[k.moneda] }))}
                valor={moneda}
                onCambio={setMoneda}
              />
              <span className="text-body-muted text-xs">Pesos y dólares se muestran por separado: no se suman.</span>
            </div>
          ) : null}
          {kpis ? <ResumenMoneda k={kpis} hoy={hoy} /> : null}
        </>
      )}

      {/* Avisos de gestión */}
      {cuenta.capitalSinIngresar.length > 0 || cuenta.vencimientosContrato.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {cuenta.capitalSinIngresar.length > 0 ? (
            <div className={`rounded-2xl border p-4 ${TONO_TARJETA.ambar}`}>
              <p className={`font-semibold ${TONO_TEXTO.ambar}`}>Capital aprobado que todavía no entró</p>
              <ul className="mt-2 divide-y divide-amber-200/70 dark:divide-amber-900/50">
                {cuenta.capitalSinIngresar.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <b>{c.numero}</b>
                      {columnaPersona ? <span className="text-body-muted"> · {c.inversorNombre}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">falta {formatMoneyCentavos(c.faltaCentavos, c.moneda)}</span>
                      <BotonVer onClick={() => onVerInversion(c.id)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {cuenta.vencimientosContrato.length > 0 ? (
            <div className={`rounded-2xl border p-4 ${TONO_TARJETA.azul}`}>
              <p className={`font-semibold ${TONO_TEXTO.azul}`}>Contratos que terminan en los próximos 60 días</p>
              <p className="text-body-muted text-xs">Hablar con el inversor: ¿renueva o se le devuelve el capital?</p>
              <ul className="mt-2 divide-y divide-sky-200/70 dark:divide-sky-900/50">
                {cuenta.vencimientosContrato.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <b>{v.numero}</b> · {formatFecha(v.fechaFinal)}{' '}
                      <Chip tono={diasHasta(hoy, v.fechaFinal) <= 15 ? 'ambar' : 'azul'}>
                        {textoDias(diasHasta(hoy, v.fechaFinal))}
                      </Chip>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatMoneyCentavos(v.capitalCentavos, v.moneda)}</span>
                      <BotonVer onClick={() => onVerInversion(v.id)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Detalle: calendario / movimientos / documentos */}
      <section className="rounded-2xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-4 dark:border-zinc-800">
          <Segmentos<Vista>
            opciones={[
              { id: 'calendario', texto: 'Calendario de pagos' },
              { id: 'movimientos', texto: 'Movimientos', cuenta: cuenta.movimientos.length },
              ...(!general ? [{ id: 'documentos' as const, texto: 'Documentos', cuenta: cuenta.documentos.length }] : []),
            ]}
            valor={vista}
            onCambio={setVista}
          />
          {vista === 'calendario' ? (
            <Segmentos<FiltroCalendario>
              opciones={[
                { id: 'proximos', texto: 'De este mes en adelante' },
                { id: 'atrasadas', texto: 'Atrasadas', cuenta: atrasadas.length },
                { id: 'todo', texto: 'Todo' },
              ]}
              valor={filtro}
              onCambio={setFiltro}
            />
          ) : null}
        </div>

        <div className="p-4">
          {vista === 'calendario' ? (
            meses.length === 0 ? (
              <p className="text-body-muted py-6 text-center text-sm">
                {filtro === 'atrasadas' ? 'No hay cuotas atrasadas.' : 'No hay pagos para mostrar.'}
              </p>
            ) : (
              <div className="space-y-5">
                {meses.map((mes) => {
                  const totales = new Map<MonedaCuenta, number>()
                  for (const c of mes.cuotas) {
                    if (c.estado !== 'pagada') totales.set(c.monedaPago, (totales.get(c.monedaPago) ?? 0) + c.montoNetoCentavos)
                  }
                  return (
                    <div key={mes.mes}>
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-heading text-base font-semibold capitalize">{mes.etiqueta}</h3>
                        {totales.size > 0 ? (
                          <p className="text-body-muted text-sm">
                            A pagar en el mes:{' '}
                            {[...totales].map(([mon, v], i) => (
                              <span key={mon} className="text-heading font-semibold tabular-nums">
                                {i > 0 ? ' + ' : ''}
                                {formatMoneyCentavos(v, mon)}
                              </span>
                            ))}
                          </p>
                        ) : (
                          <Chip tono="verde">Todo pagado</Chip>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {mes.cuotas.map((c) => {
                          const est = ESTADO_CUOTA[c.estado]
                          const dia = c.fecha.slice(8, 10)
                          return (
                            <li
                              key={`${c.inversionId}-${c.cuotaNumero}`}
                              className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                                c.estado === 'vencida'
                                  ? 'border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20'
                                  : 'border-neutral-200 dark:border-zinc-800'
                              }`}
                            >
                              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-neutral-100 dark:bg-zinc-800">
                                <span className="text-heading text-lg font-bold leading-none">{dia}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-heading truncate font-medium">
                                  {columnaPersona && c.inversorNombre ? c.inversorNombre : c.inversionNumero}
                                </p>
                                <p className="text-body-muted text-xs">
                                  {columnaPersona ? `${c.inversionNumero} · ` : ''}Cuota {c.cuotaNumero} ·{' '}
                                  {c.estado === 'pagada' ? formatFecha(c.fecha) : textoDias(diasHasta(hoy, c.fecha))}
                                </p>
                              </div>
                              <span className="text-heading text-lg font-bold tabular-nums">
                                {formatMoneyCentavos(c.montoNetoCentavos, c.monedaPago)}
                              </span>
                              <Chip tono={est.tono}>{est.texto}</Chip>
                              <BotonVer onClick={() => onVerInversion(c.inversionId)} />
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )
          ) : null}

          {vista === 'movimientos' ? (
            cuenta.movimientos.length === 0 ? (
              <p className="text-body-muted py-6 text-center text-sm">Todavía no hay movimientos.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-body-muted border-b border-neutral-200 text-left text-xs uppercase tracking-wide dark:border-zinc-800">
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Qué pasó</th>
                        <th className="px-3 py-2 font-medium">Inversión</th>
                        {columnaPersona ? <th className="px-3 py-2 font-medium">Persona</th> : null}
                        <th className="px-3 py-2 text-right font-medium">Monto</th>
                        <th className="px-3 py-2 text-right font-medium">Retención</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                      {cuenta.movimientos.slice(0, movimientosVisibles).map((mov, i) => {
                        const t = TIPO_MOVIMIENTO[mov.tipo]
                        return (
                          <tr key={`${mov.inversionId}-${mov.fecha}-${i}`}>
                            <td className="px-3 py-2.5 tabular-nums">{formatFecha(mov.fecha)}</td>
                            <td className="px-3 py-2.5">
                              <Chip tono={t.tono}>{t.texto}</Chip>
                              {mov.tipo !== 'ingreso_capital' ? <span className="text-body-muted ml-2 text-xs">{mov.detalle}</span> : null}
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => onVerInversion(mov.inversionId)}
                                className="font-medium text-brand-primary hover:underline"
                              >
                                {mov.inversionNumero}
                              </button>
                            </td>
                            {columnaPersona ? <td className="px-3 py-2.5">{mov.inversorNombre}</td> : null}
                            <td
                              className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                                mov.tipo === 'ingreso_capital' ? 'text-violet-700 dark:text-violet-300' : 'text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {formatMoneyCentavos(mov.montoCentavos, mov.moneda)}
                            </td>
                            <td className="text-body-muted px-3 py-2.5 text-right tabular-nums">
                              {mov.retencionCentavos > 0 ? formatMoneyCentavos(mov.retencionCentavos, mov.moneda) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {cuenta.movimientos.length > movimientosVisibles ? (
                  <button
                    type="button"
                    onClick={() => setMovimientosVisibles(cuenta.movimientos.length)}
                    className="mt-3 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Ver todos ({cuenta.movimientos.length})
                  </button>
                ) : null}
                <p className="text-body-muted mt-3 text-xs">
                  La fecha de una cuota pagada es la de su vencimiento: la Agenda no guarda el día exacto del pago.
                </p>
              </>
            )
          ) : null}

          {vista === 'documentos' ? (
            cuenta.documentos.length === 0 ? (
              <p className="text-body-muted py-6 text-center text-sm">No hay documentos cargados.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {cuenta.documentos.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 dark:border-zinc-800"
                  >
                    <div className="min-w-0">
                      <Chip tono={doc.tipo === 'mutuo' ? 'azul' : doc.tipo === 'pagare' ? 'violeta' : 'neutro'}>
                        {doc.tipo === 'mutuo' ? 'Mutuo' : doc.tipo === 'pagare' ? 'Pagaré' : 'Otro'}
                      </Chip>
                      <p className="text-heading mt-1 truncate text-sm font-medium">{doc.nombre}</p>
                      <p className="text-body-muted text-xs">
                        {doc.inversionNumero} · subido el {formatFecha(doc.subidoAt.slice(0, 10))}
                      </p>
                    </div>
                    {onAbrirDocumento ? (
                      <button
                        type="button"
                        onClick={() => onAbrirDocumento(doc.inversionId, doc.id)}
                        className="shrink-0 rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      >
                        Abrir PDF
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </section>
    </div>
  )
}

function BotonVer({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-semibold text-brand-primary hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      Ver
    </button>
  )
}
