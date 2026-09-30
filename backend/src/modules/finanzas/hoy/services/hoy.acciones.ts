import type { AuthedUser } from '../../../auth/middleware.js'
import { getCobroDocument, getCompromisoDocument } from '../../agenda/services/agenda.repository.js'
import { confirmarCobro, reprogramarCobro } from '../../agenda/services/cobros.service.js'
import {
  marcarCompromisoYaPagado,
  reprogramarCompromiso,
} from '../../agenda/services/compromisos.service.js'
import { listCajasForUser, registerMovimiento } from '../../cajachica/services/caja.service.js'
import { fechaHoyArgentina, formatoPesos } from '../domain/hoy.fechas.js'
import type { CobroHoy } from '../domain/hoy.tipos.js'
import { creditoConfirmaCobro, sugerirDebitos } from '../domain/hoy.vista.js'
import { getMovimientoHoy } from './hoy.service.js'

type Comprobante = { fileName: string; mimeType: string; buffer: Buffer } | null

function mensajeEfectivo(input: { cajaNombre: string; sinComprobante: boolean; esIngreso: boolean }): string {
  const accion = input.esIngreso ? 'el ingreso' : 'el pago'
  if (input.sinComprobante) {
    return `Listo. Anoté ${accion} en ${input.cajaNombre}. No adjuntaste el ticket: queda sin comprobante, igual que cuando lo cargás en Cajas.`
  }
  return `Listo. Anoté ${accion} en ${input.cajaNombre}, con el ticket.`
}

async function cajaEnPesos(user: AuthedUser, cajaId: string) {
  const cajas = await listCajasForUser(user)
  const caja = cajas.find((item) => item.id === cajaId)
  if (!caja) throw new Error('No tenés esa caja o no está activa')
  if (caja.moneda !== 'ARS') throw new Error('Elegí una caja en pesos')
  if (caja.bloqueadaPorCierre) {
    throw new Error('Esa caja está cerrada esperando aprobación. Elegí otra.')
  }
  return caja
}

export async function pagarCompromisoEnEfectivo(input: {
  user: AuthedUser
  compromisoId: string
  cajaId: string
  comprobante: Comprobante
}) {
  const compromiso = await getCompromisoDocument(input.compromisoId)
  if (!compromiso) throw new Error('No encontré ese pago')
  if (compromiso.estado === 'pagado') throw new Error('Ese pago ya está hecho')
  if (compromiso.estado === 'confeccionada_pendiente_autorizacion') {
    throw new Error('Esta transferencia ya está armada. No la pagues también en efectivo.')
  }
  const caja = await cajaEnPesos(input.user, input.cajaId)
  if (caja.saldoActualCentavos < compromiso.montoCentavos) {
    throw new Error(
      `En ${caja.nombre} hay ${formatoPesos(caja.saldoActualCentavos)} y este pago es ${formatoPesos(compromiso.montoCentavos)}. No alcanza.`,
    )
  }
  const hoy = fechaHoyArgentina(new Date())
  await registerMovimiento({
    user: input.user,
    cajaId: caja.id,
    body: {
      tipo: 'egreso',
      concepto: compromiso.concepto,
      montoCentavos: compromiso.montoCentavos,
      fecha: `${hoy}T12:00:00-03:00`,
    },
    comprobante: input.comprobante,
    operacionVinculadaId: input.compromisoId,
  })
  await marcarCompromisoYaPagado(input.compromisoId, input.user.uid, {
    medioPago: 'efectivo',
    cuentaId: caja.id,
    fechaPago: `${hoy}T12:00:00-03:00`,
    nota: `Pagado en efectivo desde ${caja.nombre}`,
  })
  return {
    mensaje: mensajeEfectivo({
      cajaNombre: caja.nombre,
      sinComprobante: !input.comprobante || input.comprobante.buffer.length === 0,
      esIngreso: false,
    }),
  }
}

export async function yaPagueCompromiso(input: {
  user: AuthedUser
  compromisoId: string
  body: Record<string, unknown>
}) {
  const compromiso = await getCompromisoDocument(input.compromisoId)
  if (!compromiso) throw new Error('No encontré ese pago')
  const movimientoId = typeof input.body.movimientoId === 'string' ? input.body.movimientoId.trim() : ''
  let cuentaId = typeof input.body.cuentaId === 'string' ? input.body.cuentaId.trim() : ''
  if (movimientoId && input.body.medioPago === 'transferencia') {
    const movimiento = await getMovimientoHoy(movimientoId)
    if (!movimiento) throw new Error('No encontré ese movimiento del banco')
    const coincide = sugerirDebitos(compromiso.montoCentavos, [movimiento], fechaHoyArgentina(new Date()), compromiso.cuentaId)
    if (coincide.length === 0) {
      throw new Error('Ese movimiento no coincide con el monto de los últimos 5 días')
    }
    cuentaId = movimiento.cuentaId
  }
  await marcarCompromisoYaPagado(input.compromisoId, input.user.uid, {
    ...input.body,
    cuentaId: cuentaId || undefined,
    movimientoId: movimientoId || undefined,
  })
  return { mensaje: 'Listo. Quedó marcado como pagado.' }
}

export async function pasarCompromisoDeDia(input: {
  user: AuthedUser
  compromisoId: string
  fecha: string
}) {
  await reprogramarCompromiso(input.compromisoId, input.user.uid, input.fecha)
  return { mensaje: 'Listo. Lo pasé a ese día.' }
}

export async function confirmarCobroLlegado(input: {
  user: AuthedUser
  cobroId: string
  movimientoId: string
}) {
  const cobro = await getCobroDocument(input.cobroId)
  if (!cobro) throw new Error('No encontré ese cobro')
  const movimiento = await getMovimientoHoy(input.movimientoId)
  if (!movimiento) throw new Error('No encontré ese movimiento del banco')
  const hoy = fechaHoyArgentina(new Date())
  const comoHoy: CobroHoy = {
    id: input.cobroId,
    clienteONombre: cobro.clienteONombre,
    concepto: null,
    montoCentavos: cobro.montoCentavos,
    fechaEsperada: hoy,
    estado: cobro.estado,
    cuit: null,
    email: null,
    contraparte: null,
  }
  const extra = cobro as unknown as Record<string, unknown>
  if (typeof extra.cuit === 'string') comoHoy.cuit = extra.cuit
  if (typeof extra.concepto === 'string') comoHoy.concepto = extra.concepto
  if (typeof extra.contraparte === 'string') comoHoy.contraparte = extra.contraparte
  if (!creditoConfirmaCobro(comoHoy, movimiento, hoy)) {
    throw new Error('Ese movimiento del banco no coincide con este cobro')
  }
  await confirmarCobro(input.cobroId, input.user.uid, {
    cuentaId: movimiento.cuentaId,
    fechaConfirmado: `${hoy}T12:00:00-03:00`,
    nota: `Confirmado con el crédito de ${movimiento.bancoNombre}. Movimiento ${movimiento.id}.`,
  })
  return { mensaje: `Listo. Quedó cobrado en ${movimiento.bancoNombre}.` }
}

export async function cobrarEnEfectivo(input: {
  user: AuthedUser
  cobroId: string
  cajaId: string
  comprobante: Comprobante
}) {
  const cobro = await getCobroDocument(input.cobroId)
  if (!cobro) throw new Error('No encontré ese cobro')
  if (cobro.estado === 'confirmado') throw new Error('Ese cobro ya está confirmado')
  const caja = await cajaEnPesos(input.user, input.cajaId)
  // Regla de Cajas: una caja chica no recibe ingresos libres (solo fondeo desde la principal).
  if ((caja as { tipo?: unknown }).tipo === 'chica') {
    throw new Error('Los cobros en efectivo se anotan en la caja principal. Elegí la caja principal.')
  }
  const hoy = fechaHoyArgentina(new Date())
  const concepto =
    typeof (cobro as unknown as Record<string, unknown>).concepto === 'string' &&
    String((cobro as unknown as Record<string, unknown>).concepto).trim()
      ? String((cobro as unknown as Record<string, unknown>).concepto).trim()
      : cobro.clienteONombre
  await registerMovimiento({
    user: input.user,
    cajaId: caja.id,
    body: {
      tipo: 'ingreso',
      concepto,
      montoCentavos: cobro.montoCentavos,
      fecha: `${hoy}T12:00:00-03:00`,
    },
    comprobante: input.comprobante,
    operacionVinculadaId: input.cobroId,
  })
  await confirmarCobro(input.cobroId, input.user.uid, {
    cuentaId: caja.id,
    fechaConfirmado: `${hoy}T12:00:00-03:00`,
    nota: `Cobrado en efectivo en ${caja.nombre}`,
  })
  return {
    mensaje: mensajeEfectivo({
      cajaNombre: caja.nombre,
      sinComprobante: !input.comprobante || input.comprobante.buffer.length === 0,
      esIngreso: true,
    }),
  }
}

export async function pasarCobroDeDia(input: { user: AuthedUser; cobroId: string; fecha: string }) {
  await reprogramarCobro(input.cobroId, input.user.uid, input.fecha)
  return { mensaje: 'Listo. Lo pasé a ese día.' }
}
