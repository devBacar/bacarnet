import type { ChequeEstado, ChequeImportRow, ChequeOrigen } from './cheque.types.js'
import type { EstadoChequeVientri, VientriChequeDoc } from '../../vientri/domain/tipos.js'
import { NOMBRE_ESTADO_CHQ } from '../../vientri/domain/cheques.js'

const ESTADO_MAP: Partial<Record<EstadoChequeVientri, ChequeEstado>> = {
  en_cartera: 'en_cartera',
  depositado: 'depositado',
  vendido: 'vendido',
  rechazado: 'rechazado',
  entregado: 'en_cartera',
  pendiente_debito: 'pendiente',
  debitado: 'debitado',
}

export interface ChequeVientriRow extends ChequeImportRow {
  vientriClave: string
  idCmpIngreso: number | null
  cmpIngresoDesc: string | null
  idCmpSalida: number | null
  cmpSalidaDesc: string | null
  idCmpNdRechazo: number | null
  idCmpPagoBanco: number | null
  estadoPrevioId: number | null
  estadoPrevio: string | null
  motivoRechazoId: number | null
}

export function vientriChequeToRow(doc: VientriChequeDoc): ChequeVientriRow | null {
  if (doc.baja) return null
  const estado = ESTADO_MAP[doc.estado]
  if (!estado) return null
  const numero = doc.numero?.trim()
  if (!numero || numero.includes('/') || doc.montoCentavos <= 0) return null

  const origen: ChequeOrigen = doc.direccion === 'emitido' ? 'propio' : 'tercero'

  return {
    numero,
    tipo: doc.tipo,
    direccion: doc.direccion,
    origen,
    montoCentavos: doc.montoCentavos,
    fechaEmision: doc.fechaEmision ?? '',
    fechaPago: doc.fechaVencimiento ?? '',
    fechaRecibido: doc.fechaRecibido ?? null,
    fechaEntregado: doc.fechaEntregado ?? null,
    emisor: doc.librador?.nombre ?? '',
    emisorCuit: doc.librador?.cuit ?? '',
    bancoEmisor: doc.bancoNombre ?? null,
    bancoEmisorCodigo: doc.bancoId ?? null,
    cliente: null,
    endosante: doc.entregadoPor?.nombre ?? null,
    destinatario: doc.destinatario ?? doc.entregadoA?.nombre ?? null,
    estado,
    estadoBancario: doc.estadoVientri ?? null,
    utilizado: estado === 'debitado' || estado === 'vendido' || doc.estado === 'entregado',
    cmc7: null,
    observaciones: doc.revisar.length > 0 ? doc.revisar.join('; ') : null,
    fechaAcreditacion: doc.fechaConciliado ?? null,
    vientriClave: doc.clave,
    idCmpIngreso: doc.idCmpIngreso,
    cmpIngresoDesc: doc.cmpIngresoDesc ?? null,
    idCmpSalida: doc.idCmpSalida,
    cmpSalidaDesc: doc.cmpSalidaDesc ?? null,
    idCmpNdRechazo: doc.idCmpNdRechazo,
    idCmpPagoBanco: doc.idCmpPagoBanco,
    estadoPrevioId: doc.estadoPrevioId,
    estadoPrevio: doc.estadoPrevioId !== null ? NOMBRE_ESTADO_CHQ[doc.estadoPrevioId] ?? `Estado ${doc.estadoPrevioId}` : null,
    motivoRechazoId: doc.motivoRechazoId,
  }
}
