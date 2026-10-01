import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BancoCajaDia, DetalleCajaOpcion, LineaCajaDia } from '../../../../services/finanzasCajaDiaApi'
import { formatMoneyCentavos } from '../../formatMoney'
import { EtiquetaEstado, Monto, linkChico } from '../TarjetasHoy'
import { etiquetaBanco } from './fechasCaja'
import { SelectorDetalle } from './SelectorDetalle'

const PALABRAS_VISIBLES = 3

function hrefMovimientos(cuentaId: string, fecha: string, textoBanco: string | null): string {
  const params = new URLSearchParams({ cuenta: cuentaId, desde: fecha, hasta: fecha })
  if (textoBanco) params.set('q', textoBanco)
  return `/finanzas/movimientos?${params.toString()}`
}

function avisoCuadre(banco: BancoCajaDia): { texto: string; centavos: number } | null {
  const diferencia = banco.cuadre.diferenciaCentavos
  if (diferencia == null || diferencia === 0) return null
  if (diferencia === banco.faltanteCentavos && banco.faltanteCentavos !== 0) return null
  if (banco.cuadre.esRedondeo) return { texto: 'Diferencia de redondeo', centavos: diferencia }
  return { texto: 'No cierra', centavos: diferencia }
}

function conSigno(centavos: number): string {
  return `${centavos < 0 ? '−' : '+'}${formatMoneyCentavos(Math.abs(centavos), 'ARS')}`
}

/** Lo que entró, lo que salió y lo que falta detallar, para la barrita y el resumen en palabras. */
function resumirBanco(banco: BancoCajaDia) {
  const entro = banco.lineas.filter((linea) => linea.centavos > 0).reduce((suma, linea) => suma + linea.centavos, 0)
  const salio = banco.lineas.filter((linea) => linea.centavos < 0).reduce((suma, linea) => suma - linea.centavos, 0)
  const sinDetalle = Math.abs(banco.faltanteCentavos)
  const total = entro + salio + sinDetalle

  const palabras = [...new Set(banco.lineas.map((linea) => linea.detalle))]
  const partes: string[] = []
  if (entro > 0) partes.push(conSigno(entro))
  if (salio > 0) partes.push(conSigno(-salio))
  if (palabras.length > 0) {
    const visibles = palabras.slice(0, PALABRAS_VISIBLES).join(', ')
    const resto = palabras.length - PALABRAS_VISIBLES
    partes.push(resto > 0 ? `${visibles} y ${resto} más` : visibles)
  }
  if (banco.faltanteCentavos !== 0) {
    partes.push(`${conSigno(banco.faltanteCentavos)} sin detalle todavía: el banco lo manda mañana`)
  }

  return {
    total,
    porcentaje: (centavos: number) => (total > 0 ? `${(centavos / total) * 100}%` : '0%'),
    entro,
    salio,
    sinDetalle,
    resumen: partes.length > 0 ? partes.join(' · ') : 'sin movimientos',
  }
}

function LineaBanco({
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
    <li className="relative flex items-center gap-2 py-1 text-sm">
      <button
        type="button"
        onClick={onAbrir}
        className="text-heading min-w-0 flex-1 truncate rounded text-left underline-offset-2 hover:underline"
        aria-expanded={abierta}
        title="Cambiar la palabra"
      >
        {linea.detalle}
      </button>
      {linea.cantidad > 1 ? <span className="text-body-muted shrink-0 text-xs">× {linea.cantidad}</span> : null}
      <Link
        to={hrefMovimientos(cuentaId, fecha, linea.textoBanco)}
        className="shrink-0 rounded hover:underline"
        title={linea.textoBanco ?? 'Ver los movimientos del día'}
      >
        <Monto centavos={linea.centavos} />
      </Link>
      {abierta ? (
        <SelectorDetalle detalles={detalles} origen={linea.origen} guardando={guardando} onCerrar={onCerrar} onElegir={onElegir} />
      ) : null}
    </li>
  )
}

function SaldoBanco({ centavos, className = '' }: { centavos: number | null; className?: string }) {
  if (centavos == null) return <span className={`text-body-muted text-xs ${className}`}>Sin dato</span>
  return <Monto centavos={centavos} className={className} />
}

export function FilaBanco({
  banco,
  fecha,
  detalles,
  guardandoId,
  abierto,
  onToggle,
  onGuardar,
}: {
  banco: BancoCajaDia
  fecha: string
  detalles: DetalleCajaOpcion[]
  guardandoId: string | null
  abierto: boolean
  onToggle: () => void
  onGuardar: (linea: LineaCajaDia, texto: string | null, aplicar: boolean) => void
}) {
  const [lineaAbierta, setLineaAbierta] = useState<string | null>(null)
  const resumen = resumirBanco(banco)
  const aviso = avisoCuadre(banco)
  const clave = (linea: LineaCajaDia) => `${banco.cuentaId}:${linea.detalle}:${linea.centavos < 0 ? '-' : '+'}`

  return (
    <li className="py-2">
      {/* En celular: Banco · Saldo / Estado · Ver / barra. En escritorio todo en una fila. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[7rem_minmax(0,1fr)_auto_auto_auto]">
        <span className="text-heading min-w-0 truncate text-sm font-medium md:col-start-1 md:row-start-1">
          {etiquetaBanco(banco.bancoNombre)}
        </span>
        <span className="text-heading text-right text-sm md:col-start-3 md:row-start-1">
          <SaldoBanco centavos={banco.saldoCentavos} />
        </span>
        <span className="md:col-start-4 md:row-start-1">
          {banco.saldoCentavos != null ? (
            <EtiquetaEstado saldoCentavos={banco.saldoCentavos} descubiertoCentavos={banco.descubiertoCentavos} />
          ) : null}
        </span>
        <span className="text-right md:col-start-5 md:row-start-1">
          <button type="button" className={linkChico} aria-expanded={abierto} onClick={onToggle}>
            {abierto ? 'Cerrar' : 'Ver ›'}
          </button>
        </span>
        <div className="col-span-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-zinc-700" aria-hidden>
            {resumen.entro > 0 ? <div className="h-full bg-emerald-500 dark:bg-emerald-400" style={{ width: resumen.porcentaje(resumen.entro) }} /> : null}
            {resumen.salio > 0 ? <div className="h-full bg-red-500 dark:bg-red-400" style={{ width: resumen.porcentaje(resumen.salio) }} /> : null}
            {resumen.sinDetalle > 0 ? <div className="h-full bg-amber-400 dark:bg-amber-300" style={{ width: resumen.porcentaje(resumen.sinDetalle) }} /> : null}
          </div>
          <p className="text-body-muted mt-0.5 break-words text-xs tabular-nums">{resumen.resumen}</p>
        </div>
      </div>

      {abierto ? (
        <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50/60 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/40">
          <p className="text-body-muted flex items-center justify-between gap-2 text-xs">
            <span>Arranca{banco.origenSaldo === 'cierre15' ? ' (cierre de las 15 hs)' : ''}</span>
            <SaldoBanco centavos={banco.arrancaCentavos} />
          </p>
          {banco.lineas.length === 0 ? (
            <p className="text-body-muted py-1 text-xs">Sin movimientos</p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-zinc-800">
              {banco.lineas.map((linea) => (
                <LineaBanco
                  key={clave(linea)}
                  linea={linea}
                  fecha={fecha}
                  cuentaId={banco.cuentaId}
                  abierta={lineaAbierta === clave(linea)}
                  detalles={detalles}
                  guardando={guardandoId === clave(linea)}
                  onAbrir={() => setLineaAbierta(clave(linea))}
                  onCerrar={() => setLineaAbierta(null)}
                  onElegir={(texto, aplicar) => {
                    setLineaAbierta(null)
                    onGuardar(linea, texto, aplicar)
                  }}
                />
              ))}
            </ul>
          )}
          {banco.faltanteCentavos !== 0 ? (
            <p className="flex items-center justify-between gap-2 py-1 text-xs text-amber-900 dark:text-amber-200">
              <span>Sin detalle todavía</span>
              <Monto centavos={banco.faltanteCentavos} negativoEnRojo={false} />
            </p>
          ) : null}
          {aviso ? (
            <p className="text-body-muted flex items-center justify-between gap-2 py-1 text-xs">
              <span>{aviso.texto}</span>
              <span className="tabular-nums">{formatMoneyCentavos(aviso.centavos, 'ARS')}</span>
            </p>
          ) : null}
          <p className="text-heading flex items-center justify-between gap-2 border-t border-neutral-200 pt-1 text-sm font-medium dark:border-zinc-700">
            <span>Saldo</span>
            <SaldoBanco centavos={banco.saldoCentavos} />
          </p>
          {banco.descubiertoCentavos != null && banco.descubiertoCentavos > 0 ? (
            <p className="text-body-muted flex items-center justify-between gap-2 pt-0.5 text-xs">
              <span>Descubierto acordado</span>
              <Monto centavos={banco.descubiertoCentavos} negativoEnRojo={false} />
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
