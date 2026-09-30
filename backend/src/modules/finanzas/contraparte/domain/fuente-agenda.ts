import { fechaEnRangoHabil } from './dias-habiles.js'
import { cuitOnceDigitos, nombreContraparteLimpio } from './normalizar.js'

export interface ItemAgenda {
  id: string
  tipo: 'compromiso' | 'cobro'
  nombre: string | null
  cuit: string | null
  montoCentavos: number
  /** Día de pago/confirmación, o vencimiento/esperado si eso no está. */
  fecha: string
  cuentaId: string | null
  estado: string | null
}

export function agendaCandidatos(
  mov: { tipo: string; cuentaId: string; montoCentavos: number; fechaProceso: string },
  items: readonly ItemAgenda[],
): ItemAgenda[] {
  return items.filter((item) => {
    if (mov.tipo === 'debito' && item.tipo !== 'compromiso') return false
    if (mov.tipo === 'credito' && item.tipo !== 'cobro') return false
    if (item.tipo !== 'compromiso' && item.tipo !== 'cobro') return false
    if (item.estado === 'incobrable') return false
    if (!nombreContraparteLimpio(item.nombre)) return false
    if (item.cuentaId && item.cuentaId !== mov.cuentaId) return false
    if (item.montoCentavos !== mov.montoCentavos) return false
    return fechaEnRangoHabil(mov.fechaProceso, item.fecha, 3, 3)
  })
}

export function identidadDeAgenda(item: ItemAgenda): { nombre: string | null; cuit: string | null } {
  return {
    nombre: nombreContraparteLimpio(item.nombre),
    cuit: cuitOnceDigitos(item.cuit),
  }
}
