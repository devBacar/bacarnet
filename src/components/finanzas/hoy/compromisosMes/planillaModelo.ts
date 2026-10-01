import { useState } from 'react'
import { formatMoneyCentavos } from '../../formatMoney'
import { textoComoSePaga } from '../compromisosSemana/semana'
import type {
  FilaCompromisoMes,
  GrupoCompromisoMes,
  MontosMoneda,
} from '../../../../services/finanzasCompromisosMesApi'
import type { TonoMonto } from './semanasDelMes'

export const GRILLA = 'border border-neutral-200 px-1 py-1.5 align-top dark:border-zinc-700'

export function detalleCompromiso(fila: FilaCompromisoMes): string {
  const partes = [fila.proveedorONombre]
  if (fila.cuota) partes.push(`cuota ${fila.cuota}`)
  partes.push(textoComoSePaga(fila.medioPago))
  return partes.filter((parte) => parte.trim().length > 0).join(' · ')
}

export function estaPago(fila: Pick<FilaCompromisoMes, 'estado' | 'diferenciaCentavos'>): boolean {
  return fila.estado === 'pagado' || fila.diferenciaCentavos <= 0
}

export function puedePagarFila(fila: Pick<FilaCompromisoMes, 'diferenciaCentavos' | 'estado'>): boolean {
  return (
    fila.diferenciaCentavos > 0 &&
    fila.estado !== 'pagado' &&
    fila.estado !== 'confeccionada_pendiente_autorizacion'
  )
}

export function textoEstado(fila: FilaCompromisoMes, hoy: string): string {
  if (estaPago(fila)) return 'Pagado'
  if (fila.estado === 'confeccionada_pendiente_autorizacion') return 'Esperando la firma'
  if (fila.fechaVencimiento < hoy) return 'Venció y no se pagó'
  return 'A pagar'
}

export function claseTono(tono: TonoMonto): string {
  if (tono === 'vencido') return 'text-red-600 dark:text-red-400'
  if (tono === 'pagado') return 'text-emerald-700 dark:text-emerald-400'
  if (tono === 'aPagar') return 'text-neutral-900 dark:text-gray-100'
  return 'text-neutral-400 dark:text-neutral-500'
}

export function tonoFalta(fila: FilaCompromisoMes, hoy: string): TonoMonto {
  if (fila.diferenciaCentavos <= 0) return 'vacio'
  if (fila.fechaVencimiento < hoy) return 'vencido'
  return 'aPagar'
}

export function montosVacios(valores: MontosMoneda | undefined): boolean {
  if (!valores) return true
  return valores.ars === 0 && valores.usd === 0
}

export function sumarCampo(
  grupos: readonly GrupoCompromisoMes[],
  campo: 'importe' | 'acumulado' | 'diferencia' | 'arrastre',
): MontosMoneda {
  return grupos.reduce(
    (total, grupo) => ({
      ars: total.ars + grupo.subtotal[campo].ars,
      usd: total.usd + grupo.subtotal[campo].usd,
    }),
    { ars: 0, usd: 0 },
  )
}

export function tituloMontos(valores: MontosMoneda): string {
  const partes: string[] = []
  if (valores.ars > 0) partes.push(formatMoneyCentavos(valores.ars, 'ARS'))
  if (valores.usd > 0) partes.push(formatMoneyCentavos(valores.usd, 'USD'))
  return partes.join(' · ')
}

export function useGruposPlanilla(grupos: readonly GrupoCompromisoMes[]) {
  const [cerrados, setCerrados] = useState<Record<string, boolean>>({})
  const [mostrarVacios, setMostrarVacios] = useState(false)
  const vacios = grupos.filter((grupo) => grupo.filas.length === 0)
  const visibles = mostrarVacios ? grupos : grupos.filter((grupo) => grupo.filas.length > 0)
  const toggle = (nombre: string) => setCerrados((actual) => ({ ...actual, [nombre]: !actual[nombre] }))
  return { cerrados, toggle, mostrarVacios, setMostrarVacios, vacios, visibles }
}
