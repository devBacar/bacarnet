/**
 * Comprobantes de Vientri con saldo pendiente → a pagar (proveedores) y a cobrar (clientes).
 * Verificado con la copia del 15/10/2026: el campo ABIERTO no indica deuda (lo usan remitos y
 * órdenes de pago); la deuda es IMPORTEPENDIENTE <> 0. El lado sale del tipo de comprobante
 * (NOMCMP), porque muchas personas son cliente y proveedor a la vez.
 * Las notas de crédito restan. Tipos no listados quedan "revisar".
 */
import type { FilaCsv } from './csv.js'
import { refPersona } from './personas.js'
import type { LadoPendiente, VientriPendienteDoc, VientriPersonaDoc } from './tipos.js'
import { aBool, aCentavos, aEntero, aFecha, aTexto, fechaImposible } from './valores.js'

export const COLUMNAS_COMPROBANTES = [
  'vientri_id', 'id_tipo', 'nom_tipo', 'id_persona', 'fecha', 'fecha_vto', 'total', 'importe_pendiente', 'abierto', 'baja',
] as const

export function textoComprobante(f: FilaCsv): string {
  const tipo = (f.nom_tipo ?? '').trim()
  const letra = (f.letra ?? '').trim()
  const pv = aEntero(f.punto_venta)
  const nro = aEntero(f.numero)
  const numero = pv !== null && pv > 0 && nro !== null
    ? `${String(pv).padStart(4, '0')}-${String(nro).padStart(8, '0')}`
    : (nro !== null ? String(nro) : (f.numero ?? '').trim())
  const letraStr = letra && letra !== 'X' ? letra : ''
  return [tipo, letraStr, numero].filter(Boolean).join(' ')
}

export function indiceComprobantes(filas: FilaCsv[]): Map<number, string> {
  const mapa = new Map<number, string>()
  for (const f of filas) {
    const id = aEntero(f.vientri_id)
    if (id !== null) {
      const txt = textoComprobante(f)
      if (txt) mapa.set(id, txt)
    }
  }
  return mapa
}

/** Tipo de comprobante de Vientri → lado y signo. Inferido de los datos; a confirmar con Administración. */
export const TIPOS_PENDIENTE: Record<string, { lado: LadoPendiente; signo: 1 | -1; nombre: string }> = {
  FAA: { lado: 'cobrar', signo: 1, nombre: 'Factura A' },
  FAB: { lado: 'cobrar', signo: 1, nombre: 'Factura B' },
  CFA: { lado: 'cobrar', signo: 1, nombre: 'Factura de crédito A' },
  NDA: { lado: 'cobrar', signo: 1, nombre: 'Nota de débito A' },
  NDB: { lado: 'cobrar', signo: 1, nombre: 'Nota de débito B' },
  NDX: { lado: 'cobrar', signo: 1, nombre: 'Nota de débito' },
  NCA: { lado: 'cobrar', signo: -1, nombre: 'Nota de crédito A' },
  NCB: { lado: 'cobrar', signo: -1, nombre: 'Nota de crédito B' },
  NCX: { lado: 'cobrar', signo: -1, nombre: 'Nota de crédito' },
  FCG: { lado: 'pagar', signo: 1, nombre: 'Factura de proveedor' },
  IMP: { lado: 'pagar', signo: 1, nombre: 'Impuesto' },
  NDP: { lado: 'pagar', signo: 1, nombre: 'Nota de débito de proveedor' },
  NCG: { lado: 'pagar', signo: -1, nombre: 'Nota de crédito de proveedor' },
}

export function ladoPendiente(nomTipo: string | null | undefined): { lado: LadoPendiente; signo: 1 | -1; nombre: string | null } {
  const t = TIPOS_PENDIENTE[(nomTipo ?? '').trim().toUpperCase()]
  return t ?? { lado: 'revisar', signo: 1, nombre: null }
}

export function armarPendientes(
  filas: FilaCsv[],
  personas: Map<number, VientriPersonaDoc>,
  monedas: Map<number, string>,
): VientriPendienteDoc[] {
  const salida: VientriPendienteDoc[] = []
  for (const f of filas) {
    if (aBool(f.baja)) continue
    const bruto = aCentavos(f.importe_pendiente) ?? 0
    if (bruto === 0) continue
    const id = aEntero(f.vientri_id)
    if (id === null) continue
    const personaId = aEntero(f.id_persona)
    const fechaVencimiento = aFecha(f.fecha_vto)
    const revisar: string[] = []
    const { lado, signo, nombre } = ladoPendiente(f.nom_tipo)
    const pendiente = signo * Math.abs(bruto)
    if (lado === 'revisar') revisar.push(`Tipo ${aTexto(f.nom_tipo) ?? '?'} con saldo: no se sabe si es a pagar o a cobrar`)
    if (fechaImposible(fechaVencimiento)) revisar.push(`Fecha de vencimiento imposible (${fechaVencimiento})`)
    const divisaId = aEntero(f.id_divisa)
    const cot = Number((f.cotizacion ?? '').trim())
    salida.push({
      clave: `cmp-${id}`,
      vientriId: id,
      lado,
      tipoId: aEntero(f.id_tipo),
      tipo: nombre ?? aTexto(f.nom_tipo),
      comprobante: textoComprobante(f),
      persona: refPersona(personas, personaId),
      fecha: aFecha(f.fecha),
      fechaVencimiento,
      totalCentavos: signo * Math.abs(aCentavos(f.total) ?? 0),
      pendienteCentavos: pendiente,
      divisaId,
      moneda: divisaId !== null ? monedas.get(divisaId) ?? null : null,
      cotizacion: Number.isFinite(cot) && cot > 0 ? cot : null,
      fechaProntoPago: aFecha(f.fecha_pronto_pago),
      descuentoProntoPago: aCentavos(f.dto_pronto_pago) !== null ? (aCentavos(f.dto_pronto_pago) as number) / 100 : null,
      cuotas: aEntero(f.cuotas),
      prestamo: aEntero(f.id_linea_prestamo) !== null && aEntero(f.id_linea_prestamo) !== 0,
      revisar,
      fecsys: aTexto(f.fecsys),
    })
  }
  return salida
}
