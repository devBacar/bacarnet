import type { FilaCsv } from './csv.js'
import type { PersonaRef, VientriPersonaDoc } from './tipos.js'
import { aBool, aCentavos, aCuit, aEntero, aFecha, aTexto } from './valores.js'

export const COLUMNAS_PERSONAS = ['vientri_id', 'nombre', 'cuit', 'es_cliente', 'es_proveedor', 'baja'] as const

export function mapearPersona(f: FilaCsv): VientriPersonaDoc | null {
  const id = aEntero(f.vientri_id)
  if (id === null) return null
  const cbu = (f.pro_cbu ?? '').replace(/\D/g, '')
  return {
    vientriId: id,
    nombre: aTexto(f.nombre),
    nombreFantasia: aTexto(f.nombre_fantasia),
    cuit: aCuit(f.cuit),
    esCliente: aBool(f.es_cliente),
    esProveedor: aBool(f.es_proveedor),
    inactivo: aBool(f.inactivo),
    incobrable: aBool(f.incobrable),
    limiteCreditoCentavos: aCentavos(f.cli_limite_credito),
    plazoPagoClienteDias: aEntero(f.cli_plazo_pago_dias),
    ultimoPagoCliente: aFecha(f.cli_ultimo_pago),
    plazoPagoProveedorDias: aEntero(f.pro_plazo_pago_dias),
    cbu: cbu.length === 22 ? cbu : null,
    baja: aBool(f.baja),
  }
}

export function indicePersonas(personas: VientriPersonaDoc[]): Map<number, VientriPersonaDoc> {
  return new Map(personas.map((p) => [p.vientriId, p]))
}

export function refPersona(personas: Map<number, VientriPersonaDoc>, id: number | null): PersonaRef | null {
  if (id === null || id === 0) return null
  const p = personas.get(id)
  return { vientriId: id, nombre: p?.nombre ?? null, cuit: p?.cuit ?? null }
}
