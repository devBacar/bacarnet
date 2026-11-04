import { movimientosBancariosCollection } from '../../movimientos/services/movimientos.repository.js'
import type { MovimientoBancarioDocument } from '../../movimientos/domain/movimiento-bancario.types.js'
import {
  claseMovimientoCheque,
  chequesCandidatos,
  type ChequeParaContraparte,
  type MovimientoCheque,
} from '../../contraparte/domain/fuente-cheque.js'
import {
  debitarChequesPendientesConMovimiento,
  listChequesSinVincular,
  listChequesVinculados,
  vincularChequeConMovimiento,
} from './cheques.repository.js'
import { agruparGemelos, sonGemelos } from '../domain/gemelos-cheque.js'
import {
  esIdOcasional,
  listOcasionalesSinVincular,
  listOcasionalesVinculados,
  vincularOcasionalConMovimiento,
} from './ocasionales-vinculo.repository.js'

export interface ReconciliacionChequesResultado {
  revisados: number
  vinculados: number
  sinCandidato: number
  multiples: number
  diagnostico?: DiagnosticoItem[]
}

export interface DiagnosticoItem {
  movId: string
  descripcion: string
  montoCentavos: number
  fechaProceso: string
  voucherNumber: number | null
  correlativeNumber: number | null
  clase: 'emitido' | 'recibido'
  candidatos: number
  razon: 'vinculado' | 'sin_candidato' | 'multiples' | 'ocupado'
}

export async function reconciliarChequesConMovimientos(
  options?: { detalle?: boolean },
): Promise<ReconciliacionChequesResultado> {
  const detalle = options?.detalle ?? false
  const resultado: ReconciliacionChequesResultado = {
    revisados: 0,
    vinculados: 0,
    sinCandidato: 0,
    multiples: 0,
  }
  const diagnostico: DiagnosticoItem[] = []

  await debitarChequesPendientesConMovimiento()

  const [recibidosSinVincular, emitidosSinVincularCheques, ocasionalesSinVincular] = await Promise.all([
    listChequesSinVincular('recibido'),
    listChequesSinVincular('emitido'),
    listOcasionalesSinVincular(),
  ])
  const emitidosSinVincular = [...emitidosSinVincularCheques, ...ocasionalesSinVincular]

  const [recibidosVinculados, emitidosVinculadosCheques, ocasionalesVinculados] = await Promise.all([
    listChequesVinculados('recibido'),
    listChequesVinculados('emitido'),
    listOcasionalesVinculados(),
  ])
  const emitidosVinculados = [...emitidosVinculadosCheques, ...ocasionalesVinculados]

  // Un físico y su eCheq son el mismo cheque: si uno ya tiene movimiento, el gemelo hereda el vínculo.
  const heredados = new Set<string>()
  for (const [direccion, sinVincular, vinculados] of [
    ['recibido', recibidosSinVincular, recibidosVinculados],
    ['emitido', emitidosSinVincular, emitidosVinculados],
  ] as const) {
    for (const cheque of sinVincular) {
      const gemelo = vinculados.find((v) => sonGemelos(cheque, v))
      if (!gemelo) continue
      await vincularCualquiera(cheque.id, {
        movimientoBancarioId: gemelo.movimientoBancarioId,
        movimientoCuentaId: gemelo.movimientoCuentaId,
        movimientoFecha: gemelo.movimientoFecha,
        fechaAcreditacion: direccion === 'recibido' ? gemelo.movimientoFecha : null,
      })
      heredados.add(cheque.id)
      resultado.vinculados += 1
    }
  }

  const cheques: ChequeParaContraparte[] = [
    ...recibidosSinVincular.filter((c) => !heredados.has(c.id)).map((c) => ({
      id: c.id,
      numero: c.numero,
      direccion: 'recibido' as const,
      montoCentavos: c.montoCentavos,
      fechaEmision: c.fechaEmision,
      fechaPago: c.fechaPago,
      emisor: c.emisor,
      cliente: c.cliente,
      destinatario: c.destinatario,
      estado: c.estado,
    })),
    ...emitidosSinVincular.filter((c) => !heredados.has(c.id)).map((c) => ({
      id: c.id,
      numero: c.numero,
      direccion: 'emitido' as const,
      montoCentavos: c.montoCentavos,
      fechaEmision: c.fechaEmision,
      fechaPago: c.fechaPago,
      emisor: c.emisor,
      cliente: c.cliente,
      destinatario: c.destinatario,
      estado: c.estado,
    })),
  ]

  if (cheques.length === 0) return resultado

  const fechasPago = cheques.map((c) => c.fechaPago).filter(Boolean)
  if (fechasPago.length === 0) return resultado

  fechasPago.sort()
  const desde = fechasPago[0]
  const hasta = fechasPago[fechasPago.length - 1]

  const movSnap = await movimientosBancariosCollection()
    .where('fechaProceso', '>=', sumarDias(desde, -10))
    .where('fechaProceso', '<=', sumarDias(hasta, 35))
    .get()

  const movimientos: { id: string; data: MovimientoBancarioDocument }[] = []
  for (const doc of movSnap.docs) {
    const data = doc.data() as MovimientoBancarioDocument
    if (data.reservadoPorTransferenciaId) continue
    if (data.reservadoPorChequeId) continue
    movimientos.push({ id: doc.id, data })
  }

  const ocupados = new Set<string>()
  const movsVinculados = new Set<string>()

  const grupos = agruparGemelos(cheques)
  const grupoPorRepresentante = new Map(grupos.map((g) => [g[0].id, g]))
  const representantes = grupos.map((g) => g[0])

  async function vincularGrupo(
    rep: ChequeParaContraparte,
    mov: { id: string; data: MovimientoBancarioDocument },
  ): Promise<void> {
    const miembros = grupoPorRepresentante.get(rep.id) ?? [rep]
    for (const cheque of miembros) {
      await vincularCualquiera(cheque.id, {
        movimientoBancarioId: mov.id,
        movimientoCuentaId: mov.data.cuentaId,
        movimientoFecha: mov.data.fechaProceso,
        fechaAcreditacion: cheque.direccion === 'recibido' ? mov.data.fechaProceso : null,
      })
      ocupados.add(cheque.id)
    }
    // La reserva apunta a un cheque de `cheques` si el grupo tiene uno; solo apunta a un ocasional si no hay otro.
    const idReserva = miembros.find((c) => !esIdOcasional(c.id))?.id ?? rep.id
    await movimientosBancariosCollection().doc(mov.id).update({
      reservadoPorChequeId: idReserva,
    })
    movsVinculados.add(mov.id)
    resultado.vinculados += 1
  }

  const movimientosCheque: {
    id: string
    data: MovimientoBancarioDocument
    clase: 'emitido' | 'recibido'
    movParaMatch: MovimientoCheque
  }[] = []

  for (const mov of movimientos) {
    const clase = claseMovimientoCheque({
      tipo: mov.data.tipo,
      descripcion: mov.data.descripcion,
      codeDescriptionIb: mov.data.codeDescriptionIb,
      categoriaNombre: null,
    })
    if (!clase) continue

    movimientosCheque.push({
      id: mov.id,
      data: mov.data,
      clase,
      movParaMatch: {
        tipo: mov.data.tipo,
        montoCentavos: mov.data.montoCentavos,
        fechaProceso: mov.data.fechaProceso,
        descripcion: mov.data.descripcion,
        codeDescriptionIb: mov.data.codeDescriptionIb,
        voucherNumber: mov.data.voucherNumber != null ? String(mov.data.voucherNumber) : null,
        correlativeNumber: mov.data.correlativeNumber != null ? String(mov.data.correlativeNumber) : null,
        categoriaNombre: mov.data.categoriaId ?? null,
      },
    })
  }

  resultado.revisados = movimientosCheque.length

  // Pasada 1: matchear primero por número (voucher / correlative) y descartar esos cheques
  for (const mov of movimientosCheque) {
    const disponibles = representantes.filter((c) => !ocupados.has(c.id))
    const candidatos = chequesCandidatos(mov.movParaMatch, disponibles, { soloNumero: true })
    if (candidatos.length !== 1) continue

    await vincularGrupo(candidatos[0], mov)
  }

  // Pasada 2: con los movimientos y cheques que quedaron sin matchear, buscar en los disponibles
  for (const mov of movimientosCheque) {
    if (movsVinculados.has(mov.id)) continue

    const disponibles = representantes.filter((c) => !ocupados.has(c.id))
    const candidatos = chequesCandidatos(mov.movParaMatch, disponibles)

    if (candidatos.length === 0) {
      resultado.sinCandidato += 1
      if (detalle) {
        diagnostico.push({
          movId: mov.id,
          descripcion: mov.data.descripcion,
          montoCentavos: mov.data.montoCentavos,
          fechaProceso: mov.data.fechaProceso,
          voucherNumber: mov.data.voucherNumber ?? null,
          correlativeNumber: mov.data.correlativeNumber ?? null,
          clase: mov.clase,
          candidatos: 0,
          razon: 'sin_candidato',
        })
      }
      continue
    }

    if (candidatos.length > 1) {
      resultado.multiples += 1
      if (detalle) {
        diagnostico.push({
          movId: mov.id,
          descripcion: mov.data.descripcion,
          montoCentavos: mov.data.montoCentavos,
          fechaProceso: mov.data.fechaProceso,
          voucherNumber: mov.data.voucherNumber ?? null,
          correlativeNumber: mov.data.correlativeNumber ?? null,
          clase: mov.clase,
          candidatos: candidatos.length,
          razon: 'multiples',
        })
      }
      continue
    }

    await vincularGrupo(candidatos[0], mov)
  }

  if (detalle) {
    resultado.diagnostico = diagnostico
  }

  return resultado
}

async function vincularCualquiera(
  id: string,
  datos: {
    movimientoBancarioId: string
    movimientoCuentaId: string
    movimientoFecha: string
    fechaAcreditacion: string | null
  },
): Promise<void> {
  if (esIdOcasional(id)) {
    await vincularOcasionalConMovimiento({ id, ...datos })
    return
  }
  await vincularChequeConMovimiento({ chequeId: id, ...datos })
}

function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + dias))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}
