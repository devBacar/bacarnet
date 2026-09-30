import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { FinanzasMoneda } from '../../../../services/finanzasApi'
import type { DetalleCajaOpcion, LineaCajaDia, LineaValorCaja } from '../../../../services/finanzasCajaDiaApi'
import { formatMoneyCentavos } from '../../formatMoney'
import { Monto } from '../TarjetasHoy'
import { SelectorDetalle } from './SelectorDetalle'

const marco = 'min-w-0 rounded-xl border border-neutral-200 dark:border-zinc-700'
const fila = 'flex min-w-0 items-center justify-between gap-2 px-2.5 py-1 text-sm'
const etiqueta = 'min-w-0 truncate text-left'

export function Planilla({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <div className={marco}>
      <div className="border-b border-neutral-200 px-2.5 py-1.5 dark:border-zinc-700">
        <h3 className="text-heading truncate text-sm font-semibold">{titulo}</h3>
        {nota ? <p className="text-body-muted truncate text-xs">{nota}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function FilaMonto({
  texto,
  centavos,
  className = '',
  href,
  cantidad,
  moneda = 'ARS',
}: {
  texto: string
  centavos: number | null
  className?: string
  href?: string
  cantidad?: number
  moneda?: FinanzasMoneda
}) {
  const textoMonto =
    centavos == null ? null : (
      <span
        className={`shrink-0 whitespace-nowrap tabular-nums ${
          centavos < 0 ? 'text-red-600 dark:text-red-400' : ''
        }`}
      >
        {formatMoneyCentavos(centavos, moneda)}
      </span>
    )
  const monto =
    centavos == null ? (
      <span className="text-body-muted shrink-0 text-xs">Sin dato</span>
    ) : href ? (
      <Link to={href} className="shrink-0 rounded hover:underline">
        {textoMonto}
      </Link>
    ) : (
      textoMonto
    )

  return (
    <div className={`${fila} ${className}`}>
      <span className={etiqueta}>
        {texto}
        {cantidad != null && cantidad > 1 ? <span className="text-body-muted"> × {cantidad}</span> : null}
      </span>
      {monto}
    </div>
  )
}

function hrefMovimientos(cuentaId: string, fecha: string, textoBanco: string | null): string {
  const params = new URLSearchParams({ cuenta: cuentaId, desde: fecha, hasta: fecha })
  if (textoBanco) params.set('q', textoBanco)
  return `/finanzas/movimientos?${params.toString()}`
}

export function LineaBanco({
  linea,
  fecha,
  cuentaId,
  abierta,
  detalles,
  guardando,
  onAbrir,
  onCerrar,
  onElegir,
}: {
  linea: LineaCajaDia
  fecha: string
  cuentaId: string
  abierta: boolean
  detalles: DetalleCajaOpcion[]
  guardando: boolean
  onAbrir: () => void
  onCerrar: () => void
  onElegir: (texto: string | null, aplicarAlMismoTexto: boolean) => void
}) {
  return (
    <div className={`${fila} relative`}>
      <button
        type="button"
        onClick={onAbrir}
        className={`${etiqueta} rounded hover:underline`}
        aria-expanded={abierta}
        title="Cambiar el detalle"
      >
        {linea.detalle}
        {linea.cantidad > 1 ? <span className="text-body-muted"> × {linea.cantidad}</span> : null}
      </button>
      <Link
        to={hrefMovimientos(cuentaId, fecha, linea.textoBanco)}
        className="shrink-0 rounded hover:underline"
        title={linea.textoBanco ?? 'Ver los movimientos del día'}
      >
        <Monto centavos={linea.centavos} />
      </Link>
      {abierta ? (
        <SelectorDetalle
          detalles={detalles}
          origen={linea.origen}
          guardando={guardando}
          onCerrar={onCerrar}
          onElegir={onElegir}
        />
      ) : null}
    </div>
  )
}

export function LineasSimples({ lineas }: { lineas: LineaValorCaja[] }) {
  if (lineas.length === 0) {
    return <p className="text-body-muted px-2.5 py-1 text-xs">Sin movimientos</p>
  }
  return (
    <>
      {lineas.map((linea) => (
        <FilaMonto
          key={`${linea.detalle}:${linea.centavos < 0 ? '-' : '+'}`}
          texto={linea.detalle}
          centavos={linea.centavos}
          cantidad={linea.cantidad}
        />
      ))}
    </>
  )
}
