import { AlertTriangle, Info, Lightbulb } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ETIQUETA_ESTADO_CLASES, estadoDescubierto, type TonoEstado } from '../estadoDescubierto'
import { formatMoneyCentavos } from '../formatMoney'
import type { CobroAtrasadoHoy, HoyResponse, IngresoHoy, PagoHoy } from '../../../services/finanzasHoyApi'
import { fechaLarga, sugerenciaDesdeDondePagar } from './hoyFrases'

/* ----------------------------------------------------------------------------
 * Piezas comunes: tarjeta, tabla, montos, etiquetas y botones. Todo en letra normal.
 * -------------------------------------------------------------------------- */

const th = 'px-3 py-2 text-left text-xs font-medium whitespace-nowrap first:pl-4 last:pr-4'
const td = 'px-3 py-2 align-middle first:pl-4 last:pr-4'
const filaHover = 'border-b border-neutral-100 transition-colors last:border-b-0 hover:bg-neutral-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50'
const filaTotal = 'border-t border-neutral-200 bg-neutral-50/60 font-semibold dark:border-zinc-700 dark:bg-zinc-800/40'

const botonPrimario =
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-brand-primary px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
const botonSecundario =
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'
const linkChico =
  'whitespace-nowrap text-xs text-neutral-600 underline-offset-2 transition hover:text-neutral-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100'

/** Monto completo con centavos, alineado a la derecha; en rojo si es negativo. */
export function Monto({
  centavos,
  className = '',
  negativoEnRojo = true,
}: {
  centavos: number
  className?: string
  negativoEnRojo?: boolean
}) {
  return (
    <span
      className={`whitespace-nowrap tabular-nums ${
        negativoEnRojo && centavos < 0 ? 'text-red-600 dark:text-red-400' : ''
      } ${className}`}
    >
      {formatMoneyCentavos(centavos, 'ARS')}
    </span>
  )
}

function Etiqueta({ tono, children }: { tono: TonoEstado; children: ReactNode }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA_ESTADO_CLASES[tono]}`}
    >
      {children}
    </span>
  )
}

function EtiquetaEstado({ saldoCentavos, descubiertoCentavos }: { saldoCentavos: number; descubiertoCentavos: number | null }) {
  const estado = estadoDescubierto(saldoCentavos, descubiertoCentavos)
  return <Etiqueta tono={estado.tono}>{estado.etiqueta}</Etiqueta>
}

/** Una sección de Hoy: tarjeta con título corto, una línea de explicación y el total a la derecha. */
export function Tarjeta({
  titulo,
  explicacion,
  total,
  children,
}: {
  titulo: string
  explicacion: string
  total?: { etiqueta: string; centavos: number }
  children: ReactNode
}) {
  return (
    <section className="surface-card overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-neutral-100 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-heading text-base font-semibold">{titulo}</h2>
          <p className="text-body-muted text-xs">{explicacion}</p>
        </div>
        {total ? (
          <p className="text-sm">
            <span className="text-body-muted text-xs">{total.etiqueta} </span>
            <Monto centavos={total.centavos} className="text-heading font-semibold" />
          </p>
        ) : null}
      </header>
      {children}
    </section>
  )
}

/** Estado vacío: una sola línea gris adentro de la tarjeta. */
export function Vacio({ texto }: { texto: string }) {
  return <p className="text-body-muted px-4 py-3 text-sm">{texto}</p>
}

function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

/** Mensaje de una línea con ícono, debajo de una tabla. */
function Mensaje({ tono, children }: { tono: 'ok' | 'aviso' | 'info'; children: ReactNode }) {
  const Icono = tono === 'aviso' ? AlertTriangle : tono === 'ok' ? Lightbulb : Info
  const color =
    tono === 'aviso'
      ? 'text-red-700 dark:text-red-300'
      : tono === 'ok'
        ? 'text-emerald-800 dark:text-emerald-200'
        : 'text-neutral-700 dark:text-gray-300'
  return (
    <p className={`flex items-start gap-2 border-t border-neutral-100 px-4 py-2.5 text-sm dark:border-zinc-800 ${color}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/* ----------------------------------------------------------------------------
 * Franja de datos de ejemplo y encabezado
 * -------------------------------------------------------------------------- */

/** Una línea discreta arriba cuando hay datos de ejemplo en el entorno de pruebas. */
export function FranjaDemo({ borrando, onBorrar }: { borrando: boolean; onBorrar: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <span>Estás viendo datos de ejemplo (DEMO).</span>
      <button
        type="button"
        className="rounded-md border border-amber-300 px-2 py-0.5 font-medium transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:hover:bg-amber-900/40"
        disabled={borrando}
        onClick={onBorrar}
      >
        {borrando ? 'Borrando…' : 'Borrar datos de ejemplo'}
      </button>
    </div>
  )
}

/** Título con la fecha y una línea de resumen: qué pagás, qué cobrás y cómo terminás el día. */
export function EncabezadoHoy({ data }: { data: HoyResponse }) {
  const cobros = data.ingresos.filas
  const totalCobros = cobros.reduce((total, fila) => total + fila.montoCentavos, 0)
  const llegaron = cobros.filter((fila) => fila.llego).length
  const separador = <span aria-hidden className="text-body-muted hidden sm:inline">·</span>
  return (
    <header>
      <h1 className="text-heading text-lg font-semibold">Hoy · {fechaLarga(data.fecha)}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <span className="basis-full sm:basis-auto">
          Pagás <Monto centavos={data.dia.pagosCentavos} className="text-heading font-semibold" />
        </span>
        {separador}
        <span className="basis-full sm:basis-auto">
          Cobrás <Monto centavos={totalCobros} className="text-heading font-semibold" />
          {llegaron > 0 ? (
            <span className="text-body-muted"> ({llegaron === 1 ? '1 ya llegó' : `${llegaron} ya llegaron`})</span>
          ) : null}
        </span>
        {separador}
        <span className="basis-full sm:basis-auto">
          Terminás el día en <Monto centavos={data.dia.saldoFinalCentavos} className="text-heading font-semibold" />
        </span>
      </p>
    </header>
  )
}

/* ----------------------------------------------------------------------------
 * 1. Pagos de hoy
 * -------------------------------------------------------------------------- */

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
  const filas = [...pagos.filas].sort((a, b) => Number(b.vencido) - Number(a.vencido))
  return (
    <Tarjeta
      titulo="Pagos de hoy"
      explicacion="Los vencidos van primero. Pagá, marcá como pagado o cambiá la fecha."
      total={pagos.filas.length > 0 ? { etiqueta: 'Total', centavos: pagos.totalCentavos } : undefined}
    >
      {filas.length === 0 ? (
        <Vacio texto="No hay pagos para hoy." />
      ) : (
        <Tabla>
          <thead>
            <tr className="text-body-muted border-b border-neutral-100 dark:border-zinc-800">
              <th className={th}>A quién</th>
              <th className={th}>Concepto</th>
              <th className={th}>Vence</th>
              <th className={th}>Cómo se paga</th>
              <th className={`${th} text-right`}>Monto</th>
              <th className={`${th} text-right`}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((pago) => (
              <tr key={pago.id} className={filaHover}>
                <td className={`${td} text-heading font-medium`}>{pago.aQuien}</td>
                <td className={`${td} text-body-muted`}>{pago.concepto}</td>
                <td className={td}>
                  {pago.vencido && pago.vencidoTexto ? <Etiqueta tono="rojo">{pago.vencidoTexto}</Etiqueta> : 'Hoy'}
                </td>
                <td className={td}>
                  {pago.comoPagar}
                  {pago.urgencia !== 'Normal' ? (
                    <span className="text-body-muted text-xs"> · urgencia {pago.urgencia.toLowerCase()}</span>
                  ) : null}
                </td>
                <td className={`${td} text-right`}>
                  <Monto centavos={pago.montoCentavos} className="text-heading font-medium" />
                </td>
                <td className={`${td} text-right`}>
                  <div className="flex flex-col items-end gap-1">
                    <button type="button" className={botonPrimario} onClick={() => onPagar(pago)}>
                      Pagar
                    </button>
                    <span className="flex items-center gap-1.5">
                      <button type="button" className={linkChico} onClick={() => onYaPague(pago)}>
                        Ya lo pagué
                      </button>
                      <span aria-hidden className="text-body-muted text-xs">·</span>
                      <button type="button" className={linkChico} onClick={() => onReprogramar(pago)}>
                        Cambiar fecha
                      </button>
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={filaTotal}>
              <td className={td} colSpan={4}>
                Total
              </td>
              <td className={`${td} text-right`}>
                <Monto centavos={pagos.totalCentavos} className="text-heading" />
              </td>
              <td className={td} />
            </tr>
          </tfoot>
        </Tabla>
      )}
    </Tarjeta>
  )
}

/* ----------------------------------------------------------------------------
 * 2. Cobros de hoy
 * -------------------------------------------------------------------------- */

export function TarjetaCobros({
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
  const total = ingresos.reduce((suma, fila) => suma + fila.montoCentavos, 0)
  const llegaron = ingresos.filter((fila) => fila.llego).length
  const explicacion =
    ingresos.length === 0
      ? 'Lo que se esperaba cobrar hoy.'
      : llegaron === 0
        ? 'Ninguno llegó todavía: podés reclamar o cambiar la fecha.'
        : `${llegaron} de ${ingresos.length} ya ${llegaron === 1 ? 'llegó' : 'llegaron'} al banco: confirmalo${llegaron === 1 ? '' : 's'}.`
  return (
    <Tarjeta
      titulo="Cobros de hoy"
      explicacion={explicacion}
      total={ingresos.length > 0 ? { etiqueta: 'Total', centavos: total } : undefined}
    >
      {ingresos.length === 0 ? (
        <Vacio texto="No hay cobros esperados para hoy." />
      ) : (
        <Tabla>
          <thead>
            <tr className="text-body-muted border-b border-neutral-100 dark:border-zinc-800">
              <th className={th}>De quién</th>
              <th className={th}>Esperado</th>
              <th className={`${th} text-right`}>Monto</th>
              <th className={th}>Estado</th>
              <th className={`${th} text-right`}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {ingresos.map((ingreso) => (
              <tr key={ingreso.id} className={filaHover}>
                <td className={td}>
                  <span className="text-heading block font-medium">{ingreso.cliente}</span>
                  <span className="text-body-muted block text-xs">{ingreso.concepto}</span>
                </td>
                <td className={td}>
                  {ingreso.atrasado && ingreso.atrasadoTexto ? (
                    <span className="whitespace-nowrap text-red-700 dark:text-red-300">{ingreso.atrasadoTexto}</span>
                  ) : (
                    'Hoy'
                  )}
                </td>
                <td className={`${td} text-right`}>
                  <Monto centavos={ingreso.montoCentavos} className="text-heading font-medium" />
                </td>
                <td className={td}>
                  {ingreso.llego ? (
                    <Etiqueta tono="verde">Llegó a {ingreso.bancoNombre ?? 'un banco'}</Etiqueta>
                  ) : (
                    <Etiqueta tono="ambar">Todavía no llegó</Etiqueta>
                  )}
                </td>
                <td className={`${td} text-right`}>
                  {ingreso.llego ? (
                    ingreso.movimientoId ? (
                      <button
                        type="button"
                        className={botonPrimario}
                        disabled={confirmandoId === ingreso.id}
                        onClick={() => onConfirmar(ingreso)}
                      >
                        {confirmandoId === ingreso.id ? 'Confirmando…' : 'Confirmar'}
                      </button>
                    ) : (
                      <span className="text-body-muted">—</span>
                    )
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <button type="button" className={botonSecundario} onClick={() => onReclamar(ingreso)}>
                        Reclamar
                      </button>
                      <span className="flex items-center gap-1.5">
                        <button type="button" className={linkChico} onClick={() => onEfectivo(ingreso)}>
                          Llegó en efectivo
                        </button>
                        <span aria-hidden className="text-body-muted text-xs">·</span>
                        <button type="button" className={linkChico} onClick={() => onReprogramar(ingreso)}>
                          Cambiar fecha
                        </button>
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  )
}

/* ----------------------------------------------------------------------------
 * 3. Cómo queda el día
 * -------------------------------------------------------------------------- */

export function TarjetaDia({
  dia,
  onAbrirBanco,
}: {
  dia: HoyResponse['dia']
  /** Tocar el nombre del banco abre el detalle de cuentas (para cargar el descubierto). */
  onAbrirBanco?: (bancoNombre: string) => void
}) {
  const sugerencia = sugerenciaDesdeDondePagar(dia)
  return (
    <Tarjeta
      titulo="Cómo queda el día"
      explicacion="Cómo quedaría cada banco si pagás todo lo de hoy desde ahí."
      total={{ etiqueta: 'Terminás en', centavos: dia.saldoFinalCentavos }}
    >
      {dia.bancos.length === 0 ? (
        <Vacio texto="Todavía no hay cuentas en pesos cargadas. Traelas desde Saldos." />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr className="text-body-muted border-b border-neutral-100 dark:border-zinc-800">
                <th className={th}>Banco</th>
                <th className={`${th} text-right`}>Saldo ahora</th>
                <th className={`${th} text-right`}>Pagos de hoy</th>
                <th className={`${th} text-right`}>Queda</th>
                <th className={`${th} text-right`}>Descubierto</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {dia.bancos.map((banco) => {
                const queda = banco.saldoAhoraCentavos - dia.pagosCentavos
                return (
                  <tr key={banco.bancoNombre} className={filaHover}>
                    <td className={`${td} text-heading font-medium`}>
                      {onAbrirBanco ? (
                        <button
                          type="button"
                          className="rounded underline-offset-2 hover:underline"
                          onClick={() => onAbrirBanco(banco.bancoNombre)}
                        >
                          {banco.bancoNombre}
                        </button>
                      ) : (
                        banco.bancoNombre
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      <Monto centavos={banco.saldoAhoraCentavos} />
                    </td>
                    <td className={`${td} text-right`}>
                      {dia.pagosCentavos > 0 ? (
                        <Monto centavos={-dia.pagosCentavos} negativoEnRojo={false} className="text-body-muted" />
                      ) : (
                        <span className="text-body-muted">—</span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      <Monto centavos={queda} className="text-heading font-medium" />
                    </td>
                    <td className={`${td} text-right`}>
                      {banco.descubiertoCentavos != null && banco.descubiertoCentavos > 0 ? (
                        <Monto centavos={banco.descubiertoCentavos} />
                      ) : (
                        <span className="text-body-muted" title="Sin descubierto cargado">
                          —
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <EtiquetaEstado saldoCentavos={queda} descubiertoCentavos={banco.descubiertoCentavos} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Tabla>
          {sugerencia ? <Mensaje tono={sugerencia.tono}>{sugerencia.texto}</Mensaje> : null}
        </>
      )}
    </Tarjeta>
  )
}

/* ----------------------------------------------------------------------------
 * 4. Cheques que se debitan mañana
 * -------------------------------------------------------------------------- */

export function TarjetaCheques({ cheques }: { cheques: HoyResponse['prevision']['chequesADebitar'] }) {
  return (
    <Tarjeta
      titulo="Cheques que se debitan mañana"
      explicacion="Cheques nuestros que se debitan mañana, y los de hoy que todavía no figuran debitados."
      total={cheques.filas.length > 0 ? { etiqueta: 'Total', centavos: cheques.totalCentavos } : undefined}
    >
      {cheques.filas.length === 0 ? (
        <Vacio texto="Mañana no se debita ningún cheque." />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr className="text-body-muted border-b border-neutral-100 dark:border-zinc-800">
                <th className={th}>N.º</th>
                <th className={th}>A quién</th>
                <th className={th}>Banco</th>
                <th className={`${th} text-right`}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {cheques.filas.map((fila) => (
                <tr key={fila.id} className={filaHover}>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {fila.numero}
                    {fila.cuando === 'Hoy' ? <span className="text-body-muted text-xs"> · hoy</span> : null}
                  </td>
                  <td className={`${td} text-heading font-medium`}>{fila.destinatario}</td>
                  <td className={td}>{fila.banco}</td>
                  <td className={`${td} text-right`}>
                    <Monto centavos={fila.montoCentavos} className="text-heading font-medium" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={filaTotal}>
                <td className={td} colSpan={3}>
                  Total
                </td>
                <td className={`${td} text-right`}>
                  <Monto centavos={cheques.totalCentavos} className="text-heading" />
                </td>
              </tr>
            </tfoot>
          </Tabla>
          {cheques.impactos.map((texto) => (
            <Mensaje key={texto} tono={texto.startsWith('Ojo') ? 'aviso' : 'info'}>
              {texto}
            </Mensaje>
          ))}
        </>
      )}
    </Tarjeta>
  )
}

/* ----------------------------------------------------------------------------
 * 5. Esta semana
 * -------------------------------------------------------------------------- */

export function TarjetaSemana({ prevision }: { prevision: HoyResponse['prevision'] }) {
  const semana = prevision.semana ?? []
  return (
    <Tarjeta titulo="Esta semana" explicacion="Lo que hay que pagar y cobrar cada día, y cómo va quedando.">
      {semana.length === 0 ? (
        <Vacio texto="Esta semana no hay nada anotado todavía." />
      ) : (
        <>
          {prevision.diaMasPesado ? (
            <p className="flex items-start gap-2 border-b border-neutral-100 px-4 py-2.5 text-sm text-amber-900 dark:border-zinc-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{prevision.diaMasPesado}</span>
            </p>
          ) : null}
          <Tabla>
            <thead>
              <tr className="text-body-muted border-b border-neutral-100 dark:border-zinc-800">
                <th className={th}>Día</th>
                <th className={`${th} text-right`}>A pagar</th>
                <th className={`${th} text-right`}>A cobrar</th>
                <th className={`${th} text-right`}>Queda</th>
              </tr>
            </thead>
            <tbody>
              {semana.map((fila) => (
                <tr
                  key={fila.fecha}
                  className={`${filaHover} ${
                    fila.esElMasPesado ? 'bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/30 dark:hover:bg-amber-950/50' : ''
                  }`}
                >
                  <td className={`${td} text-heading whitespace-nowrap font-medium`}>{fila.dia}</td>
                  <td className={`${td} text-right`}>
                    {fila.aPagarCentavos > 0 ? <Monto centavos={fila.aPagarCentavos} /> : <span className="text-body-muted">—</span>}
                  </td>
                  <td className={`${td} text-right`}>
                    {fila.aCobrarCentavos > 0 ? <Monto centavos={fila.aCobrarCentavos} /> : <span className="text-body-muted">—</span>}
                  </td>
                  <td className={`${td} text-right`}>
                    <Monto centavos={fila.quedaCentavos} className="text-heading font-medium" />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </>
      )}
    </Tarjeta>
  )
}

/* ----------------------------------------------------------------------------
 * 6. Cobros atrasados y transferencias esperando firma
 * -------------------------------------------------------------------------- */

export function TarjetaAtrasados({
  cobros,
  onReclamar,
}: {
  cobros: CobroAtrasadoHoy[]
  onReclamar: (cobro: CobroAtrasadoHoy) => void
}) {
  const total = cobros.reduce((suma, cobro) => suma + cobro.montoCentavos, 0)
  return (
    <Tarjeta
      titulo="Cobros atrasados"
      explicacion="Cobros que se esperaban antes de hoy y todavía no entraron."
      total={cobros.length > 0 ? { etiqueta: 'Total', centavos: total } : undefined}
    >
      {cobros.length === 0 ? (
        <Vacio texto="No hay cobros atrasados." />
      ) : (
        <Tabla>
          <thead>
            <tr className="text-body-muted border-b border-neutral-100 dark:border-zinc-800">
              <th className={th}>De quién</th>
              <th className={th}>Esperado</th>
              <th className={`${th} text-right`}>Monto</th>
              <th className={`${th} text-right`}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {cobros.map((cobro) => (
              <tr key={cobro.id} className={filaHover}>
                <td className={td}>
                  <span className="text-heading block font-medium">{cobro.cliente}</span>
                  <span className="text-body-muted block text-xs">{cobro.concepto}</span>
                </td>
                <td className={`${td} whitespace-nowrap text-red-700 dark:text-red-300`}>{cobro.haceTexto}</td>
                <td className={`${td} text-right`}>
                  <Monto centavos={cobro.montoCentavos} className="text-heading font-medium" />
                </td>
                <td className={`${td} text-right`}>
                  <button type="button" className={botonSecundario} onClick={() => onReclamar(cobro)}>
                    Reclamar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  )
}

export function TarjetaFirmas({ firmas }: { firmas: HoyResponse['prevision']['firmas'] }) {
  return (
    <Tarjeta
      titulo="Transferencias esperando firma"
      explicacion="Transferencias armadas que todavía no salieron porque falta la firma."
      total={firmas ? { etiqueta: 'Total', centavos: firmas.montoCentavos } : undefined}
    >
      {!firmas ? (
        <Vacio texto="No hay transferencias esperando firma." />
      ) : (
        <Tabla>
          <thead>
            <tr className="text-body-muted border-b border-neutral-100 dark:border-zinc-800">
              <th className={th}>Pendientes</th>
              <th className={`${th} text-right`}>Monto</th>
              <th className={`${th} text-right`}>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr className={filaHover}>
              <td className={`${td} text-heading font-medium`}>
                {firmas.cantidad} {firmas.cantidad === 1 ? 'transferencia' : 'transferencias'}
              </td>
              <td className={`${td} text-right`}>
                <Monto centavos={firmas.montoCentavos} className="text-heading font-medium" />
              </td>
              <td className={`${td} text-right`}>
                <Link to="/finanzas/transferencias" className={botonSecundario}>
                  Ver
                </Link>
              </td>
            </tr>
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  )
}
