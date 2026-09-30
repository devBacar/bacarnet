import { randomUUID } from 'node:crypto'
import { agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import { getCuentaDocument } from '../../services/cuentas.repository.js'
import { cbuDeCuentaPropia } from '../adapters/interbanking-cuenta.routing.js'
import {
  getFinanzasTransferenciasProvider,
  resolveFinanzasTransferenciasProviderMode,
} from '../adapters/transferencias-provider.factory.js'
import type { ConfeccionTransferenciaItem } from '../adapters/transferencias-provider.types.js'
import { validarCbu } from '../domain/cbu-cuit.js'
import {
  disponibleCuentaCentavos,
  esErrorCandadoTransferencias,
  MENSAJE_TRANSFERENCIAS_REALES_DESHABILITADAS,
  parseConfeccionDirectaBody,
  TransferenciaHttpError,
  type ConfeccionDirectaParseada,
} from '../domain/confeccion-directa.rules.js'
import { translateInterbankingErrors } from '../domain/transferencia.errors.js'
import type {
  TransferenciaConfeccionadaDocument,
  TransferenciaEstado,
} from '../domain/transferencia.types.js'
import { registrarUsoDestinatario } from './destinatarios.service.js'
import {
  abortIdempotentConfeccion,
  beginIdempotentConfeccion,
  createTransferenciaWithHistorial,
  getTransferenciaDocument,
  timestampNow,
} from './transferencias.repository.js'

type TransferenciaDoc = Omit<TransferenciaConfeccionadaDocument, 'createdAt' | 'updatedAt'>

export interface TransferenciaDirectaApi {
  id: string
  compromisoPagoId: string | null
  origen: 'directa' | 'compromiso'
  tipo: string
  cuentaDebitoId: string
  cuentaCreditoCbu: string
  destinoNombre: string | null
  destinoCuit: string | null
  montoCentavos: number
  concepto: string | null
  referencia: string | null
  operationId: string
  processId: string | null
  estado: string
  erroresInterbanking: string[] | null
  confeccionadaPor: string
  fechaConfeccion: string | null
  idempotencyKey: string | null
}

function serializar(id: string, data: TransferenciaConfeccionadaDocument): TransferenciaDirectaApi {
  return {
    id,
    compromisoPagoId: data.compromisoPagoId,
    origen: data.origen ?? 'compromiso',
    tipo: data.tipo,
    cuentaDebitoId: data.cuentaDebitoId,
    cuentaCreditoCbu: data.cuentaCreditoCbu,
    destinoNombre: data.destinoNombre ?? null,
    destinoCuit: data.destinoCuit ?? null,
    montoCentavos: data.montoCentavos,
    concepto: data.concepto,
    referencia: data.referencia ?? null,
    operationId: data.operationId,
    processId: data.processId,
    estado: data.estado,
    erroresInterbanking: data.erroresInterbanking,
    confeccionadaPor: data.confeccionadaPor,
    fechaConfeccion: agendaTimestampToIso(data.fechaConfeccion),
    idempotencyKey: data.idempotencyKey ?? null,
  }
}

async function resolverDestino(parsed: ConfeccionDirectaParseada): Promise<{
  cbu: string
  nombre: string
  cuit: string | null
}> {
  if (parsed.tipo === 'cuentas_propias') {
    const cuentaId = parsed.destinoCuentaId ?? ''
    const cuenta = await getCuentaDocument(cuentaId)
    if (!cuenta) {
      throw new TransferenciaHttpError(400, { error: 'Cuenta de destino no encontrada' })
    }
    if (cuenta.data.tipo !== 'CC' || cuenta.data.moneda !== 'ARS') {
      throw new TransferenciaHttpError(400, {
        error: 'La cuenta de destino tiene que ser una cuenta corriente en pesos',
      })
    }
    const cbu = cbuDeCuentaPropia(cuenta.id)
    if (!cbu) {
      throw new TransferenciaHttpError(400, {
        error: 'La cuenta de destino no tiene CBU cargado en BacarNet',
      })
    }
    const valido = validarCbu(cbu)
    if (!valido.ok) {
      throw new TransferenciaHttpError(400, { error: valido.error })
    }
    return {
      cbu: valido.valor,
      nombre: `${cuenta.data.bancoNombre} CC`,
      cuit: null,
    }
  }

  return {
    cbu: parsed.destinoCbu ?? '',
    nombre: parsed.destinoNombre ?? '',
    cuit: parsed.destinoCuit,
  }
}

export async function confeccionarTransferenciaDirecta(input: {
  actorUid: string
  body: Record<string, unknown>
}) {
  const parsed = parseConfeccionDirectaBody(input.body)
  const debito = await getCuentaDocument(parsed.cuentaDebitoId)
  if (!debito) throw new TransferenciaHttpError(400, { error: 'Cuenta de débito no encontrada' })
  if (debito.data.tipo !== 'CC' || debito.data.moneda !== 'ARS') {
    throw new TransferenciaHttpError(400, {
      error: 'La cuenta de débito tiene que ser una cuenta corriente en pesos',
    })
  }

  const destino = await resolverDestino(parsed)
  const disponible = disponibleCuentaCentavos(
    debito.data.saldoActualCentavos,
    debito.data.descubiertoCentavos,
  )
  if (!parsed.confirmarSinFondos && parsed.montoCentavos > disponible) {
    throw new TransferenciaHttpError(409, {
      error: 'El monto supera el disponible de la cuenta (saldo más descubierto).',
      requiereConfirmacion: true,
      disponibleCentavos: disponible,
    })
  }

  const claim = await beginIdempotentConfeccion(parsed.idempotencyKey)
  if (claim.kind === 'pending') {
    throw new TransferenciaHttpError(409, {
      error: 'Ya estamos confeccionando esta transferencia. Esperá unos segundos y no la envíes de nuevo.',
    })
  }
  if (claim.kind === 'replay') {
    const existente = await getTransferenciaDocument(claim.transferenciaId)
    if (!existente) {
      await abortIdempotentConfeccion(parsed.idempotencyKey)
      throw new TransferenciaHttpError(409, {
        error: 'La confección anterior no quedó registrada. Volvé a intentar.',
      })
    }
    const errores = existente.data.erroresInterbanking
    if (existente.data.estado === 'rechazada' && errores?.length) {
      return {
        ok: false as const,
        transferencia: serializar(existente.id, existente.data),
        errores,
        provider: resolveFinanzasTransferenciasProviderMode(),
        idempotente: true,
      }
    }
    return {
      ok: true as const,
      transferencia: serializar(existente.id, existente.data),
      provider: resolveFinanzasTransferenciasProviderMode(),
      idempotente: true,
    }
  }

  const item: ConfeccionTransferenciaItem = {
    tipo: parsed.tipo,
    cuentaDebitoId: parsed.cuentaDebitoId,
    cuentaCreditoCbu: destino.cbu,
    montoCentavos: parsed.montoCentavos,
    concepto: parsed.concepto,
    disclaimerAceptado: parsed.disclaimerAceptado,
    codigoConcepto: parsed.codigoConcepto,
    destinoCuit: destino.cuit,
  }

  const provider = getFinanzasTransferenciasProvider()
  let providerResult: Awaited<ReturnType<typeof provider.confeccionarLote>>
  try {
    providerResult = await provider.confeccionarLote([item])
  } catch (err) {
    await abortIdempotentConfeccion(parsed.idempotencyKey)
    if (esErrorCandadoTransferencias(err)) {
      throw new TransferenciaHttpError(503, { error: MENSAJE_TRANSFERENCIAS_REALES_DESHABILITADAS })
    }
    const message = err instanceof Error ? err.message : 'No se pudo confeccionar la transferencia'
    throw new TransferenciaHttpError(400, { error: message })
  }

  const providerMode = resolveFinanzasTransferenciasProviderMode()
  const fechaConfeccion = timestampNow()
  const transferenciaId = randomUUID()
  const baseDoc: TransferenciaDoc = {
    compromisoPagoId: null,
    origen: 'directa',
    tipo: parsed.tipo,
    cuentaDebitoId: parsed.cuentaDebitoId,
    cuentaCreditoCbu: destino.cbu,
    destinoNombre: destino.nombre,
    destinoCuit: destino.cuit,
    referencia: parsed.referencia,
    idempotencyKey: parsed.idempotencyKey,
    montoCentavos: parsed.montoCentavos,
    concepto: parsed.concepto,
    codigoConcepto: parsed.codigoConcepto,
    disclaimerAceptado: parsed.disclaimerAceptado,
    confectionId: providerResult.confectionId ?? null,
    operationId: '',
    processId: providerResult.processId,
    estado: 'rechazada',
    erroresInterbanking: null,
    confeccionadaPor: input.actorUid,
    fechaConfeccion,
    fechaDeteccionEfectivizada: null,
  }

  const erroresTraducidos = translateInterbankingErrors(providerResult.erroresCodigos)
  if (erroresTraducidos?.length) {
    const doc: TransferenciaDoc = {
      ...baseDoc,
      operationId: providerResult.operationId || '',
      estado: 'rechazada',
      erroresInterbanking: erroresTraducidos,
    }
    await guardar(transferenciaId, doc, erroresTraducidos.join(' '))
    return {
      ok: false as const,
      transferencia: serializar(transferenciaId, docConMarcas(doc)),
      errores: erroresTraducidos,
      provider: providerMode,
      idempotente: false,
    }
  }

  let estado: TransferenciaEstado = providerResult.estadoInmediato
  let operationId = providerResult.operationId
  if (estado === 'pendiente_proceso' && providerResult.processId) {
    const polled = await provider.consultarProceso(providerResult.processId)
    if (polled.estado === 'confeccionada' && polled.operationId) {
      estado = 'confeccionada'
      operationId = polled.operationId
    } else if (polled.estado === 'rechazada') {
      const err = translateInterbankingErrors(polled.erroresCodigos) ?? ['No se pudo confeccionar el lote']
      const doc: TransferenciaDoc = {
        ...baseDoc,
        operationId: '',
        processId: providerResult.processId,
        estado: 'rechazada',
        erroresInterbanking: err,
      }
      await guardar(transferenciaId, doc, err.join(' '))
      return {
        ok: false as const,
        transferencia: serializar(transferenciaId, docConMarcas(doc)),
        errores: err,
        provider: providerMode,
        idempotente: false,
      }
    }
  }

  if (!operationId && estado === 'confeccionada') {
    await abortIdempotentConfeccion(parsed.idempotencyKey)
    throw new TransferenciaHttpError(502, { error: 'El proveedor no devolvió operation_id' })
  }

  const docOk: TransferenciaDoc = {
    ...baseDoc,
    operationId: operationId || '',
    estado,
    erroresInterbanking: null,
  }
  await guardar(
    transferenciaId,
    docOk,
    providerMode === 'interbanking' ? 'Confección directa' : 'Confección directa (mock)',
  )

  if (parsed.tipo === 'terceros' || parsed.tipo === 'proveedores') {
    try {
      await registrarUsoDestinatario({
        nombre: destino.nombre,
        cbu: destino.cbu,
        cuit: destino.cuit,
        tipo: parsed.tipo,
        actorUid: input.actorUid,
      })
    } catch (err) {
      console.error('[finanzas/transferencias] agenda destinatario', err)
    }
  }

  return {
    ok: true as const,
    transferencia: serializar(transferenciaId, docConMarcas(docOk)),
    provider: providerMode,
    idempotente: false,
  }
}

function docConMarcas(doc: TransferenciaDoc): TransferenciaConfeccionadaDocument {
  const ahora = timestampNow()
  return { ...doc, createdAt: ahora, updatedAt: ahora }
}

async function guardar(id: string, doc: TransferenciaDoc, nota: string): Promise<void> {
  try {
    await createTransferenciaWithHistorial({
      id,
      doc,
      historial: {
        estadoAnterior: null,
        estadoNuevo: doc.estado,
        origen: 'api',
        nota,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    const yaReservada =
      message === 'Esta transferencia ya fue confeccionada' || message === 'Transferencia ya existe'
    if (!yaReservada && doc.idempotencyKey) await abortIdempotentConfeccion(doc.idempotencyKey)
    throw err
  }
}
