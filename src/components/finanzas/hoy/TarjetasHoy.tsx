import { ArrowDownCircle, ArrowUpCircle, Info, MoreHorizontal, Scale, Wallet } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ETIQUETA_ESTADO_CLASES, estadoDescubierto, type TonoEstado } from '../estadoDescubierto'
import { formatMoneyCentavos } from '../formatMoney'
import type { HoyResponse } from '../../../services/finanzasHoyApi'
import { diaCorto, fechaLarga, nombreDia, sugerenciaDesdeDondePagar } from './hoyFrases'
import { montoCorto } from './montoCorto'

/* ----------------------------------------------------------------------------
 * Piezas comunes: tarjeta compacta, ayuda, montos, etiquetas, botones y menú ⋯.
 * -------------------------------------------------------------------------- */

export const botonChico =
  'inline-flex shrink-0 items-center justify-center rounded-md bg-brand-primary px-2.5 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
export const botonChicoSecundario =
  'inline-flex shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'
export const linkChico =
  'text-[13px] text-neutral-600 underline-offset-2 transition hover:text-neutral-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100'

/** Monto completo con centavos; en rojo si es negativo. */
export function Monto({
  centavos,
  className = '',
  negativoEnRojo = true,
  moneda = 'ARS',
}: {
  centavos: number
  className?: string
  negativoEnRojo?: boolean
  moneda?: 'ARS' | 'USD'
}) {
  return (
    <span className={`tabular-nums ${negativoEnRojo && centavos < 0 ? 'text-red-600 dark:text-red-400' : ''} ${className}`}>
      {formatMoneyCentavos(centavos, moneda)}
    </span>
  )
}

export function Etiqueta({ tono, children }: { tono: TonoEstado; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium ${ETIQUETA_ESTADO_CLASES[tono]}`}>
      {children}
    </span>
  )
}

export function EtiquetaEstado({
  saldoCentavos,
  descubiertoCentavos,
}: {
  saldoCentavos: number
  descubiertoCentavos: number | null
}) {
  const estado = estadoDescubierto(saldoCentavos, descubiertoCentavos)
  return <Etiqueta tono={estado.tono}>{estado.etiqueta}</Etiqueta>
}

/** Línea de ayuda gris con ícono, al pie de una tarjeta. */
export function Ayuda({ children, tamano = 'text-[13px]' }: { children: ReactNode; tamano?: string }) {
  return (
    <p className={`text-body-muted mx-4 mb-3 mt-2 flex items-start gap-1.5 border-t border-neutral-100 pt-2 dark:border-zinc-800 ${tamano}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/** Tarjeta compacta: título chico, algo a la derecha (total, botones), contenido y ayuda al pie. */
export function Tarjeta({
  titulo,
  subtitulo,
  derecha,
  ayuda,
  claseTitulo = 'text-brand-primary text-[15px] font-medium',
  claseSubtitulo = 'text-brand-primary text-[13px]',
  claseAyuda,
  tour,
  children,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  derecha?: ReactNode
  ayuda?: ReactNode
  claseTitulo?: string
  claseSubtitulo?: string
  claseAyuda?: string
  tour?: string
  children: ReactNode
}) {
  return (
    <section
      data-tour={tour}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--color-primary-muted)] bg-brand-primary-light px-4 py-2.5">
        <div className="min-w-0">
          <h2 className={claseTitulo}>{titulo}</h2>
          {subtitulo ? <p className={claseSubtitulo}>{subtitulo}</p> : null}
        </div>
        {derecha ? <div className="flex min-w-0 flex-wrap items-center gap-2">{derecha}</div> : null}
      </header>
      <div className="min-h-0 min-w-0 flex-1 p-4">{children}</div>
      {ayuda ? <Ayuda tamano={claseAyuda}>{ayuda}</Ayuda> : null}
    </section>
  )
}

/** Una sola línea gris para cuando no hay nada. */
export function Vacio({ texto }: { texto: string }) {
  return <p className="text-body-muted py-1.5 text-[13px]">{texto}</p>
}

/** Menú ⋯ chico con las acciones secundarias de una fila. */
export function MenuAcciones({
  opciones,
  etiqueta = 'Más acciones',
  tour,
}: {
  opciones: Array<{ texto: string; onClick: () => void; tour?: string }>
  etiqueta?: string
  tour?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (event: PointerEvent) => {
      if (!caja.current?.contains(event.target as Node)) setAbierto(false)
    }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [abierto])

  if (opciones.length === 0) return null
  return (
    <div ref={caja} className="relative shrink-0">
      <button
        type="button"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        data-tour={tour}
        onClick={() => setAbierto((actual) => !actual)}
        className="rounded-md p-1 text-neutral-600 transition hover:bg-neutral-100 dark:text-gray-300 dark:hover:bg-zinc-800"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {abierto ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-neutral-200 bg-white p-1 shadow-md dark:border-zinc-700 dark:bg-zinc-900"
        >
          {opciones.map((opcion) => (
            <button
              key={opcion.texto}
              type="button"
              role="menuitem"
              data-tour={opcion.tour}
              className="block w-full rounded px-2 py-2 text-left text-[13px] text-neutral-800 hover:bg-neutral-100 dark:text-gray-100 dark:hover:bg-zinc-800"
              onClick={() => {
                setAbierto(false)
                opcion.onClick()
              }}
            >
              {opcion.texto}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Franja de datos de ejemplo, título y los cuatro números del día
 * -------------------------------------------------------------------------- */

/** Una línea discreta arriba cuando hay datos de ejemplo en el entorno de pruebas. */
export function FranjaDemo({ borrando, onBorrar }: { borrando: boolean; onBorrar: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
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

export function EncabezadoHoy({ fecha }: { fecha: string }) {
  return (
    <header className="flex min-h-10 flex-wrap items-center justify-between gap-3">
      <h1 className="text-heading text-2xl font-bold tracking-tight">Hoy · {fechaLarga(fecha)}</h1>
    </header>
  )
}

function Numero({
  titulo,
  centavos,
  tono = 'normal',
  icono,
  borde,
}: {
  titulo: string
  centavos: number
  tono?: 'normal' | 'verde' | 'rojo'
  icono: ReactNode
  borde: string
}) {
  const color =
    centavos < 0 || tono === 'rojo'
      ? 'text-red-600 dark:text-red-400'
      : tono === 'verde'
        ? 'text-emerald-700 dark:text-emerald-300'
        : 'text-heading'
  return (
    <div className={`surface-card min-w-0 rounded-2xl border p-3 ${borde}`}>
      <div className="text-body-muted flex items-center gap-1.5 text-xs font-medium">
        {icono}
        <span>{titulo}</span>
      </div>
      <p className={`mt-1 break-words text-lg font-bold tabular-nums ${color}`}>
        {formatMoneyCentavos(centavos, 'ARS')}
      </p>
    </div>
  )
}

/** Arrancaste · Hoy pagás · Hoy cobrás · Terminás: cuatro cuadritos con los montos completos. */
export function CuatroNumeros({ data }: { data: HoyResponse }) {
  const cobros = data.ingresos.filas
  const totalCobros = cobros.reduce((total, fila) => total + fila.montoCentavos, 0)
  const llegaron = cobros.filter((fila) => fila.llego).length
  const detalleCobros = cobros.length === 0 ? '' : ` (${cobros.length}${llegaron > 0 ? ` · ${llegaron} ${llegaron === 1 ? 'llegó' : 'llegaron'}` : ''})`
  return (
    <div data-tour="hoy-numeros" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Numero
        titulo="Arrancaste el día con"
        centavos={data.dia.saldoInicialCentavos}
        icono={<Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />}
        borde="border-blue-200 dark:border-blue-900/70"
      />
      <Numero
        titulo={`Hoy pagás${data.pagos.filas.length > 0 ? ` (${data.pagos.filas.length})` : ''}`}
        centavos={data.dia.pagosCentavos}
        tono="rojo"
        icono={<ArrowUpCircle className="h-4 w-4 text-red-500" aria-hidden />}
        borde="border-red-200 dark:border-red-900/70"
      />
      <Numero
        titulo={`Hoy cobrás${detalleCobros}`}
        centavos={totalCobros}
        tono="verde"
        icono={<ArrowDownCircle className="h-4 w-4 text-emerald-500" aria-hidden />}
        borde="border-emerald-200 dark:border-emerald-900/70"
      />
      <Numero
        titulo="Terminás el día en"
        centavos={data.dia.saldoFinalCentavos}
        icono={
          <Scale
            className={`h-4 w-4 ${data.dia.saldoFinalCentavos >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
            aria-hidden
          />
        }
        borde={
          data.dia.saldoFinalCentavos >= 0
            ? 'border-emerald-200 dark:border-emerald-900/70'
            : 'border-red-200 dark:border-red-900/70'
        }
      />
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Dos tarjetas chicas al pie: cómo queda cada banco y la semana
 * -------------------------------------------------------------------------- */

export function TarjetaBancos({
  dia,
  onAbrirBanco,
}: {
  dia: HoyResponse['dia']
  /** Tocar el nombre del banco abre el detalle de cuentas (para cargar el descubierto). */
  onAbrirBanco?: (bancoNombre: string) => void
}) {
  const sugerencia = sugerenciaDesdeDondePagar(dia)
  return (
    <Tarjeta titulo="Cómo queda cada banco" ayuda="Saldo de cada banco si pagás todo lo de hoy desde ahí.">
      {dia.bancos.length === 0 ? (
        <Vacio texto="Todavía no hay cuentas en pesos. Traelas desde Saldos." />
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-zinc-800">
          {dia.bancos.map((banco) => {
            const queda = banco.saldoAhoraCentavos - dia.pagosCentavos
            return (
              <li key={banco.bancoNombre} className="flex items-center justify-between gap-2 py-2 text-[15px]">
                {onAbrirBanco ? (
                  <button
                    type="button"
                    className="text-heading min-w-0 truncate rounded text-left font-medium underline-offset-2 hover:underline"
                    onClick={() => onAbrirBanco(banco.bancoNombre)}
                  >
                    {banco.bancoNombre}
                  </button>
                ) : (
                  <span className="text-heading min-w-0 truncate font-medium">{banco.bancoNombre}</span>
                )}
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`tabular-nums ${queda < 0 ? 'text-red-600 dark:text-red-400' : 'text-heading'}`}>{montoCorto(queda)}</span>
                  <EtiquetaEstado saldoCentavos={queda} descubiertoCentavos={banco.descubiertoCentavos} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {sugerencia ? (
        <p className={`mt-1 text-[13px] ${sugerencia.tono === 'ok' ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'}`}>
          {sugerencia.texto}
        </p>
      ) : null}
    </Tarjeta>
  )
}

export function TarjetaSemanaGrafico({ prevision }: { prevision: HoyResponse['prevision'] }) {
  const dias = (prevision.semana ?? []).slice(0, 5)
  const maximo = Math.max(1, ...dias.flatMap((fila) => [fila.aPagarCentavos, fila.aCobrarCentavos]))
  const pesado = dias.find((fila) => fila.esElMasPesado)
  const altura = (centavos: number) => `${Math.round((centavos / maximo) * 100)}%`
  return (
    <Tarjeta
      titulo="Esta semana"
      subtitulo="Rojo: a pagar · Verde: a cobrar"
      ayuda="Los próximos cinco días hábiles. Cuanto más alta la barra, más plata se mueve ese día. No incluye lo atrasado (eso está aparte, en Pagos/Cobros atrasados); sí incluye cheques que vencen ese día; un cobro deja de contar acá en cuanto ya llegó al banco."
    >
      {dias.length === 0 ? (
        <Vacio texto="Esta semana no hay nada anotado todavía." />
      ) : (
        <>
          <div className="flex items-end gap-1">
            {dias.map((fila) => (
              <div key={fila.fecha} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex h-16 w-full items-end justify-center gap-0.5">
                  <div
                    className="w-2.5 rounded-t bg-red-500 dark:bg-red-400"
                    style={{ height: altura(fila.aPagarCentavos) }}
                    title={`A pagar: ${formatMoneyCentavos(fila.aPagarCentavos, 'ARS')}`}
                  />
                  <div
                    className="w-2.5 rounded-t bg-emerald-500 dark:bg-emerald-400"
                    style={{ height: altura(fila.aCobrarCentavos) }}
                    title={`A cobrar: ${formatMoneyCentavos(fila.aCobrarCentavos, 'ARS')}`}
                  />
                </div>
                <span className={`text-[13px] ${fila.esElMasPesado ? 'text-heading font-medium' : 'text-body-muted'}`}>{diaCorto(fila.fecha)}</span>
              </div>
            ))}
          </div>
          {pesado ? (
            <p className="mt-1 text-[13px] text-amber-900 dark:text-amber-200">
              El {nombreDia(pesado.fecha)} es el día más pesado: pagás {montoCorto(pesado.aPagarCentavos)}.
            </p>
          ) : null}
        </>
      )}
    </Tarjeta>
  )
}

