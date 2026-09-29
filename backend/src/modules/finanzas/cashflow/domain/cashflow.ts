import type { Moneda } from '../../domain/cuenta.types.js'

export const CASHFLOW_VENTANA_DIAS = 31
const SIN_CATEGORIA = '__sin_categoria__'
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export interface MovimientoCashflow {
  moneda: Moneda
  tipo: 'debito' | 'credito'
  montoCentavos: number
  categoriaId: string | null
}

export interface CategoriaCashflow {
  id: string
  nombre: string
  color: string | null
}

export interface CashflowDesgloseItem {
  categoriaId: string | null
  nombre: string
  color: string | null
  centavos: number
  porcentaje: number
}

export interface CashflowDiario {
  fecha: string
  moneda: Moneda
  saldoInicial: { fechaId: string; centavos: number } | null
  entradasCentavos: number
  salidasCentavos: number
  saldoFinal:
    | { estado: 'cerrado'; centavos: number }
    | { estado: 'pendiente'; centavos: number | null }
  entradas: CashflowDesgloseItem[]
  salidas: CashflowDesgloseItem[]
}

export function esFechaId(value: string): boolean {
  if (!FECHA_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function sumarDias(fechaId: string, dias: number): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + dias))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function esFinDeSemana(fechaId: string): boolean {
  const [year, month, day] = fechaId.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 || weekday === 6
}

/** Hoy si es hábil; si no, el viernes anterior. */
export function ultimoDiaHabil(fechaId: string): string {
  let cursor = fechaId
  while (esFinDeSemana(cursor)) cursor = sumarDias(cursor, -1)
  return cursor
}

export function validarFechaCashflow(fecha: string, hoy: string): void {
  if (!esFechaId(fecha) || !esFechaId(hoy)) {
    throw new Error('fecha inválida')
  }
  if (fecha > hoy) throw new Error('La fecha no puede ser futura')
  if (fecha < sumarDias(hoy, -CASHFLOW_VENTANA_DIAS)) {
    throw new Error('Solo se puede consultar hasta un mes atrás')
  }
}

function porcentaje(parte: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((parte * 1000) / total) / 10
}

function desglose(
  montos: Map<string, number>,
  total: number,
  categorias: CategoriaCashflow[],
): CashflowDesgloseItem[] {
  return [...montos.entries()]
    .map(([key, centavos]) => {
      if (key === SIN_CATEGORIA) {
        return {
          categoriaId: null,
          nombre: 'Sin categoría',
          color: null,
          centavos,
          porcentaje: porcentaje(centavos, total),
        }
      }
      const categoria = categorias.find((item) => item.id === key)
      return {
        categoriaId: key,
        nombre: categoria?.nombre ?? 'Categoría eliminada',
        color: categoria?.color ?? null,
        centavos,
        porcentaje: porcentaje(centavos, total),
      }
    })
    .sort((a, b) => b.centavos - a.centavos || a.nombre.localeCompare(b.nombre, 'es'))
}

export function armarCashflow(input: {
  fecha: string
  moneda: Moneda
  saldoInicial: { fechaId: string; centavos: number } | null
  saldoCierre: { centavos: number } | null
  movimientos: MovimientoCashflow[]
  categorias: CategoriaCashflow[]
}): CashflowDiario {
  const entradasPorCategoria = new Map<string, number>()
  const salidasPorCategoria = new Map<string, number>()
  let entradasCentavos = 0
  let salidasCentavos = 0

  for (const movimiento of input.movimientos) {
    if (movimiento.moneda !== input.moneda) continue
    const key = movimiento.categoriaId ?? SIN_CATEGORIA
    const destino = movimiento.tipo === 'credito' ? entradasPorCategoria : salidasPorCategoria
    destino.set(key, (destino.get(key) ?? 0) + movimiento.montoCentavos)
    if (movimiento.tipo === 'credito') entradasCentavos += movimiento.montoCentavos
    else salidasCentavos += movimiento.montoCentavos
  }

  const saldoFinal = input.saldoCierre
    ? { estado: 'cerrado' as const, centavos: input.saldoCierre.centavos }
    : {
        estado: 'pendiente' as const,
        centavos:
          input.saldoInicial == null
            ? null
            : input.saldoInicial.centavos + entradasCentavos - salidasCentavos,
      }

  return {
    fecha: input.fecha,
    moneda: input.moneda,
    saldoInicial: input.saldoInicial,
    entradasCentavos,
    salidasCentavos,
    saldoFinal,
    entradas: desglose(entradasPorCategoria, entradasCentavos, input.categorias),
    salidas: desglose(salidasPorCategoria, salidasCentavos, input.categorias),
  }
}
