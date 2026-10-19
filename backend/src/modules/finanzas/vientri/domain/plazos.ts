/**
 * Plazos reales de pago y cobro según la historia de Vientri.
 * Para cada factura ya cancelada se mide cuántos días pasaron entre la fecha de la factura y el último pago/cobro
 * que la canceló. Con eso se estima la fecha de las facturas que no tienen vencimiento en Vientri:
 * mediana de cada cliente/proveedor (si tiene al menos 3 casos) o, si no, la mediana general del lado.
 */
import { ladoPendiente } from './comprobantes.js'
import type { FilaCsv } from './csv.js'
import { aBool, aCentavos, aEntero, aFecha } from './valores.js'

export type LadoPlazo = 'pagar' | 'cobrar'

export interface PlazosHistoricos {
  porPersona: Record<LadoPlazo, Map<number, number>>
  general: Record<LadoPlazo, number>
}

export interface PlazoEstimado {
  dias: number
  origen: 'historia' | 'general'
}

/** Se mira la historia de los últimos 24 meses. */
export const MESES_HISTORIA = 24
/** Casos mínimos de una persona para usar su propia mediana. */
export const MINIMO_CASOS = 3
/** Si no hay ninguna historia, se asume 30 días. */
export const PLAZO_POR_DEFECTO = 30

const dia = (s: string) => Date.parse(`${s}T12:00:00Z`) / 86_400_000

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2)
}

function haceMeses(fecha: string, meses: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d.toISOString().slice(0, 10)
}

export function calcularPlazos(comprobantes: FilaCsv[], aplicaciones: FilaCsv[], fechaDatos: string): PlazosHistoricos {
  const hoy = aFecha(fechaDatos) ?? fechaDatos.slice(0, 10)
  const desde = haceMeses(hoy, MESES_HISTORIA)

  const fechaPorId = new Map<number, string>()
  for (const f of comprobantes) {
    const id = aEntero(f.vientri_id)
    const fecha = aFecha(f.fecha)
    if (id !== null && fecha) fechaPorId.set(id, fecha)
  }

  // Último pago/cobro que canceló cada factura.
  const ultimoPago = new Map<number, string>()
  for (const a of aplicaciones) {
    if (aBool(a.baja)) continue
    const factura = aEntero(a.id_cmp_cancelado)
    const recibo = aEntero(a.id_cmp)
    if (factura === null || recibo === null) continue
    const fecha = fechaPorId.get(recibo)
    if (!fecha) continue
    const previa = ultimoPago.get(factura)
    if (!previa || fecha > previa) ultimoPago.set(factura, fecha)
  }

  const muestras: Record<LadoPlazo, Map<number, number[]>> = { pagar: new Map(), cobrar: new Map() }
  const todas: Record<LadoPlazo, number[]> = { pagar: [], cobrar: [] }
  for (const f of comprobantes) {
    if (aBool(f.baja)) continue
    const { lado, signo } = ladoPendiente(f.nom_tipo)
    if (lado === 'revisar' || signo !== 1) continue
    if (aCentavos(f.importe_pendiente) !== 0) continue
    const id = aEntero(f.vientri_id)
    const fecha = aFecha(f.fecha)
    if (id === null || !fecha || fecha < desde || fecha > hoy) continue
    const pago = ultimoPago.get(id)
    if (!pago) continue
    const dias = Math.max(0, Math.round(dia(pago) - dia(fecha)))
    todas[lado].push(dias)
    const personaId = aEntero(f.id_persona)
    if (personaId === null) continue
    const lista = muestras[lado].get(personaId) ?? []
    lista.push(dias)
    muestras[lado].set(personaId, lista)
  }

  const resultado: PlazosHistoricos = {
    porPersona: { pagar: new Map(), cobrar: new Map() },
    general: { pagar: PLAZO_POR_DEFECTO, cobrar: PLAZO_POR_DEFECTO },
  }
  for (const lado of ['pagar', 'cobrar'] as const) {
    if (todas[lado].length > 0) resultado.general[lado] = mediana(todas[lado])
    for (const [personaId, lista] of muestras[lado]) {
      if (lista.length >= MINIMO_CASOS) resultado.porPersona[lado].set(personaId, mediana(lista))
    }
  }
  return resultado
}

export function plazoPara(plazos: PlazosHistoricos, lado: LadoPlazo, personaId: number | null | undefined): PlazoEstimado {
  const propio = personaId == null ? undefined : plazos.porPersona[lado].get(personaId)
  return propio !== undefined ? { dias: propio, origen: 'historia' } : { dias: plazos.general[lado], origen: 'general' }
}
