import type { ReactNode } from 'react'
import { EstadoDescubiertoBanco } from '../EstadoDescubiertoBanco'
import { formatMoneyCentavos } from '../formatMoney'
import { montoSimple, montoSimpleAbs } from '../montoSimple'
import type { HoyResponse, IngresoHoy, PagoHoy } from '../../../services/finanzasHoyApi'
import { hayBancoPasado, plural, sugerenciaDesdeDondePagar } from './hoyFrases'
import { TEXTO_CHEQUE_PROXIMAMENTE } from './pagoConCheque'

type BordeSeccion = 'rojo' | 'verde' | 'azul' | 'violeta' | 'gris'

const BORDE_SECCION: Record<BordeSeccion, string> = {
  rojo: 'border-l-red-500',
  verde: 'border-l-emerald-500',
  azul: 'border-l-sky-500',
  violeta: 'border-l-violet-500',
  gris: 'border-l-neutral-400 dark:border-l-zinc-500',
}

/** Sección de la pantalla: título grande en frase, borde izquierdo con color propio y una línea que explica. */
export function Seccion({
  titulo,
  explicacion,
  borde,
  children,
}: {
  titulo: string
  explicacion: string
  borde: BordeSeccion
  children: ReactNode
}) {
  return (
    <section
      className={`rounded-2xl border border-l-8 border-neutral-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8 ${BORDE_SECCION[borde]}`}
    >
      <h2 className="text-heading text-2xl font-bold leading-tight sm:text-3xl">{titulo}</h2>
      <p className="text-body-muted mt-2 text-base sm:text-lg">{explicacion}</p>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export function EstadoVacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-xl bg-neutral-50 px-4 py-5 text-xl font-medium dark:bg-zinc-800/60">{texto}</p>
  )
}

function Monto({ centavos, grande = false }: { centavos: number; grande?: boolean }) {
  const negativo = centavos < 0
  return (
    <span
      className={`font-semibold tabular-nums ${grande ? 'text-2xl sm:text-3xl' : 'text-lg'} ${
        negativo ? 'text-red-700 dark:text-red-300' : 'text-heading'
      }`}
    >
      {formatMoneyCentavos(centavos, 'ARS')}
    </span>
  )
}

const botonPrincipal =
  'inline-flex min-h-14 items-center justify-center rounded-xl bg-brand-primary px-6 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
const botonChico =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-3 text-sm font-medium dark:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50'

/** Franja de arriba cuando hay datos de ejemplo en el entorno de pruebas. */
export function FranjaDemo({ borrando, onBorrar }: { borrando: boolean; onBorrar: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-lg font-semibold">Estás viendo datos de ejemplo (DEMO).</p>
      <button
        type="button"
        className="min-h-12 rounded-xl border border-amber-700 px-4 text-base font-semibold text-amber-950 disabled:opacity-50 dark:border-amber-300 dark:text-amber-100"
        disabled={borrando}
        onClick={onBorrar}
      >
        {borrando ? 'Borrando…' : 'Borrar datos de ejemplo'}
      </button>
    </div>
  )
}

/** Los 3 cuadros grandes de arriba: qué pagás, qué cobrás y cómo terminás el día. */
export function ResumenHoy({ data }: { data: HoyResponse }) {
  const chequesHoy = data.prevision.chequesADebitar.filas.filter((fila) => fila.cuando === 'Hoy').length
  const cantidadPagos = data.pagos.filas.length
  const cobros = data.ingresos.filas
  const totalCobros = cobros.reduce((total, fila) => total + fila.montoCentavos, 0)
  const llegaron = cobros.filter((fila) => fila.llego).length
  const terminaMal = hayBancoPasado(data.dia.bancos)

  const detallePagos =
    chequesHoy > 0
      ? `${plural(cantidadPagos, 'pago', 'pagos')} y ${plural(chequesHoy, 'cheque', 'cheques')}`
      : plural(cantidadPagos, 'pago', 'pagos')
  const detalleCobros =
    cobros.length === 0
      ? 'ningún cobro esperado'
      : `${plural(cobros.length, 'cobro', 'cobros')}, ${llegaron === 0 ? 'ninguno llegó todavía' : llegaron === cobros.length ? (cobros.length === 1 ? 'ya llegó' : 'ya llegaron todos') : `${llegaron} ya ${llegaron === 1 ? 'llegó' : 'llegaron'}`}`

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Cuadro tono="rojo" titulo="Hoy pagás" monto={data.dia.pagosCentavos} detalle={detallePagos} />
      <Cuadro tono="verde" titulo="Hoy cobrás" monto={totalCobros} detalle={detalleCobros} />
      <Cuadro
        tono={terminaMal ? 'rojo' : 'azul'}
        titulo="Terminás el día en"
        monto={data.dia.saldoFinalCentavos}
        conSigno
        detalle={terminaMal ? 'Hay un banco pasado del descubierto.' : 'Si pagás lo de hoy y entra lo esperado.'}
      />
    </div>
  )
}

const CUADRO: Record<'rojo' | 'verde' | 'azul', { caja: string; monto: string }> = {
  rojo: {
    caja: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
    monto: 'text-red-800 dark:text-red-200',
  },
  verde: {
    caja: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40',
    monto: 'text-emerald-800 dark:text-emerald-200',
  },
  azul: {
    caja: 'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40',
    monto: 'text-sky-900 dark:text-sky-100',
  },
}

function Cuadro({
  tono,
  titulo,
  monto,
  detalle,
  conSigno = false,
}: {
  tono: 'rojo' | 'verde' | 'azul'
  titulo: string
  monto: number
  detalle: string
  conSigno?: boolean
}) {
  return (
    <div className={`rounded-2xl border p-5 ${CUADRO[tono].caja}`}>
      <p className="text-heading text-lg font-medium">{titulo}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl ${CUADRO[tono].monto}`}>
        {conSigno ? montoSimple(monto) : montoSimpleAbs(monto)}
      </p>
      <p className="text-body-muted mt-2 text-base">{detalle}</p>
    </div>
  )
}

export function TarjetaPagos({
  pagos,
  onPagar,
  onYaPague,
  onReprogramar,
}: {
  pagos: HoyResponse['pagos']
  onPagar: (pago: PagoHoy) => void
  onYaPague: (pago: PagoHoy) => void
  onReprogramar: (pago: PagoHoy) => void
}) {
  return (
    <Seccion
      titulo="Hoy tenés que pagar esto"
      explicacion="Los vencidos van primero. Cada pago tiene su botón para pagarlo, marcarlo como pagado o pasarlo para otro día."
      borde="rojo"
    >
      {pagos.filas.length === 0 ? (
        <EstadoVacio texto="No tenés pagos para hoy. 👍" />
      ) : (
        <>
          <ul className="grid gap-3">
            {pagos.filas.map((pago) => (
              <li
                key={pago.id}
                className={`overflow-hidden rounded-2xl border ${
                  pago.vencido
                    ? 'border-red-300 dark:border-red-900'
                    : 'border-neutral-200 dark:border-zinc-700'
                }`}
              >
                {pago.vencidoTexto ? (
                  <p className="bg-red-600 px-4 py-1.5 text-base font-semibold text-white">{pago.vencidoTexto}</p>
                ) : null}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                      <p className="text-heading text-2xl font-bold leading-tight">{pago.aQuien}</p>
                      <p className="text-body-muted mt-1 text-base">{pago.concepto}</p>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <Monto centavos={pago.montoCentavos} grande />
                    </div>
                  </div>
                  <p className="mt-3 text-base">
                    Estaba previsto pagarlo <span className="font-semibold">{pago.comoPagar.toLowerCase()}</span>
                    {pago.urgencia !== 'Normal' ? (
                      <span className="text-body-muted"> · urgencia {pago.urgencia.toLowerCase()}</span>
                    ) : null}
                    .
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <button type="button" className={`${botonPrincipal} sm:min-w-44`} onClick={() => onPagar(pago)}>
                      Pagar
                    </button>
                    <button type="button" className={botonChico} onClick={() => onYaPague(pago)}>
                      Ya lo pagué
                    </button>
                    <button type="button" className={botonChico} onClick={() => onReprogramar(pago)}>
                      Pasarlo para otro día
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-4 text-xl dark:border-zinc-800">
            <span className="font-medium">Total de hoy</span>
            <Monto centavos={pagos.totalCentavos} grande />
          </p>
        </>
      )}
    </Seccion>
  )
}

export function TarjetaIngresos({
  ingresos,
  confirmandoId,
  onConfirmar,
  onEfectivo,
  onReprogramar,
  onReclamar,
}: {
  ingresos: IngresoHoy[]
  confirmandoId: string | null
  onConfirmar: (ingreso: IngresoHoy) => void
  onEfectivo: (ingreso: IngresoHoy) => void
  onReprogramar: (ingreso: IngresoHoy) => void
  onReclamar: (ingreso: IngresoHoy) => void
}) {
  return (
    <Seccion
      titulo="Hoy se esperan estos ingresos"
      explicacion="Los que ya entraron al banco aparecen en verde: confirmalos. Los que no, podés reclamarlos o cambiarles la fecha."
      borde="verde"
    >
      {ingresos.length === 0 ? (
        <EstadoVacio texto="No hay cobros esperados para hoy." />
      ) : (
        <ul className="grid gap-3">
          {ingresos.map((ingreso) => (
            <li
              key={ingreso.id}
              className={`rounded-2xl border p-4 sm:p-5 ${
                ingreso.llego
                  ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
                  : 'border-neutral-200 dark:border-zinc-700'
              }`}
            >
              {ingreso.atrasadoTexto ? (
                <p className="mb-2 text-base font-semibold text-red-700 dark:text-red-300">
                  {ingreso.atrasadoTexto}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="text-heading text-2xl font-bold leading-tight">{ingreso.cliente}</p>
                  <p className="text-body-muted mt-1 text-base">{ingreso.concepto}</p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <Monto centavos={ingreso.montoCentavos} grande />
                </div>
              </div>
              {ingreso.llego ? (
                <p className="mt-3 text-xl font-semibold text-emerald-800 dark:text-emerald-200">
                  Llegó ✓ a {ingreso.bancoNombre ?? 'un banco'}
                </p>
              ) : (
                <p className="mt-3 text-lg font-medium text-amber-900 dark:text-amber-200">Todavía no llegó</p>
              )}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {ingreso.llego && ingreso.movimientoId ? (
                  <button
                    type="button"
                    className={`${botonPrincipal} sm:min-w-44`}
                    disabled={confirmandoId === ingreso.id}
                    onClick={() => onConfirmar(ingreso)}
                  >
                    {confirmandoId === ingreso.id ? 'Confirmando…' : 'Confirmar'}
                  </button>
                ) : null}
                {!ingreso.llego ? (
                  <>
                    <button type="button" className={`${botonPrincipal} sm:min-w-44`} onClick={() => onEfectivo(ingreso)}>
                      Llegó en efectivo
                    </button>
                    <button type="button" className={botonChico} onClick={() => onReclamar(ingreso)}>
                      Reclamar
                    </button>
                    <button type="button" className={botonChico} onClick={() => onReprogramar(ingreso)}>
                      Cambiar la fecha
                    </button>
                    <button type="button" className={`${botonChico} text-left`} disabled>
                      Llegó con cheque. {TEXTO_CHEQUE_PROXIMAMENTE}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  )
}

export interface AccionesBancoHoy {
  onAbrir?: () => void
  onTransferir?: () => void
  onCargarDescubierto?: () => void
}

export function TarjetaDia({
  dia,
  accionesDe,
}: {
  dia: HoyResponse['dia']
  /** Qué se puede hacer con cada banco desde acá (abrir detalle, transferir, cargar descubierto). */
  accionesDe?: (bancoNombre: string) => AccionesBancoHoy
}) {
  const sugerencia = sugerenciaDesdeDondePagar(dia)
  const esAviso = sugerencia?.startsWith('Ojo') ?? false
  return (
    <Seccion
      titulo="Así va a quedar el día"
      explicacion="Cómo está cada banco ahora y cómo quedaría si pagás todo lo de hoy desde ahí."
      borde="azul"
    >
      <p className="text-heading text-xl font-semibold leading-snug sm:text-2xl">{dia.frase}</p>
      {sugerencia ? (
        <p
          className={`mt-4 rounded-2xl border-2 px-4 py-4 text-lg font-semibold leading-snug ${
            esAviso
              ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
              : 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100'
          }`}
        >
          {sugerencia}
        </p>
      ) : null}
      {dia.bancos.length === 0 ? (
        <div className="mt-5">
          <EstadoVacio texto="Todavía no hay cuentas en pesos cargadas. Traelas desde Saldos." />
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {dia.bancos.map((banco) => {
            const acciones = accionesDe?.(banco.bancoNombre) ?? {}
            return (
              <EstadoDescubiertoBanco
                key={banco.bancoNombre}
                banco={banco.bancoNombre}
                saldoCentavos={banco.saldoAhoraCentavos}
                descubiertoCentavos={banco.descubiertoCentavos}
                saldoDespuesCentavos={dia.pagosCentavos > 0 ? banco.saldoAhoraCentavos - dia.pagosCentavos : null}
                onAbrir={acciones.onAbrir}
                onTransferir={acciones.onTransferir}
                onCargarDescubierto={acciones.onCargarDescubierto}
              />
            )
          })}
        </div>
      )}
    </Seccion>
  )
}

export function TarjetaCheques({ cheques }: { cheques: HoyResponse['prevision']['chequesADebitar'] }) {
  return (
    <Seccion
      titulo="Mañana se debitan estos cheques"
      explicacion="Los cheques nuestros que se debitan mañana, y los de hoy que todavía no figuran debitados."
      borde="violeta"
    >
      {cheques.filas.length === 0 ? (
        <EstadoVacio texto="Mañana no se debita ningún cheque. 👍" />
      ) : (
        <>
          <ul className="grid gap-3">
            {cheques.filas.map((fila) => (
              <li
                key={fila.id}
                className="flex flex-col gap-2 rounded-2xl border border-neutral-200 p-4 dark:border-zinc-700 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="text-heading text-xl font-bold leading-tight">{fila.destinatario}</p>
                  <p className="text-body-muted mt-1 text-base">
                    Cheque N.º {fila.numero} · {fila.banco} · se debita {fila.cuando.toLowerCase()}
                  </p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <Monto centavos={fila.montoCentavos} grande />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-4 text-xl dark:border-zinc-800">
            <span className="font-medium">Total en cheques</span>
            <Monto centavos={cheques.totalCentavos} grande />
          </p>
          {cheques.impactos.length > 0 ? (
            <div className="mt-4 grid gap-2">
              {cheques.impactos.map((texto) => (
                <p
                  key={texto}
                  className={`rounded-2xl border px-4 py-3 text-lg font-medium leading-snug ${
                    texto.startsWith('Ojo')
                      ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
                      : 'border-neutral-200 bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-800/60'
                  }`}
                >
                  {texto}
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}
    </Seccion>
  )
}

export function TarjetaPrevision({
  prevision,
  onReclamar,
}: {
  prevision: HoyResponse['prevision']
  onReclamar: (cobro: HoyResponse['prevision']['cobrosAtrasados'][number]) => void
}) {
  const haySemana = prevision.semana != null && prevision.semana.length > 0
  const hayAtrasados = prevision.cobrosAtrasados.length > 0
  const hayFirmas = prevision.firmas != null
  return (
    <Seccion
      titulo="Para organizarte"
      explicacion="Lo que viene en la semana, los cobros que se atrasaron y las transferencias que esperan firma."
      borde="gris"
    >
      <div className="grid gap-8">
        <div>
          <h3 className="text-heading text-xl font-semibold">Esta semana</h3>
          {!haySemana || !prevision.semana ? (
            <div className="mt-3">
              <EstadoVacio texto="Esta semana no hay nada anotado todavía." />
            </div>
          ) : (
            <>
              {prevision.diaMasPesado ? (
                <p className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-lg font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  {prevision.diaMasPesado}
                </p>
              ) : null}
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-base">
                  <thead>
                    <tr className="text-body-muted border-b-2 border-neutral-300 dark:border-zinc-700">
                      <th className="py-2 pr-3 font-semibold">Día</th>
                      <th className="py-2 pr-3 font-semibold">A pagar</th>
                      <th className="py-2 pr-3 font-semibold">A cobrar</th>
                      <th className="py-2 font-semibold">Cómo queda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prevision.semana.map((fila) => (
                      <tr
                        key={fila.fecha}
                        className={`border-b border-neutral-200 dark:border-zinc-800 ${
                          fila.esElMasPesado ? 'bg-amber-50 font-semibold dark:bg-amber-950/30' : ''
                        }`}
                      >
                        <td className="py-3 pr-3 font-medium">
                          {fila.dia}
                          {fila.esElMasPesado ? (
                            <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950 dark:bg-amber-800 dark:text-amber-50">
                              el más pesado
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3">
                          {fila.aPagarCentavos > 0 ? <Monto centavos={fila.aPagarCentavos} /> : <span className="text-body-muted">—</span>}
                        </td>
                        <td className="py-3 pr-3">
                          {fila.aCobrarCentavos > 0 ? <Monto centavos={fila.aCobrarCentavos} /> : <span className="text-body-muted">—</span>}
                        </td>
                        <td className="py-3">
                          <Monto centavos={fila.quedaCentavos} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div>
          <h3 className="text-heading text-xl font-semibold">Cobros atrasados</h3>
          {!hayAtrasados ? (
            <div className="mt-3">
              <EstadoVacio texto="No hay cobros atrasados. 👍" />
            </div>
          ) : (
            <ul className="mt-3 grid gap-3">
              {prevision.cobrosAtrasados.map((cobro) => (
                <li
                  key={cobro.id}
                  className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-zinc-700 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-heading text-xl font-bold leading-tight">{cobro.cliente}</p>
                    <p className="text-body-muted mt-1 text-base">{cobro.concepto}</p>
                    <p className="mt-1 text-base font-semibold text-red-700 dark:text-red-300">
                      Se esperaba {cobro.haceTexto.toLowerCase()}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <Monto centavos={cobro.montoCentavos} grande />
                    <button type="button" className={botonChico} onClick={() => onReclamar(cobro)}>
                      Reclamar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-heading text-xl font-semibold">Transferencias esperando firma</h3>
          {hayFirmas && prevision.firmas ? (
            <p className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-lg font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              {prevision.firmas.texto}
            </p>
          ) : (
            <div className="mt-3">
              <EstadoVacio texto="No hay transferencias esperando firma." />
            </div>
          )}
        </div>
      </div>
    </Seccion>
  )
}
