import type { AuthedUser } from '../../../auth/middleware.js'
import { listarPagos, leerMontoSolicitado, resolverMontoPago } from '../../agenda/domain/pago-compromiso.js'
import { ingresarChequesPegados } from '../../cheques/services/cheques.service.js'
import { leerPartesPagoCombinado, montoQueRegistraChequeCartera, validarPagoCombinado } from '../domain/pago-combinado.js'
import { faltaPagarCentavos, listarTransferenciasEnFirma } from '../domain/transferencia-en-firma.js'
import { getCobroDocument, getCompromisoDocument } from '../../agenda/services/agenda.repository.js'
import { confirmarCobro, reprogramarCobro } from '../../agenda/services/cobros.service.js'
import {
  marcarCompromisoYaPagado,
  reprogramarCompromiso,
} from '../../agenda/services/compromisos.service.js'
import { armarChequePagoDe } from '../../cheques/domain/cheque.types.js'
import {
  anotarChequePagoDe,
  chequeDocId,
  getChequeById,
  marcarChequeEndosado,
} from '../../cheques/services/cheques.repository.js'
import { listCajasForUser, registerMovimiento } from '../../cajachica/services/caja.service.js'
import { camposEndoso, esChequeEnCartera } from '../domain/cheques-hoy.js'
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

function faltaDelCompromiso(compromiso: {
  estado: string
  montoCentavos: number
  pagos?: unknown
  transferenciasEnFirma?: unknown
}): number {
  return faltaPagarCentavos({
    estado: compromiso.estado,
    montoCentavos: compromiso.montoCentavos,
    pagos: listarPagos(compromiso.pagos),
    transferenciasEnFirma: listarTransferenciasEnFirma(compromiso.transferenciasEnFirma),
  })
}

function montoQueSePaga(
  compromiso: { estado: string; montoCentavos: number; pagos?: unknown; transferenciasEnFirma?: unknown },
  montoCentavos: unknown,
): number {
  const restante = faltaDelCompromiso(compromiso)
  if (restante <= 0) throw new Error('Ese pago ya está hecho')
  return resolverMontoPago(restante, leerMontoSolicitado(montoCentavos))
}

function centavosAMontoPegado(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',')
}

export async function pagarCompromisoEnEfectivo(input: {
  user: AuthedUser
  compromisoId: string
  cajaId: string
  comprobante: Comprobante
  montoCentavos?: unknown
}) {
  const compromiso = await getCompromisoDocument(input.compromisoId)
  if (!compromiso) throw new Error('No encontré ese pago')
  if (compromiso.estado === 'pagado') throw new Error('Ese pago ya está hecho')
  if (compromiso.estado === 'confeccionada_pendiente_autorizacion') {
    throw new Error('Esta transferencia ya está armada. No la pagues también en efectivo.')
  }
  const monto = montoQueSePaga(compromiso, input.montoCentavos)
  const caja = await cajaEnPesos(input.user, input.cajaId)
  if (caja.saldoActualCentavos < monto) {
    throw new Error(
      `En ${caja.nombre} hay ${formatoPesos(caja.saldoActualCentavos)} y este pago es ${formatoPesos(monto)}. No alcanza.`,
    )
  }
  const hoy = fechaHoyArgentina(new Date())
  await registerMovimiento({
    user: input.user,
    cajaId: caja.id,
    body: {
      tipo: 'egreso',
      concepto: compromiso.concepto,
      montoCentavos: monto,
      fecha: `${hoy}T12:00:00-03:00`,
    },
    comprobante: input.comprobante,
    operacionVinculadaId: input.compromisoId,
  })
  await marcarCompromisoYaPagado(input.compromisoId, input.user.uid, {
    medioPago: 'efectivo',
    cuentaId: caja.id,
    cajaId: caja.id,
    fechaPago: `${hoy}T12:00:00-03:00`,
    montoCentavos: monto,
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

/** Endosa un cheque de la cartera y deja el compromiso pagado con ese cheque. */
export async function pagarCompromisoConChequeDeCartera(input: {
  user: AuthedUser
  compromisoId: string
  chequeId: string
}) {
  const compromiso = await getCompromisoDocument(input.compromisoId)
  if (!compromiso) throw new Error('No encontré ese pago')
  if (compromiso.estado === 'pagado') throw new Error('Ese pago ya está hecho')
  if (compromiso.estado === 'confeccionada_pendiente_autorizacion') {
    throw new Error('Esta transferencia ya está armada. No la pagues también con un cheque.')
  }
  const cheque = await getChequeById(input.chequeId)
  if (!cheque) throw new Error('No encontré ese cheque')
  if (!esChequeEnCartera(cheque)) {
    throw new Error('Ese cheque no está en la cartera. Elegí otro.')
  }
  const parche = camposEndoso(compromiso.proveedorONombre)
  if (!parche.destinatario) throw new Error('Este pago no tiene a quién se lo endosamos')
  const falta = faltaDelCompromiso(compromiso)
  const monto = montoQueRegistraChequeCartera(cheque.montoCentavos, falta)
  const pagoDe = armarChequePagoDe({
    compromisoId: input.compromisoId,
    proveedorONombre: compromiso.proveedorONombre,
    concepto: compromiso.concepto,
  })
  await marcarChequeEndosado({ id: cheque.id, destinatario: parche.destinatario, pagoDe })
  const hoy = fechaHoyArgentina(new Date())
  await marcarCompromisoYaPagado(input.compromisoId, input.user.uid, {
    medioPago: 'cheque',
    chequeId: cheque.id,
    claseCheque: 'cartera',
    fechaPago: hoy,
    montoCentavos: monto,
    nota: `Endosado el cheque N.º ${cheque.numero} a ${parche.destinatario}.`,
  })
  const parcial = monto < falta
  return {
    mensaje: parcial
      ? `Listo. Endosé el cheque N.º ${cheque.numero} a ${parche.destinatario}. Quedó pagada una parte: el resto sigue en la Agenda.`
      : `Listo. Endosé el cheque N.º ${cheque.numero} a ${parche.destinatario} y marqué el pago.`,
  }
}

export class PagoCombinadoIncompletoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PagoCombinadoIncompletoError'
  }
}

/** Varias formas juntas. Valida todo antes de anotar; si una falla a mitad, dice qué quedó hecho. */
export async function pagarCompromisoCombinado(input: {
  user: AuthedUser
  compromisoId: string
  partes: unknown
  comprobantes: Map<number, Comprobante>
}) {
  const compromiso = await getCompromisoDocument(input.compromisoId)
  if (!compromiso) throw new Error('No encontré ese pago')
  const partes = leerPartesPagoCombinado(input.partes)
  const cajas = await listCajasForUser(input.user)
  const cheques = []
  for (const parte of partes) {
    if (parte.medio !== 'cheque_cartera') continue
    const cheque = await getChequeById(parte.chequeId)
    cheques.push({
      id: parte.chequeId,
      numero: cheque?.numero ?? '',
      montoCentavos: cheque?.montoCentavos ?? 0,
      enCartera: cheque ? esChequeEnCartera(cheque) : false,
    })
  }
  const validacion = validarPagoCombinado({
    estado: compromiso.estado,
    faltaCentavos: faltaDelCompromiso(compromiso),
    partes,
    cajas: cajas.map((caja) => ({
      id: caja.id,
      nombre: caja.nombre,
      moneda: caja.moneda,
      saldoActualCentavos: caja.saldoActualCentavos,
      bloqueadaPorCierre: caja.bloqueadaPorCierre === true,
      activa: caja.estado !== 'inactiva',
    })),
    cheques,
  })
  if (!validacion.ok) throw new Error(validacion.error)

  const hechas: string[] = []
  for (let indice = 0; indice < validacion.partes.length; indice += 1) {
    const parte = validacion.partes[indice]!
    const etiqueta =
      parte.medio === 'efectivo'
        ? 'el efectivo'
        : parte.medio === 'cheque_cartera'
          ? 'el cheque de la cartera'
          : `el cheque propio N.º ${parte.cheque?.numero ?? ''}`
    try {
      if (parte.medio === 'efectivo' && parte.cajaId) {
        await pagarCompromisoEnEfectivo({
          user: input.user,
          compromisoId: input.compromisoId,
          cajaId: parte.cajaId,
          comprobante: input.comprobantes.get(indice) ?? null,
          montoCentavos: parte.montoARegistrar,
        })
      } else if (parte.medio === 'cheque_cartera' && parte.chequeId) {
        await pagarCompromisoConChequeDeCartera({
          user: input.user,
          compromisoId: input.compromisoId,
          chequeId: parte.chequeId,
        })
      } else if (parte.medio === 'cheque_propio' && parte.cheque && parte.montoCentavos) {
        await pagarConChequePropio({
          user: input.user,
          compromisoId: input.compromisoId,
          destinatario: compromiso.proveedorONombre,
          concepto: compromiso.concepto,
          proveedorONombre: compromiso.proveedorONombre,
          montoCentavos: parte.montoARegistrar,
          cheque: parte.cheque,
        })
      }
      hechas.push(etiqueta)
    } catch (err) {
      const detalle = err instanceof Error ? err.message : 'No se pudo anotar'
      if (hechas.length === 0) throw err instanceof Error ? err : new Error(detalle)
      throw new PagoCombinadoIncompletoError(
        `Quedó a medias. Ya se anotó ${hechas.join(', ')}. No se pudo seguir con ${etiqueta}: ${detalle} Lo que ya se anotó no se duplica: sacalo de la lista y confirmá solo lo que falta.`,
      )
    }
  }

  return {
    mensaje:
      hechas.length === 1
        ? 'Listo. Quedó anotado el pago.'
        : `Listo. Anoté ${hechas.length} formas de pago.`,
  }
}

async function pagarConChequePropio(input: {
  user: AuthedUser
  compromisoId: string
  destinatario: string
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  cheque: { tipo: 'echeq' | 'fisico'; numero: string; banco: string; fechaPago: string }
}) {
  const hoy = fechaHoyArgentina(new Date())
  const resultado = await ingresarChequesPegados({
    direccion: 'emitido',
    origen: 'propio',
    actorUid: input.user.uid,
    rows: [
      {
        numero: input.cheque.numero,
        emisor: '',
        fechaEmision: hoy,
        fechaPago: input.cheque.fechaPago,
        montoPesos: centavosAMontoPegado(input.montoCentavos),
        cmc7: '',
        endosante: '',
        bancoEmisor: input.cheque.banco,
        tipo: input.cheque.tipo,
        condicion: '',
      },
    ],
  })
  if (resultado.insertados !== 1) {
    const detalle = resultado.errores[0] || (resultado.duplicados > 0 ? 'Ese número de cheque ya existe' : 'No se pudo cargar el cheque')
    throw new Error(detalle)
  }
  const chequeId = chequeDocId('emitido', input.cheque.numero)
  const creado = await getChequeById(chequeId)
  if (!creado) throw new Error('Cargué el cheque pero no lo encuentro para anotarlo en el pago')
  const pagoDe = armarChequePagoDe({
    compromisoId: input.compromisoId,
    proveedorONombre: input.proveedorONombre,
    concepto: input.concepto,
  })
  await anotarChequePagoDe({
    id: creado.id,
    pagoDe,
    destinatario: input.destinatario,
  })
  try {
    await marcarCompromisoYaPagado(input.compromisoId, input.user.uid, {
      medioPago: 'cheque',
      chequeId: creado.id,
      claseCheque: 'propio',
      fechaPago: hoy,
      montoCentavos: input.montoCentavos,
      nota: `Cheque propio N.º ${creado.numero} de ${input.cheque.banco} para ${input.destinatario}.`,
    })
  } catch (err) {
    const detalle = err instanceof Error ? err.message : 'No se pudo anotar el pago'
    throw new Error(`El cheque N.º ${creado.numero} ya quedó cargado, pero no pude anotarlo en el pago: ${detalle}`)
  }
}

export async function yaPagueCompromiso(input: {
  user: AuthedUser
  compromisoId: string
  body: Record<string, unknown>
}) {
  const compromiso = await getCompromisoDocument(input.compromisoId)
  if (!compromiso) throw new Error('No encontré ese pago')
  const monto = montoQueSePaga(compromiso, input.body.montoCentavos)
  const movimientoId = typeof input.body.movimientoId === 'string' ? input.body.movimientoId.trim() : ''
  let cuentaId = typeof input.body.cuentaId === 'string' ? input.body.cuentaId.trim() : ''
  if (movimientoId && input.body.medioPago === 'transferencia') {
    const movimiento = await getMovimientoHoy(movimientoId)
    if (!movimiento) throw new Error('No encontré ese movimiento del banco')
    const coincide = sugerirDebitos(monto, [movimiento], fechaHoyArgentina(new Date()), compromiso.cuentaId)
    if (coincide.length === 0) {
      throw new Error('Ese movimiento no coincide con el monto de los últimos 5 días')
    }
    cuentaId = movimiento.cuentaId
  }
  await marcarCompromisoYaPagado(input.compromisoId, input.user.uid, {
    ...input.body,
    montoCentavos: monto,
    cuentaId: cuentaId || undefined,
    movimientoId: movimientoId || undefined,
    marcadoAMano: true,
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
    fechaConfirmado: null,
    origen: cobro.origen === 'vientri' || cobro.origen === 'vientri-cheque' || cobro.origen === 'inversiones' || cobro.origen === 'planilla' ? cobro.origen : 'manual',
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
