import { movimientosBancariosCollection } from '../../movimientos/services/movimientos.repository.js'
import type { MovimientoBancarioDocument } from '../../movimientos/domain/movimiento-bancario.types.js'
import {
  claseMovimientoCheque,
  chequesCandidatos,
  type ChequeParaContraparte,
  type MovimientoCheque,
} from '../../contraparte/domain/fuente-cheque.js'
import {
  listChequesSinVincular,
  vincularChequeConMovimiento,
} from './cheques.repository.js'

export interface ReconciliacionChequesResultado {
  revisados: number
  vinculados: number
  sinCandidato: number
  multiples: number
}

export async function reconciliarChequesConMovimientos(): Promise<ReconciliacionChequesResultado> {
  const resultado: ReconciliacionChequesResultado = {
    revisados: 0,
    vinculados: 0,
    sinCandidato: 0,
    multiples: 0,
  }

  const [recibidosSinVincular, emitidosSinVincular] = await Promise.all([
    listChequesSinVincular('recibido'),
    listChequesSinVincular('emitido'),
  ])

  const cheques: ChequeParaContraparte[] = [
    ...recibidosSinVincular.map((c) => ({
      id: c.id,
      numero: c.numero,
      direccion: 'recibido' as const,
      montoCentavos: c.montoCentavos,
      fechaPago: c.fechaPago,
      emisor: c.emisor,
      cliente: c.cliente,
      destinatario: c.destinatario,
    })),
    ...emitidosSinVincular.map((c) => ({
      id: c.id,
      numero: c.numero,
      direccion: 'emitido' as const,
      montoCentavos: c.montoCentavos,
      fechaPago: c.fechaPago,
      emisor: c.emisor,
      cliente: c.cliente,
      destinatario: c.destinatario,
    })),
  ]

  if (cheques.length === 0) return resultado

  const fechasPago = cheques.map((c) => c.fechaPago).filter(Boolean)
  if (fechasPago.length === 0) return resultado

  fechasPago.sort()
  const desde = fechasPago[0]
  const hasta = fechasPago[fechasPago.length - 1]

  const movSnap = await movimientosBancariosCollection()
    .where('fechaProceso', '>=', sumarDias(desde, -5))
    .where('fechaProceso', '<=', sumarDias(hasta, 5))
    .get()

  const movimientos: { id: string; data: MovimientoBancarioDocument }[] = []
  for (const doc of movSnap.docs) {
    const data = doc.data() as MovimientoBancarioDocument
    if (data.reservadoPorTransferenciaId) continue
    if (data.reservadoPorChequeId) continue
    movimientos.push({ id: doc.id, data })
  }

  const ocupados = new Set<string>()

  for (const mov of movimientos) {
    const clase = claseMovimientoCheque({
      tipo: mov.data.tipo,
      descripcion: mov.data.descripcion,
      codeDescriptionIb: mov.data.codeDescriptionIb,
      categoriaNombre: null,
    })
    if (!clase) continue

    resultado.revisados += 1

    const movParaMatch: MovimientoCheque = {
      tipo: mov.data.tipo,
      montoCentavos: mov.data.montoCentavos,
      fechaProceso: mov.data.fechaProceso,
      descripcion: mov.data.descripcion,
      codeDescriptionIb: mov.data.codeDescriptionIb,
      voucherNumber: mov.data.voucherNumber != null ? String(mov.data.voucherNumber) : null,
      categoriaNombre: mov.data.categoriaId ?? null,
    }

    const candidatos = chequesCandidatos(movParaMatch, cheques)

    if (candidatos.length === 0) {
      resultado.sinCandidato += 1
      continue
    }

    if (candidatos.length > 1) {
      resultado.multiples += 1
      continue
    }

    const cheque = candidatos[0]
    if (ocupados.has(cheque.id)) {
      resultado.multiples += 1
      continue
    }

    const fechaAcreditacion = cheque.direccion === 'recibido' ? mov.data.fechaProceso : null

    await vincularChequeConMovimiento({
      chequeId: cheque.id,
      movimientoBancarioId: mov.id,
      movimientoCuentaId: mov.data.cuentaId,
      movimientoFecha: mov.data.fechaProceso,
      fechaAcreditacion,
    })

    await movimientosBancariosCollection().doc(mov.id).update({
      reservadoPorChequeId: cheque.id,
    })

    ocupados.add(cheque.id)
    resultado.vinculados += 1
  }

  return resultado
}

function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + dias))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}
