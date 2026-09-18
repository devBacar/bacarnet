import { randomUUID } from 'node:crypto'

import type {

  ChequeActionEmitido,

  ChequeActionRecibido,

  ChequeDocument,

  ChequeEstado,

  ChequeTipo,

} from '../domain/cheque.types.js'

import {

  CHEQUE_ESTADO_LABEL,

  normalizeChequeDireccion,

} from '../domain/cheque.types.js'

import { ChequeTransitionError, resolveEstadoAfterAction } from '../domain/cheque.transitions.js'

import {

  getCobroResumen,

  getCompromisoResumen,

  linkChequeToCobro,

  linkChequeToCompromiso,

} from './agenda.repository.js'

import {

  appendHistorialAndUpdateCheque,

  createChequeWithHistorial,

  getChequeDocument,

  listChequeDocuments,

  listHistorial,

  parseDateInput,

  timestampFromDate,

  type ListChequesFilters,

} from './cheques.repository.js'

import { TIPO_CUENTA_LABEL } from '../../domain/cuenta.types.js'
import { listCuentaDocuments } from '../../services/cuentas.repository.js'



function timestampToIso(value: unknown): string | null {

  if (!value || typeof value !== 'object') return null

  const maybe = value as { toDate?: () => Date }

  if (typeof maybe.toDate !== 'function') return null

  return maybe.toDate().toISOString()

}



function normalizeChequeDoc(data: ChequeDocument): ChequeDocument {

  const direccion = normalizeChequeDireccion(data.direccion)

  return {

    ...data,

    direccion,

    libradorNombre: data.libradorNombre ?? null,

    libradorCuit: data.libradorCuit ?? null,

    beneficiarioNombre: data.beneficiarioNombre ?? null,

    beneficiarioCuit: data.beneficiarioCuit ?? null,

    cuentaId: data.cuentaId ?? null,

  }

}



async function getCuentaResumen(cuentaId: string | null) {

  if (!cuentaId) return null

  const rows = await listCuentaDocuments()

  const row = rows.find((r) => r.id === cuentaId)

  if (!row) return null

  return {

    id: row.id,

    bancoNombre: row.data.bancoNombre,

    tipo: row.data.tipo,

    tipoLabel: TIPO_CUENTA_LABEL[row.data.tipo],

  }

}



export function serializeCheque(id: string, raw: ChequeDocument) {

  const data = normalizeChequeDoc(raw)

  return {

    id,

    direccion: data.direccion,

    numero: data.numero,

    bancoEmisor: data.bancoEmisor,

    libradorNombre: data.libradorNombre ?? '',

    libradorCuit: data.libradorCuit ?? '',

    beneficiarioNombre: data.beneficiarioNombre ?? '',

    beneficiarioCuit: data.beneficiarioCuit ?? '',

    cuentaId: data.cuentaId,

    montoCentavos: data.montoCentavos,

    fechaEmision: timestampToIso(data.fechaEmision),

    fechaPago: timestampToIso(data.fechaPago),

    tipo: data.tipo,

    estadoActual: data.estadoActual,

    estadoLabel: CHEQUE_ESTADO_LABEL[data.estadoActual],

    compromisoPagoId: data.compromisoPagoId,

    cobroOrigenId: data.cobroOrigenId,

    endosadoA: data.endosadoA,

    vendidoA: data.vendidoA,

    vendidoConResponsabilidad: data.vendidoConResponsabilidad,

    motivoRechazo: data.motivoRechazo,

    createdAt: timestampToIso(data.createdAt),

    updatedAt: timestampToIso(data.updatedAt),

    createdBy: data.createdBy,

  }

}



export async function listCheques(filters: ListChequesFilters) {

  const rows = await listChequeDocuments(filters)

  const enriched = await Promise.all(

    rows.map(async ({ id, data }) => {

      const base = serializeCheque(id, data)

      const [compromiso, cobro, cuenta] = await Promise.all([

        data.compromisoPagoId ? getCompromisoResumen(data.compromisoPagoId) : null,

        data.cobroOrigenId ? getCobroResumen(data.cobroOrigenId) : null,

        getCuentaResumen(data.cuentaId),

      ])

      return {

        ...base,

        compromisoResumen: compromiso,

        cobroResumen: cobro,

        cuentaResumen: cuenta,

      }

    }),

  )

  return enriched

}



async function enrichChequeDetail(chequeId: string, data: ChequeDocument) {

  const base = serializeCheque(chequeId, data)

  const [compromiso, cobro, cuenta, historial] = await Promise.all([

    data.compromisoPagoId ? getCompromisoResumen(data.compromisoPagoId) : null,

    data.cobroOrigenId ? getCobroResumen(data.cobroOrigenId) : null,

    getCuentaResumen(data.cuentaId),

    listHistorial(chequeId),

  ])

  return {

    ...base,

    compromisoResumen: compromiso,

    cobroResumen: cobro,

    cuentaResumen: cuenta,

    historial: historial.map(({ id, data: h }) => ({

      id,

      estadoAnterior: h.estadoAnterior,

      estadoNuevo: h.estadoNuevo,

      estadoAnteriorLabel: h.estadoAnterior ? CHEQUE_ESTADO_LABEL[h.estadoAnterior] : null,

      estadoNuevoLabel: CHEQUE_ESTADO_LABEL[h.estadoNuevo],

      fecha: timestampToIso(h.fecha),

      usuario: h.usuario,

      nota: h.nota,

    })),

  }

}



export async function getChequeDetail(chequeId: string) {

  const data = await getChequeDocument(chequeId)

  if (!data) return null

  return enrichChequeDetail(chequeId, data)

}



export async function getChequeHistorial(chequeId: string) {

  const data = await getChequeDocument(chequeId)

  if (!data) return null

  const historial = await listHistorial(chequeId)

  return historial.map(({ id, data: h }) => ({

    id,

    estadoAnterior: h.estadoAnterior,

    estadoNuevo: h.estadoNuevo,

    estadoAnteriorLabel: h.estadoAnterior ? CHEQUE_ESTADO_LABEL[h.estadoAnterior] : null,

    estadoNuevoLabel: CHEQUE_ESTADO_LABEL[h.estadoNuevo],

    fecha: timestampToIso(h.fecha),

    usuario: h.usuario,

    nota: h.nota,

  }))

}



function assertPositiveCentavos(value: unknown, field: string): number {

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {

    throw new Error(`${field} debe ser un entero positivo (centavos)`)

  }

  return value

}



async function assertCuentaChequeraCc(cuentaId: string) {

  const rows = await listCuentaDocuments()

  const row = rows.find((r) => r.id === cuentaId)

  if (!row) throw new Error('Cuenta no encontrada')

  if (row.data.tipo !== 'CC') {

    throw new Error('Solo se pueden emitir cheques contra cuentas corrientes (CC)')

  }

  return row

}



export async function createCheque(input: { actorUid: string; body: Record<string, unknown> }) {

  const direccion = normalizeChequeDireccion(input.body.direccion)

  if (direccion === 'emitido') {

    return createChequeEmitido(input)

  }

  return createChequeRecibido(input)

}



export async function createChequeRecibido(input: {

  actorUid: string

  body: Record<string, unknown>

}) {

  const numero = typeof input.body.numero === 'string' ? input.body.numero.trim() : ''

  const bancoEmisor = typeof input.body.bancoEmisor === 'string' ? input.body.bancoEmisor.trim() : ''

  const libradorNombre =

    typeof input.body.libradorNombre === 'string' ? input.body.libradorNombre.trim() : ''

  const libradorCuit = typeof input.body.libradorCuit === 'string' ? input.body.libradorCuit.trim() : ''

  const montoCentavos = assertPositiveCentavos(input.body.montoCentavos, 'montoCentavos')

  const fechaEmision = parseDateInput(input.body.fechaEmision)

  const fechaPago = parseDateInput(input.body.fechaPago)

  const tipo: ChequeTipo = input.body.tipo === 'echeq' ? 'echeq' : 'fisico'

  const compromisoPagoId =

    typeof input.body.compromisoPagoId === 'string' && input.body.compromisoPagoId.trim()

      ? input.body.compromisoPagoId.trim()

      : null

  const cobroOrigenId =

    typeof input.body.cobroOrigenId === 'string' && input.body.cobroOrigenId.trim()

      ? input.body.cobroOrigenId.trim()

      : null

  const nota = typeof input.body.nota === 'string' ? input.body.nota.trim() : null



  if (!numero || !bancoEmisor || !libradorNombre || !libradorCuit || !fechaEmision || !fechaPago) {

    throw new Error('Faltan campos obligatorios del cheque recibido')

  }



  const chequeId = randomUUID()

  const doc: Omit<ChequeDocument, 'createdAt' | 'updatedAt'> = {

    direccion: 'recibido',

    numero,

    bancoEmisor,

    libradorNombre,

    libradorCuit,

    beneficiarioNombre: null,

    beneficiarioCuit: null,

    cuentaId: null,

    montoCentavos,

    fechaEmision: timestampFromDate(fechaEmision),

    fechaPago: timestampFromDate(fechaPago),

    tipo,

    estadoActual: 'en_cartera',

    compromisoPagoId,

    cobroOrigenId,

    endosadoA: null,

    vendidoA: null,

    vendidoConResponsabilidad: null,

    motivoRechazo: null,

    createdBy: input.actorUid,

  }



  await createChequeWithHistorial({

    chequeId,

    doc,

    usuario: input.actorUid,

    nota: nota ?? 'Alta de cheque recibido',

  })



  if (compromisoPagoId) {

    await linkChequeToCompromiso({ compromisoId: compromisoPagoId, chequeId })

  }

  if (cobroOrigenId) {

    await linkChequeToCobro({ cobroId: cobroOrigenId, chequeId })

  }



  return getChequeDetail(chequeId)

}



export async function createChequeEmitido(input: {

  actorUid: string

  body: Record<string, unknown>

}) {

  const numero = typeof input.body.numero === 'string' ? input.body.numero.trim() : ''

  const cuentaId = typeof input.body.cuentaId === 'string' ? input.body.cuentaId.trim() : ''

  const beneficiarioNombre =

    typeof input.body.beneficiarioNombre === 'string' ? input.body.beneficiarioNombre.trim() : ''

  const beneficiarioCuit =

    typeof input.body.beneficiarioCuit === 'string' ? input.body.beneficiarioCuit.trim() : ''

  const montoCentavos = assertPositiveCentavos(input.body.montoCentavos, 'montoCentavos')

  const fechaEmision = parseDateInput(input.body.fechaEmision)

  const fechaPago = parseDateInput(input.body.fechaPago)

  const tipo: ChequeTipo = input.body.tipo === 'echeq' ? 'echeq' : 'fisico'

  const compromisoPagoId =

    typeof input.body.compromisoPagoId === 'string' && input.body.compromisoPagoId.trim()

      ? input.body.compromisoPagoId.trim()

      : null

  const nota = typeof input.body.nota === 'string' ? input.body.nota.trim() : null



  if (!numero || !cuentaId || !beneficiarioNombre || !beneficiarioCuit || !fechaEmision || !fechaPago) {

    throw new Error('Faltan campos obligatorios del cheque emitido')

  }



  const cuenta = await assertCuentaChequeraCc(cuentaId)



  const chequeId = randomUUID()

  const doc: Omit<ChequeDocument, 'createdAt' | 'updatedAt'> = {

    direccion: 'emitido',

    numero,

    bancoEmisor: cuenta.data.bancoNombre,

    libradorNombre: null,

    libradorCuit: null,

    beneficiarioNombre,

    beneficiarioCuit,

    cuentaId,

    montoCentavos,

    fechaEmision: timestampFromDate(fechaEmision),

    fechaPago: timestampFromDate(fechaPago),

    tipo,

    estadoActual: 'emitido',

    compromisoPagoId,

    cobroOrigenId: null,

    endosadoA: null,

    vendidoA: null,

    vendidoConResponsabilidad: null,

    motivoRechazo: null,

    createdBy: input.actorUid,

  }



  await createChequeWithHistorial({

    chequeId,

    doc,

    usuario: input.actorUid,

    nota: nota ?? 'Alta de cheque emitido',

  })



  if (compromisoPagoId) {

    await linkChequeToCompromiso({ compromisoId: compromisoPagoId, chequeId })

  }



  return getChequeDetail(chequeId)

}



async function applyChequeAction(input: {

  chequeId: string

  actorUid: string

  action: ChequeActionRecibido | ChequeActionEmitido

  nota: string | null

  patch: Parameters<typeof appendHistorialAndUpdateCheque>[0]['patch']

}) {

  const currentRaw = await getChequeDocument(input.chequeId)

  if (!currentRaw) {

    throw new Error('Cheque no encontrado')

  }

  const current = normalizeChequeDoc(currentRaw)



  let estadoNuevo: ChequeEstado

  try {

    estadoNuevo = resolveEstadoAfterAction(current.direccion, input.action, current.estadoActual)

  } catch (err) {

    if (err instanceof ChequeTransitionError) throw err

    throw err

  }



  await appendHistorialAndUpdateCheque({

    chequeId: input.chequeId,

    estadoAnterior: current.estadoActual,

    estadoNuevo,

    usuario: input.actorUid,

    nota: input.nota,

    patch: input.patch,

  })



  return getChequeDetail(input.chequeId)

}



async function assertRecibido(chequeId: string) {

  const data = await getChequeDocument(chequeId)

  if (!data) throw new Error('Cheque no encontrado')

  if (normalizeChequeDireccion(data.direccion) !== 'recibido') {

    throw new Error('Esta acción solo aplica a cheques recibidos')

  }

  return data

}



async function assertEmitido(chequeId: string) {

  const data = await getChequeDocument(chequeId)

  if (!data) throw new Error('Cheque no encontrado')

  if (normalizeChequeDireccion(data.direccion) !== 'emitido') {

    throw new Error('Esta acción solo aplica a cheques emitidos')

  }

  return data

}



export async function depositarCheque(chequeId: string, actorUid: string, nota: string | null) {

  await assertRecibido(chequeId)

  return applyChequeAction({

    chequeId,

    actorUid,

    action: 'depositar',

    nota,

    patch: {},

  })

}



export async function endosarCheque(

  chequeId: string,

  actorUid: string,

  body: Record<string, unknown>,

) {

  await assertRecibido(chequeId)

  const endosadoA = typeof body.endosadoA === 'string' ? body.endosadoA.trim() : ''

  const compromisoPagoId =

    typeof body.compromisoPagoId === 'string' && body.compromisoPagoId.trim()

      ? body.compromisoPagoId.trim()

      : null

  const nota = typeof body.nota === 'string' ? body.nota.trim() : null

  if (!endosadoA) throw new Error('endosadoA es obligatorio')



  const result = await applyChequeAction({

    chequeId,

    actorUid,

    action: 'endosar',

    nota,

    patch: {

      endosadoA,

      ...(compromisoPagoId ? { compromisoPagoId } : {}),

    },

  })



  if (compromisoPagoId) {

    await linkChequeToCompromiso({ compromisoId: compromisoPagoId, chequeId })

  }

  return result

}



export async function venderCheque(chequeId: string, actorUid: string, body: Record<string, unknown>) {

  await assertRecibido(chequeId)

  const vendidoA = typeof body.vendidoA === 'string' ? body.vendidoA.trim() : ''

  const vendidoConResponsabilidad = body.vendidoConResponsabilidad === true

  const nota = typeof body.nota === 'string' ? body.nota.trim() : null

  if (!vendidoA) throw new Error('vendidoA es obligatorio')



  return applyChequeAction({

    chequeId,

    actorUid,

    action: 'vender',

    nota,

    patch: { vendidoA, vendidoConResponsabilidad },

  })

}



export async function rechazarCheque(chequeId: string, actorUid: string, body: Record<string, unknown>) {

  const motivoRechazo = typeof body.motivoRechazo === 'string' ? body.motivoRechazo.trim() : ''

  const nota = typeof body.nota === 'string' ? body.nota.trim() : null

  if (!motivoRechazo) throw new Error('motivoRechazo es obligatorio')



  const data = await getChequeDocument(chequeId)

  if (!data) throw new Error('Cheque no encontrado')

  const direccion = normalizeChequeDireccion(data.direccion)

  if (direccion === 'emitido') {

    await assertEmitido(chequeId)

  } else {

    await assertRecibido(chequeId)

  }



  return applyChequeAction({

    chequeId,

    actorUid,

    action: 'rechazar',

    nota,

    patch: { motivoRechazo },

  })

}



export async function entregarChequeEmitido(chequeId: string, actorUid: string, nota: string | null) {

  await assertEmitido(chequeId)

  return applyChequeAction({

    chequeId,

    actorUid,

    action: 'entregar',

    nota,

    patch: {},

  })

}



export async function debitarChequeEmitido(chequeId: string, actorUid: string, nota: string | null) {

  await assertEmitido(chequeId)

  return applyChequeAction({

    chequeId,

    actorUid,

    action: 'debitar',

    nota,

    patch: {},

  })

}



export async function anularChequeEmitido(chequeId: string, actorUid: string, nota: string | null) {

  await assertEmitido(chequeId)

  return applyChequeAction({

    chequeId,

    actorUid,

    action: 'anular',

    nota,

    patch: {},

  })

}


