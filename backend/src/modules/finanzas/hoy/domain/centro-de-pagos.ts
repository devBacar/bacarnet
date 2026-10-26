import { chequeEmitidoVigente } from './cheques-hoy.js'
import type {
  CentroDePagosFilaHoy,
  CentroDePagosHoy,
  ChequeEnHoy,
  CompromisoHoy,
  MedioPagoHoy,
} from './hoy.tipos.js'

export type { CentroDePagosFilaHoy, CentroDePagosHoy }

export const AVISO_CHEQUE_EMITIDO = 'Ya tiene cheque emitido, solo falta debitarlo'

function compromisoAbierto(estado: CompromisoHoy['estado']): boolean {
  return estado === 'pendiente' || estado === 'vencido'
}

function tienePagoDe(cheque: ChequeEnHoy): boolean {
  const id = cheque.pagoDe?.compromisoId?.trim()
  return Boolean(id)
}

/**
 * Una sola lista de lo que hay que pagar: compromisos abiertos (cualquier medio)
 * hasta el fin del horizonte, más cheques emitidos sin vínculo a Agenda.
 * Orden: lo más atrasado primero; sin fecha al final.
 */
export function armarCentroDePagos(input: {
  hoy: string
  /** Último día a incluir hacia adelante (ej. fin de la semana hábil). */
  hasta: string
  compromisos: readonly CompromisoHoy[]
  cheques: readonly ChequeEnHoy[]
}): CentroDePagosHoy {
  const chequesPorId = new Map(input.cheques.map((cheque) => [cheque.id, cheque]))
  const chequeIdsDeCompromisos = new Set<string>()
  const filas: CentroDePagosFilaHoy[] = []

  for (const row of input.compromisos) {
    if (!compromisoAbierto(row.estado) || row.montoCentavos <= 0) continue
    const sinFecha = row.sinFecha === true
    if (!sinFecha && row.fechaVencimiento > input.hasta) continue

    const chequeId = row.chequeId?.trim() || null
    if (chequeId) chequeIdsDeCompromisos.add(chequeId)
    const cheque = chequeId ? chequesPorId.get(chequeId) : undefined
    const chequeEmitido = Boolean(chequeId)
    const chequeNumero = cheque?.numero?.trim() || null
    const estaAtrasado = !sinFecha && row.fechaVencimiento < input.hoy
    const medioPago: MedioPagoHoy = chequeEmitido ? 'cheque' : row.medioPago
    const aviso = estaAtrasado && chequeEmitido ? AVISO_CHEQUE_EMITIDO : null

    filas.push({
      id: row.id,
      aQuien: row.proveedorONombre,
      concepto: row.concepto,
      montoCentavos: row.montoCentavos,
      fechaVencimiento: sinFecha ? null : row.fechaVencimiento,
      medioPago,
      estaAtrasado,
      aviso,
      chequeEmitido,
      chequeNumero,
    })
  }

  for (const cheque of input.cheques) {
    if (!chequeEmitidoVigente(cheque)) continue
    if (tienePagoDe(cheque)) continue
    if (chequeIdsDeCompromisos.has(cheque.id)) continue
    if (cheque.fechaPago > input.hasta) continue

    const estaAtrasado = cheque.fechaPago < input.hoy
    filas.push({
      id: `cheque:${cheque.id}`,
      aQuien: cheque.destinatario?.trim() || 'Sin destinatario',
      concepto: cheque.numero.trim() ? `Cheque N.º ${cheque.numero.trim()}` : 'Cheque emitido',
      montoCentavos: cheque.montoCentavos,
      fechaVencimiento: cheque.fechaPago,
      medioPago: 'cheque',
      estaAtrasado,
      aviso: estaAtrasado ? AVISO_CHEQUE_EMITIDO : null,
      chequeEmitido: true,
      chequeNumero: cheque.numero.trim() || null,
    })
  }

  filas.sort((a, b) => {
    const fechaA = a.fechaVencimiento ?? '9999-99-99'
    const fechaB = b.fechaVencimiento ?? '9999-99-99'
    if (fechaA !== fechaB) return fechaA.localeCompare(fechaB)
    return a.aQuien.localeCompare(b.aQuien, 'es')
  })

  return {
    filas,
    totalCentavos: filas.reduce((total, fila) => total + fila.montoCentavos, 0),
  }
}
