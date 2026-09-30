import type { ContraparteMovimiento, ContraparteOrigen } from '../../services/finanzasMovimientosApi'

const ETIQUETA: Record<ContraparteOrigen, string> = {
  manual: 'cargado a mano',
  banco: 'según el banco',
  transferencia: 'transferencia hecha desde BacarNet',
  agenda: 'según la Agenda',
  interbanking: 'según Interbanking',
  directorio: 'conocido por su CUIT',
  categoria: 'cargo del banco',
}

export function etiquetaOrigenContraparte(origen: ContraparteOrigen | null | undefined): string | null {
  if (!origen) return null
  return ETIQUETA[origen] ?? null
}

/** Acepta el objeto nuevo y el string viejo (el texto que mandaba el banco). */
export function datosContraparte(value: ContraparteMovimiento | string | null | undefined): {
  nombre: string | null
  cuit: string | null
  origen: ContraparteOrigen | null
} {
  if (!value) return { nombre: null, cuit: null, origen: null }
  if (typeof value === 'string') {
    const nombre = value.trim()
    return { nombre: nombre || null, cuit: null, origen: nombre ? 'banco' : null }
  }
  const nombre = value.nombre?.trim() || null
  return { nombre, cuit: value.cuit?.trim() || null, origen: value.origen }
}
