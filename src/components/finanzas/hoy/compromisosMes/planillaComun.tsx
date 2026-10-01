import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMoneyCentavos } from '../../formatMoney'
import { montoCorto } from '../montoCorto'
import type { FilaCompromisoMes, MonedaCompromiso, MontosMoneda } from '../../../../services/finanzasCompromisosMesApi'
import type { TonoMonto } from './semanasDelMes'
import { claseTono, detalleCompromiso, montosVacios, tituloMontos } from './planillaModelo'

export function LeyendaPlanilla() {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 px-3 py-2 text-[13px] text-neutral-600 dark:text-neutral-300">
      <span className="font-medium text-red-600 dark:text-red-400">rojo</span>
      <span>= venció y no se pagó</span>
      <span aria-hidden className="text-neutral-400">
        ·
      </span>
      <span className="font-medium text-emerald-700 dark:text-emerald-400">verde</span>
      <span>= pagado</span>
      <span aria-hidden className="text-neutral-400">
        ·
      </span>
      <span className="font-medium text-neutral-900 dark:text-gray-100">negro</span>
      <span>= a pagar</span>
      <span aria-hidden className="text-neutral-400">
        ·
      </span>
      <span>Tocá un compromiso para cambiarlo.</span>
    </p>
  )
}

export function PieGruposVacios({
  cantidad,
  mostrar,
  onToggle,
}: {
  cantidad: number
  mostrar: boolean
  onToggle: () => void
}) {
  if (cantidad === 0) return null
  return (
    <button type="button" className="px-3 py-2.5 text-left text-[13px] font-medium text-[var(--color-primary)]" onClick={onToggle}>
      {mostrar ? 'Ocultar grupos vacíos' : `Mostrar grupos vacíos (${cantidad})`}
    </button>
  )
}

export function BotonAgregar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="shrink-0 text-[13px] font-medium text-[var(--color-primary)]"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      + Agregar
    </button>
  )
}

export function ConceptoFila({ fila, onEditar }: { fila: FilaCompromisoMes; onEditar: () => void }) {
  const detalle = detalleCompromiso(fila)
  const titulo = fila.observacion ? `${fila.concepto} — ${fila.observacion}` : fila.concepto
  return (
    <div className="flex min-w-0 items-start gap-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-neutral-900 dark:text-gray-100" title={titulo}>
          {fila.concepto}
        </p>
        <p className="truncate text-[13px] text-neutral-500 dark:text-neutral-400" title={detalle}>
          {detalle}
        </p>
      </div>
      <button
        type="button"
        aria-label="Cambiar"
        className="mt-0.5 shrink-0 rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-zinc-700 dark:hover:text-gray-100"
        onClick={(event) => {
          event.stopPropagation()
          onEditar()
        }}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}

export function NombreGrupo({ cerrado, children }: { cerrado: boolean; children: ReactNode }) {
  const Icono = cerrado ? ChevronRight : ChevronDown
  return (
    <span className="flex min-w-0 items-center gap-1 text-[15px] font-medium text-neutral-900 dark:text-gray-100">
      <Icono className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  )
}

export function MontosEnLineas({
  valores,
  corto = false,
  className = '',
}: {
  valores: MontosMoneda | undefined
  corto?: boolean
  className?: string
}) {
  if (montosVacios(valores) || !valores) return null
  const texto = (centavos: number, moneda: MonedaCompromiso) =>
    corto ? montoCorto(centavos, moneda) : formatMoneyCentavos(centavos, moneda)
  return (
    <span className={`tabular-nums ${className}`} title={corto ? tituloMontos(valores) : undefined}>
      {valores.ars > 0 ? <span className="block truncate">{texto(valores.ars, 'ARS')}</span> : null}
      {valores.usd > 0 ? <span className="block truncate">{texto(valores.usd, 'USD')}</span> : null}
    </span>
  )
}

export function MontoUno({
  centavos,
  moneda,
  tono,
  corto = false,
  tilde = false,
}: {
  centavos: number
  moneda: MonedaCompromiso
  tono: TonoMonto
  corto?: boolean
  tilde?: boolean
}) {
  if (centavos <= 0) return null
  const completo = formatMoneyCentavos(centavos, moneda)
  return (
    <span className={`block truncate tabular-nums ${claseTono(tono)}`} title={corto ? completo : undefined}>
      {tilde ? '✓ ' : ''}
      {corto ? montoCorto(centavos, moneda) : completo}
    </span>
  )
}

export function LineasPagosHechos({
  pagos,
}: {
  pagos: Array<{ linea: string }> | undefined
}) {
  if (!pagos || pagos.length === 0) return null
  return (
    <div className="mt-2 border-t border-neutral-200 pt-2 dark:border-zinc-700">
      <ul className="space-y-1">
        {pagos.map((pago, indice) => (
          <li key={`${pago.linea}-${indice}`} className="text-[13px] text-emerald-800 dark:text-emerald-300">
            {pago.linea}
          </li>
        ))}
      </ul>
      <Link
        to="/finanzas/agenda?tab=pagos&vista=hechos"
        className="mt-1 inline-block text-[13px] font-medium text-[var(--color-primary)]"
      >
        Ver en Pagos hechos ›
      </Link>
    </div>
  )
}

export function PanelJuntoAlBoton({
  boton,
  onCerrar,
  children,
  etiqueta,
}: {
  boton: HTMLButtonElement
  onCerrar: () => void
  children: ReactNode
  etiqueta: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = onCerrar
  useEffect(() => {
    const cerrar = (event: PointerEvent) => {
      const target = event.target as Node
      if (panel.current?.contains(target) || boton.contains(target)) return
      cerrarRef.current()
    }
    const tecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cerrarRef.current()
    }
    const desde = performance.now()
    const alScroll = () => {
      if (performance.now() - desde < 200) return
      cerrarRef.current()
    }
    document.addEventListener('pointerdown', cerrar)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', alScroll, true)
    return () => {
      document.removeEventListener('pointerdown', cerrar)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', alScroll, true)
    }
  }, [boton])

  const rect = boton.getBoundingClientRect()
  const ancho = 288
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 8))
  const arriba = rect.bottom + 220 > window.innerHeight && rect.top > 180
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={etiqueta}
      className="fixed z-50 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      style={{ top: arriba ? rect.top - 8 : rect.bottom + 6, left, transform: arriba ? 'translateY(-100%)' : undefined }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}
