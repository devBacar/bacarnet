import { useState, type ReactNode } from 'react'
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

/** Lista con las primeras filas y un "Ver todos (N) ›" que despliega el resto. */
function Lista<T>({ items, clave, render }: { items: T[]; clave: (item: T) => string; render: (item: T) => ReactNode }) {
  const [todos, setTodos] = useState(false)
  const visibles = todos ? items : items.slice(0, FILAS_VISIBLES)
  return (
    <>
      <ul className="divide-y divide-neutral-100 dark:divide-zinc-800">
        {visibles.map((item) => (
          <li key={clave(item)}>{render(item)}</li>
        ))}
      </ul>
      {items.length > FILAS_VISIBLES && !todos ? (
        <button type="button" className={`${linkChico} mt-1`} onClick={() => setTodos(true)}>
          Ver todos ({items.length}) ›
        </button>
      ) : null}
    </>
  )
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
  const filas = [...pagos.filas].sort((a, b) => Number(b.vencido) - Number(a.vencido))
  return (
    <Tarjeta
      tour={tour}
      titulo={titulo}
      derecha={filas.length > 0 ? <Total centavos={pagos.totalCentavos} /> : undefined}
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
 * Cobros de hoy
 * -------------------------------------------------------------------------- */

export function CobrosHoy({
  ingresos,
  atrasados,
  sinFecha,
  confirmandoId,
  onConfirmar,
  onEfectivo,
  onReprogramar,
  onReclamar,
  onReclamarAtrasado,
  puedeOperar = true,
}: {
  ingresos: IngresoHoy[]
  atrasados: CobroAtrasadoHoy[]
  sinFecha?: { cantidad: number; totalCentavos: number }
  confirmandoId: string | null
  onConfirmar: (ingreso: IngresoHoy) => void
  onEfectivo: (ingreso: IngresoHoy) => void
  onReprogramar: (ingreso: IngresoHoy) => void
  onReclamar: (ingreso: IngresoHoy) => void
  onReclamarAtrasado: (cobro: CobroAtrasadoHoy) => void
  puedeOperar?: boolean
}) {
  const total = ingresos.reduce((suma, fila) => suma + fila.montoCentavos, 0)
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
              etiqueta={ingreso.atrasado && ingreso.atrasadoTexto ? <Etiqueta tono="rojo">{ingreso.atrasadoTexto}</Etiqueta> : undefined}
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
      {atrasados.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-2 dark:border-zinc-800">
          {atrasados.map((cobro) => (
            <li key={cobro.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[13px]">
              <span className="min-w-0">
                <span className="font-medium text-red-700 dark:text-red-300">Atrasado:</span>{' '}
                <span className="text-heading">{cobro.cliente}</span>
                <span className="text-body-muted"> · {cobro.haceTexto.toLowerCase()}{cobro.estimada ? ' · fecha estimada' : ''}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Monto centavos={cobro.montoCentavos} className="text-heading" />
                <button type="button" className={linkChico} onClick={() => onReclamarAtrasado(cobro)}>
                  Reclamar
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {sinFecha && sinFecha.cantidad > 0 ? (
        <p className="text-body-muted mt-3 border-t border-neutral-100 pt-2 text-[13px] dark:border-zinc-800">
          {sinFecha.cantidad} {sinFecha.cantidad === 1 ? 'factura a cobrar' : 'facturas a cobrar'} sin fecha esperada en Vientri por{' '}
          <Monto centavos={sinFecha.totalCentavos} className="text-heading" />. Las ves en Agenda › Cobros › Sin fecha.
        </p>
      ) : null}
    </Tarjeta>
  )
}
