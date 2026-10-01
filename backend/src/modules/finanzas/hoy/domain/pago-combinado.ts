import { formatoPesos } from './hoy.fechas.js'

export type ChequePropioCombinado = {
  tipo: 'echeq' | 'fisico'
  numero: string
  banco: string
  fechaPago: string
}

export type PartePagoCombinado =
  | { medio: 'efectivo'; cajaId: string; montoCentavos: number }
  | { medio: 'cheque_cartera'; chequeId: string }
  | { medio: 'cheque_propio'; montoCentavos: number; cheque: ChequePropioCombinado }

export interface ParteValidada {
  medio: PartePagoCombinado['medio']
  montoARegistrar: number
  excedenteCentavos: number
  cajaId?: string
  chequeId?: string
  cheque?: ChequePropioCombinado
  montoCentavos?: number
}

export interface CajaParaPago {
  id: string
  nombre: string
  moneda: string
  saldoActualCentavos: number
  bloqueadaPorCierre: boolean
  activa: boolean
}

export interface ChequeParaPago {
  id: string
  numero: string
  montoCentavos: number
  enCartera: boolean
}

/** Lo que se anota del cheque: su monto, o lo que falta si el cheque es más grande. */
export function montoQueRegistraChequeCartera(chequeCentavos: number, faltaCentavos: number): number {
  if (!Number.isInteger(chequeCentavos) || chequeCentavos <= 0) {
    throw new Error('Ese cheque no tiene un monto para usar')
  }
  if (faltaCentavos <= 0) throw new Error('Ese pago ya está hecho')
  return Math.min(chequeCentavos, faltaCentavos)
}

function montoEntero(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null
  return value
}

export function leerPartesPagoCombinado(raw: unknown): PartePagoCombinado[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Agregá al menos una forma de pago')
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`La forma ${index + 1} no se entiende`)
    const row = item as Record<string, unknown>
    const medio = row.medio
    if (medio === 'efectivo') {
      const cajaId = typeof row.cajaId === 'string' ? row.cajaId.trim() : ''
      const montoCentavos = montoEntero(row.montoCentavos)
      if (!cajaId) throw new Error('Elegí la caja')
      if (montoCentavos == null) throw new Error('Indicá un monto mayor a cero')
      return { medio: 'efectivo', cajaId, montoCentavos }
    }
    if (medio === 'cheque_cartera') {
      const chequeId = typeof row.chequeId === 'string' ? row.chequeId.trim() : ''
      if (!chequeId) throw new Error('Elegí el cheque')
      return { medio: 'cheque_cartera', chequeId }
    }
    if (medio === 'cheque_propio') {
      const montoCentavos = montoEntero(row.montoCentavos)
      const chequeRaw = row.cheque
      if (!chequeRaw || typeof chequeRaw !== 'object') throw new Error('Faltan los datos del cheque propio')
      const cheque = chequeRaw as Record<string, unknown>
      const tipo = cheque.tipo === 'echeq' || cheque.tipo === 'fisico' ? cheque.tipo : null
      const numero = typeof cheque.numero === 'string' ? cheque.numero.trim() : ''
      const banco = typeof cheque.banco === 'string' ? cheque.banco.trim() : ''
      const fechaPago = typeof cheque.fechaPago === 'string' ? cheque.fechaPago.trim() : ''
      if (!tipo) throw new Error('Elegí si el cheque es electrónico o de papel')
      if (!numero) throw new Error('Falta el número del cheque')
      if (!banco) throw new Error('Elegí de qué banco sale el cheque')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) throw new Error('Elegí la fecha de pago del cheque')
      if (montoCentavos == null) throw new Error('Indicá un monto mayor a cero')
      return { medio: 'cheque_propio', montoCentavos, cheque: { tipo, numero, banco, fechaPago } }
    }
    throw new Error('Esa forma de pago no está disponible')
  })
}

/**
 * Revisa todo antes de anotar nada.
 * Se puede pasar de lo que falta solo con el vuelto de un cheque de la cartera.
 */
export function validarPagoCombinado(input: {
  estado: string
  faltaCentavos: number
  partes: PartePagoCombinado[]
  cajas: readonly CajaParaPago[]
  cheques: readonly ChequeParaPago[]
}): { ok: true; partes: ParteValidada[] } | { ok: false; error: string } {
  if (input.estado === 'pagado') return { ok: false, error: 'Ese pago ya está hecho' }
  if (input.estado === 'confeccionada_pendiente_autorizacion') {
    return { ok: false, error: 'Esta transferencia ya está armada. No la pagues también por otro lado.' }
  }
  if (input.faltaCentavos <= 0) return { ok: false, error: 'Ese pago ya está cubierto' }
  if (input.partes.length === 0) return { ok: false, error: 'Agregá al menos una forma de pago' }

  let queda = input.faltaCentavos
  const usadoPorCaja = new Map<string, number>()
  const chequesUsados = new Set<string>()
  const numerosPropios = new Set<string>()
  const partes: ParteValidada[] = []

  for (const parte of input.partes) {
    if (parte.medio === 'efectivo' || parte.medio === 'cheque_propio') {
      if (parte.montoCentavos > queda) {
        return { ok: false, error: 'Estás asignando más de lo que falta pagar' }
      }
    }
    if (parte.medio === 'efectivo') {
      const caja = input.cajas.find((item) => item.id === parte.cajaId)
      if (!caja || !caja.activa) return { ok: false, error: 'No tenés esa caja o no está activa' }
      if (caja.moneda !== 'ARS') return { ok: false, error: 'Elegí una caja en pesos' }
      if (caja.bloqueadaPorCierre) {
        return { ok: false, error: 'Esa caja está cerrada esperando aprobación. Elegí otra.' }
      }
      const usado = (usadoPorCaja.get(caja.id) ?? 0) + parte.montoCentavos
      if (usado > caja.saldoActualCentavos) {
        return {
          ok: false,
          error: `En ${caja.nombre} hay ${formatoPesos(caja.saldoActualCentavos)} y no alcanza.`,
        }
      }
      usadoPorCaja.set(caja.id, usado)
      queda -= parte.montoCentavos
      partes.push({
        medio: 'efectivo',
        montoARegistrar: parte.montoCentavos,
        excedenteCentavos: 0,
        cajaId: caja.id,
        montoCentavos: parte.montoCentavos,
      })
      continue
    }
    if (parte.medio === 'cheque_propio') {
      const clave = parte.cheque.numero.toLocaleLowerCase('es')
      if (numerosPropios.has(clave)) return { ok: false, error: 'Ese número de cheque está repetido' }
      numerosPropios.add(clave)
      queda -= parte.montoCentavos
      partes.push({
        medio: 'cheque_propio',
        montoARegistrar: parte.montoCentavos,
        excedenteCentavos: 0,
        montoCentavos: parte.montoCentavos,
        cheque: parte.cheque,
      })
      continue
    }
    if (chequesUsados.has(parte.chequeId)) return { ok: false, error: 'Ese cheque está repetido' }
    chequesUsados.add(parte.chequeId)
    const cheque = input.cheques.find((item) => item.id === parte.chequeId)
    if (!cheque || !cheque.enCartera) {
      return { ok: false, error: 'Ese cheque no está en la cartera. Elegí otro.' }
    }
    if (queda <= 0) return { ok: false, error: 'Ese cheque no entra: ya no falta nada por pagar' }
    const montoARegistrar = Math.min(cheque.montoCentavos, queda)
    const excedenteCentavos = Math.max(0, cheque.montoCentavos - queda)
    queda -= montoARegistrar
    partes.push({
      medio: 'cheque_cartera',
      montoARegistrar,
      excedenteCentavos,
      chequeId: cheque.id,
    })
  }

  return { ok: true, partes }
}
