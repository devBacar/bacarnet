import { Fragment, useState, type ReactNode } from 'react'
import type { CobroAtrasadoHoy, HoyResponse, IngresoHoy, PagoHoy } from '../../../services/finanzasHoyApi'
import { Etiqueta, MenuAcciones, Monto, Tarjeta, Vacio, botonChico, botonChicoSecundario, linkChico } from './TarjetasHoy'

const FILAS_VISIBLES = 4

/** Total chico y gris a la derecha del título. */
function Total({ centavos }: { centavos: number }) {
  return (
    <p className="text-brand-primary text-[13px]">
      Total <Monto centavos={centavos} className="text-brand-primary" />
    </p>
  )
}

/** Fila compacta: nombre y detalle a la izquierda, monto, un botón y el menú ⋯ a la derecha. */
function Fila({
  nombre,
  detalle,
  etiqueta,
  centavos,
  accion,
  menu,
  tourMenu,
}: {
  nombre: string
  detalle: ReactNode
  etiqueta?: ReactNode
  centavos: number
  accion?: ReactNode
  menu?: Array<{ texto: string; onClick: () => void; tour?: string }>
  tourMenu?: string
}) {
  return (
    <div className="flex items-center gap-2 py-2 text-[15px]">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-heading break-words font-medium">{nombre}</span>
          {etiqueta}
        </p>
        <p className="text-body-muted break-words text-[13px]">{detalle}</p>
      </div>
      <Monto centavos={centavos} className="text-heading shrink-0" />
      {accion}
      {menu ? <MenuAcciones opciones={menu} tour={tourMenu} /> : null}
    </div>
  )
}

/**
 * Primeras filas a la vista; «Ver más (N)» despliega el resto con scroll interno
 * para que la página no crezca.
 */
function Lista<T>({ items, clave, render }: { items: T[]; clave: (item: T) => string; render: (item: T) => ReactNode }) {
  const [todos, setTodos] = useState(false)
  const visibles = todos ? items : items.slice(0, FILAS_VISIBLES)
  const hayMas = items.length > FILAS_VISIBLES
  return (
    <div className={todos && hayMas ? 'max-h-[28rem] overflow-y-auto' : undefined}>
      <ul className="divide-y divide-neutral-100 dark:divide-zinc-800">
        {visibles.map((item) => (
          <li key={clave(item)}>{render(item)}</li>
        ))}
      </ul>
      {hayMas && !todos ? (
        <button type="button" className={`${linkChico} mt-1`} onClick={() => setTodos(true)}>
          Ver más ({items.length})
        </button>
      ) : null}
    </div>
  )
}

function totalDe(filas: { montoCentavos: number }[]): number {
  return filas.reduce((suma, fila) => suma + fila.montoCentavos, 0)
}

/** Días de atraso a partir de «Venció hace N días» / «Hace N días». */
function diasDesdeTexto(texto: string | null | undefined, fallback = 1): number {
  const match = texto?.match(/hace\s+(\d+)/i)
  if (!match) return fallback
  return Number(match[1]) || fallback
}

/* ----------------------------------------------------------------------------
 * Pagos de hoy
 * -------------------------------------------------------------------------- */

export function PagosHoy({
  pagos,
  onPagar,
  onYaPague,
  onReprogramar,
  puedeOperar = true,
  titulo = 'Pagos de hoy',
  vacio = 'No hay pagos para hoy.',
  ayuda = 'Son los mismos compromisos de Agenda: si pagás o cambiás algo acá, se actualiza allá.',
  tour = 'hoy-pagos',
  sinFecha = false,
}: {
  pagos: HoyResponse['pagos']
  onPagar: (pago: PagoHoy) => void
  onYaPague: (pago: PagoHoy) => void
  onReprogramar: (pago: PagoHoy) => void
  puedeOperar?: boolean
  titulo?: string
  vacio?: string
  ayuda?: string
  tour?: string
  /** Bandeja de facturas sin fecha: el botón principal es "Poner fecha". */
  sinFecha?: boolean
}) {
  const filas = pagos.filas
  const total = filas.length > 0 ? totalDe(filas) : 0
  return (
    <Tarjeta
      tour={tour}
      titulo={titulo}
      derecha={filas.length > 0 ? <Total centavos={total} /> : undefined}
      ayuda={ayuda}
    >
      {filas.length === 0 ? (
        <Vacio texto={vacio} />
      ) : (
        <Lista
          items={filas}
          clave={(pago) => pago.id}
          render={(pago) => (
            <Fila
              nombre={pago.aQuien}
              detalle={
                <>
                  {pago.concepto} · {pago.comoPagar}
                  {pago.estimada ? ' · fecha estimada' : null}
                  {pago.urgencia !== 'Normal' ? ` · urgencia ${pago.urgencia.toLowerCase()}` : null}
                </>
              }
              etiqueta={pago.vencido && pago.vencidoTexto ? <Etiqueta tono="rojo">{pago.vencidoTexto}</Etiqueta> : undefined}
              centavos={pago.montoCentavos}
              accion={
                puedeOperar ? (
                  sinFecha ? (
                    <button type="button" className={botonChico} onClick={() => onReprogramar(pago)}>
                      Poner fecha
                    </button>
                  ) : (
                    <button type="button" className={botonChico} data-tour="hoy-pagar" onClick={() => onPagar(pago)}>
                      Pagar
                    </button>
                  )
                ) : undefined
              }
              tourMenu="hoy-pago-menu"
              menu={
                puedeOperar
                  ? [
                      { texto: 'Ya lo pagué', onClick: () => onYaPague(pago), tour: 'hoy-pago-menu-ya-pague' },
                      { texto: 'Cambiar fecha', onClick: () => onReprogramar(pago), tour: 'hoy-pago-menu-fecha' },
                    ]
                  : undefined
              }
            />
          )}
        />
      )}
    </Tarjeta>
  )
}

/* ----------------------------------------------------------------------------
 * Cobros de hoy (solo lo que vence hoy; la nota de sin fecha queda acá)
 * -------------------------------------------------------------------------- */

export function CobrosHoy({
  ingresos,
  sinFecha,
  confirmandoId,
  onConfirmar,
  onEfectivo,
  onReprogramar,
  onReclamar,
  puedeOperar = true,
}: {
  ingresos: IngresoHoy[]
  sinFecha?: { cantidad: number; totalCentavos: number }
  confirmandoId: string | null
  onConfirmar: (ingreso: IngresoHoy) => void
  onEfectivo: (ingreso: IngresoHoy) => void
  onReprogramar: (ingreso: IngresoHoy) => void
  onReclamar: (ingreso: IngresoHoy) => void
  puedeOperar?: boolean
}) {
  const total = totalDe(ingresos)
  return (
    <Tarjeta
      tour="hoy-cobros"
      titulo="Cobros de hoy"
      derecha={ingresos.length > 0 ? <Total centavos={total} /> : undefined}
      ayuda="Se confirman solos cuando entra la plata. También los ves en Agenda › Cobros."
    >
      {ingresos.length === 0 ? (
        <Vacio texto="No hay cobros esperados para hoy." />
      ) : (
        <Lista
          items={ingresos}
          clave={(ingreso) => ingreso.id}
          render={(ingreso) => (
            <Fila
              nombre={ingreso.cliente}
              detalle={
                <>
                  {ingreso.concepto} ·{' '}
                  {ingreso.llego ? (
                    <span className="text-emerald-700 dark:text-emerald-300">llegó a {ingreso.bancoNombre ?? 'un banco'}</span>
                  ) : (
                    <span className="text-amber-800 dark:text-amber-300">todavía no llegó</span>
                  )}
                  {ingreso.estimada ? ' · fecha estimada' : null}
                </>
              }
              centavos={ingreso.montoCentavos}
              accion={
                ingreso.llego ? (
                  puedeOperar && ingreso.movimientoId ? (
                    <button
                      type="button"
                      className={botonChico}
                      disabled={confirmandoId === ingreso.id}
                      onClick={() => onConfirmar(ingreso)}
                    >
                      {confirmandoId === ingreso.id ? 'Confirmando…' : 'Confirmar'}
                    </button>
                  ) : undefined
                ) : (
                  <button type="button" className={botonChicoSecundario} onClick={() => onReclamar(ingreso)}>
                    Reclamar
                  </button>
                )
              }
              tourMenu="hoy-cobro-menu"
              menu={
                !puedeOperar || ingreso.llego
                  ? undefined
                  : [
                      { texto: 'Llegó en efectivo', onClick: () => onEfectivo(ingreso), tour: 'hoy-cobro-menu-efectivo' },
                      { texto: 'Cambiar fecha', onClick: () => onReprogramar(ingreso), tour: 'hoy-cobro-menu-fecha' },
                    ]
              }
            />
          )}
        />
      )}
      {sinFecha && sinFecha.cantidad > 0 ? (
        <p className="text-body-muted mt-3 border-t border-neutral-100 pt-2 text-[13px] dark:border-zinc-800">
          {sinFecha.cantidad} {sinFecha.cantidad === 1 ? 'factura a cobrar' : 'facturas a cobrar'} sin fecha esperada en Vientri por{' '}
          <Monto centavos={sinFecha.totalCentavos} className="text-heading" />. Las ves en Agenda › Cobros › Sin fecha.
        </p>
      ) : null}
    </Tarjeta>
  )
}

/* ----------------------------------------------------------------------------
 * Subsecciones de atrasados (hasta 30 / más de 30)
 * -------------------------------------------------------------------------- */

function SubseccionAtrasados({
  titulo,
  totalCentavos,
  cantidad,
  contraidaPorDefecto = false,
  ayuda,
  children,
}: {
  titulo: string
  totalCentavos: number
  cantidad: number
  contraidaPorDefecto?: boolean
  ayuda?: string
  children: ReactNode
}) {
  const [abierta, setAbierta] = useState(!contraidaPorDefecto)
  if (cantidad === 0) return null
  return (
    <div className="mt-2 first:mt-0">
      <button
        type="button"
        className="text-heading flex w-full items-baseline gap-1 text-left text-[13px] font-medium"
        aria-expanded={abierta}
        onClick={() => setAbierta((actual) => !actual)}
      >
        <span aria-hidden>{abierta ? '▾' : '▸'}</span>
        <span className="min-w-0">
          {titulo} ({cantidad}) · <Monto centavos={totalCentavos} className="text-heading" />
        </span>
      </button>
      {ayuda && !abierta ? <p className="text-body-muted mt-0.5 pl-4 text-[12px]">{ayuda}</p> : null}
      {abierta ? <div className="mt-1">{children}</div> : null}
    </div>
  )
}

const AYUDA_PAGOS_VIEJOS =
  'Siguen con saldo en Vientri pero pasó más de un mes: lo normal es que ya estén pagados y falte cargarlo en Vientri. Revisalos con Administración.'
const AYUDA_COBROS_VIEJOS =
  'Casi siempre restos que quedaron abiertos en Vientri (retenciones o diferencias). Revisalos con Administración.'

/* ----------------------------------------------------------------------------
 * Pagos atrasados (una sola tarjeta con las dos franjas)
 * -------------------------------------------------------------------------- */

export function PagosAtrasados({
  pagos,
  onPagar,
  onYaPague,
  onReprogramar,
  puedeOperar = true,
}: {
  pagos: PagoHoy[]
  onPagar: (pago: PagoHoy) => void
  onYaPague: (pago: PagoHoy) => void
  onReprogramar: (pago: PagoHoy) => void
  puedeOperar?: boolean
}) {
  const recientes = pagos.filter((f) => (f.diasAtraso ?? 0) <= 30)
  const viejos = pagos.filter((f) => (f.diasAtraso ?? 0) > 30)
  const total = totalDe(pagos)
  const fila = (pago: PagoHoy) => (
    <Fila
      nombre={pago.aQuien}
      detalle={
        <>
          {pago.concepto} · {pago.comoPagar}
          {pago.estimada ? ' · fecha estimada' : null}
          {pago.urgencia !== 'Normal' ? ` · urgencia ${pago.urgencia.toLowerCase()}` : null}
        </>
      }
      etiqueta={pago.vencidoTexto ? <Etiqueta tono="rojo">{pago.vencidoTexto}</Etiqueta> : undefined}
      centavos={pago.montoCentavos}
      accion={
        puedeOperar ? (
          <button type="button" className={botonChico} data-tour="hoy-pagar" onClick={() => onPagar(pago)}>
            Pagar
          </button>
        ) : undefined
      }
      tourMenu="hoy-pago-menu"
      menu={
        puedeOperar
          ? [
              { texto: 'Ya lo pagué', onClick: () => onYaPague(pago), tour: 'hoy-pago-menu-ya-pague' },
              { texto: 'Cambiar fecha', onClick: () => onReprogramar(pago), tour: 'hoy-pago-menu-fecha' },
            ]
          : undefined
      }
    />
  )
  return (
    <Tarjeta
      tour="hoy-pagos-atrasados"
      titulo="Pagos atrasados"
      derecha={pagos.length > 0 ? <Total centavos={total} /> : undefined}
      ayuda="Ya pasó su fecha de pago. No suman en los números de hoy. Si ya se pagaron, marcalos; si se van a pagar otro día, cambiales la fecha."
    >
      {pagos.length === 0 ? (
        <Vacio texto="No hay pagos atrasados." />
      ) : (
        <>
          <SubseccionAtrasados titulo="Hasta 30 días" cantidad={recientes.length} totalCentavos={totalDe(recientes)}>
            <Lista items={recientes} clave={(p) => p.id} render={fila} />
          </SubseccionAtrasados>
          <SubseccionAtrasados
            titulo="Más de 30 días: revisar si ya se pagaron"
            cantidad={viejos.length}
            totalCentavos={totalDe(viejos)}
            contraidaPorDefecto
            ayuda={AYUDA_PAGOS_VIEJOS}
          >
            <p className="text-body-muted mb-1 text-[12px]">{AYUDA_PAGOS_VIEJOS}</p>
            <Lista items={viejos} clave={(p) => p.id} render={fila} />
          </SubseccionAtrasados>
        </>
      )}
    </Tarjeta>
  )
}

/* ----------------------------------------------------------------------------
 * Cobros atrasados (una sola tarjeta; Reclamar + Confirmar si ya llegó)
 * -------------------------------------------------------------------------- */

export function CobrosAtrasados({
  atrasados,
  llegados,
  confirmandoId,
  onReclamar,
  onConfirmar,
  puedeOperar = true,
}: {
  atrasados: CobroAtrasadoHoy[]
  /** Cobros atrasados que ya llegaron al banco (salen de «Cobros de hoy»). */
  llegados?: IngresoHoy[]
  confirmandoId: string | null
  onReclamar: (cobro: CobroAtrasadoHoy) => void
  onConfirmar: (ingreso: IngresoHoy) => void
  puedeOperar?: boolean
}) {
  type Item =
    | { tipo: 'atrasado'; cobro: CobroAtrasadoHoy; haceDias: number }
    | { tipo: 'llegado'; ingreso: IngresoHoy; haceDias: number }

  const items: Item[] = [
    ...atrasados.map((cobro) => ({ tipo: 'atrasado' as const, cobro, haceDias: cobro.haceDias })),
    ...(llegados ?? []).map((ingreso) => ({
      tipo: 'llegado' as const,
      ingreso,
      haceDias: diasDesdeTexto(ingreso.atrasadoTexto),
    })),
  ]
  const recientes = items.filter((i) => i.haceDias <= 30)
  const viejos = items.filter((i) => i.haceDias > 30)
  const total = items.reduce(
    (suma, item) => suma + (item.tipo === 'atrasado' ? item.cobro.montoCentavos : item.ingreso.montoCentavos),
    0,
  )
  const clave = (item: Item) => (item.tipo === 'atrasado' ? item.cobro.id : item.ingreso.id)
  const monto = (item: Item) => (item.tipo === 'atrasado' ? item.cobro.montoCentavos : item.ingreso.montoCentavos)

  const renderItem = (item: Item) => {
    if (item.tipo === 'atrasado') {
      const cobro = item.cobro
      return (
        <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-1.5 text-[13px]">
          <span className="min-w-0">
            <span className="font-medium text-red-700 dark:text-red-300">Atrasado:</span>{' '}
            <span className="text-heading">{cobro.cliente}</span>
            <span className="text-body-muted">
              {' '}
              · {cobro.haceTexto.toLowerCase()}
              {cobro.estimada ? ' · fecha estimada' : ''}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Monto centavos={cobro.montoCentavos} className="text-heading" />
            <button type="button" className={linkChico} onClick={() => onReclamar(cobro)}>
              Reclamar
            </button>
          </span>
        </li>
      )
    }
    const ingreso = item.ingreso
    return (
      <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-1.5 text-[13px]">
        <span className="min-w-0">
          <span className="font-medium text-red-700 dark:text-red-300">Atrasado:</span>{' '}
          <span className="text-heading">{ingreso.cliente}</span>
          <span className="text-body-muted">
            {' '}
            · {ingreso.atrasadoTexto?.toLowerCase() ?? 'atrasado'}
            {ingreso.estimada ? ' · fecha estimada' : ''}
            {' · '}
            <span className="text-emerald-700 dark:text-emerald-300">llegó a {ingreso.bancoNombre ?? 'un banco'}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Monto centavos={ingreso.montoCentavos} className="text-heading" />
          {puedeOperar && ingreso.movimientoId ? (
            <button
              type="button"
              className={botonChico}
              disabled={confirmandoId === ingreso.id}
              onClick={() => onConfirmar(ingreso)}
            >
              {confirmandoId === ingreso.id ? 'Confirmando…' : 'Confirmar'}
            </button>
          ) : null}
        </span>
      </li>
    )
  }

  return (
    <Tarjeta
      tour="hoy-cobros-atrasados"
      titulo="Cobros atrasados"
      derecha={items.length > 0 ? <Total centavos={total} /> : undefined}
      ayuda="Ya pasó la fecha en que esperábamos la plata. Reclamá o confirmá si ya entró."
    >
      {items.length === 0 ? (
        <Vacio texto="No hay cobros atrasados." />
      ) : (
        <>
          <SubseccionAtrasados
            titulo="Hasta 30 días"
            cantidad={recientes.length}
            totalCentavos={recientes.reduce((s, i) => s + monto(i), 0)}
          >
            <ListaConScroll items={recientes} clave={clave} render={renderItem} />
          </SubseccionAtrasados>
          <SubseccionAtrasados
            titulo="Más de 30 días: revisar si ya se pagaron"
            cantidad={viejos.length}
            totalCentavos={viejos.reduce((s, i) => s + monto(i), 0)}
            contraidaPorDefecto
            ayuda={AYUDA_COBROS_VIEJOS}
          >
            <p className="text-body-muted mb-1 text-[12px]">{AYUDA_COBROS_VIEJOS}</p>
            <ListaConScroll items={viejos} clave={clave} render={renderItem} />
          </SubseccionAtrasados>
        </>
      )}
    </Tarjeta>
  )
}

/** Lista de ítems custom (li propios) con Ver más + scroll. */
function ListaConScroll<T>({
  items,
  clave,
  render,
}: {
  items: T[]
  clave: (item: T) => string
  render: (item: T) => ReactNode
}) {
  const [todos, setTodos] = useState(false)
  const visibles = todos ? items : items.slice(0, FILAS_VISIBLES)
  const hayMas = items.length > FILAS_VISIBLES
  return (
    <div className={todos && hayMas ? 'max-h-[28rem] overflow-y-auto' : undefined}>
      <ul>{visibles.map((item) => <Fragment key={clave(item)}>{render(item)}</Fragment>)}</ul>
      {hayMas && !todos ? (
        <button type="button" className={`${linkChico} mt-1`} onClick={() => setTodos(true)}>
          Ver más ({items.length})
        </button>
      ) : null}
    </div>
  )
}

/** Une filas extra (p. ej. filtradas de «hoy») sin duplicar por id. */
export function fusionarPorId<T extends { id: string }>(base: T[], extras: T[]): T[] {
  const ids = new Set(base.map((f) => f.id))
  return [...base, ...extras.filter((f) => !ids.has(f.id))]
}
