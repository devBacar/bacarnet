import { conceptoTercerosPorCodigo, CONCEPTO_TERCEROS_DEFAULT } from '../domain/conceptos-transferencia.js'
import type { TransferenciaTipo } from '../domain/transferencia.types.js'
import { loadInterbankingTransferConfig } from './interbanking-transfer.config.js'

/** Rutas v2 OpenAPI — Confección de Transferencias (Interbanking). */
export const INTERBANKING_CONFECTION_PATH_BY_TIPO: Partial<Record<TransferenciaTipo, string>> = {
  cuentas_propias: '/v2/transfers/confection/own-account',
  proveedores: '/v2/transfers/confection/supplier',
  terceros: '/v2/transfers/confection/third-party',
  sueldos: '/v2/transfers/confection/salary',
}

export interface InterbankingTransferAccountV2 {
  bank_number: string
  account_type: 'CC' | 'CA'
  currency: 'ARS' | 'USD'
  account_number: string
  account_cbu?: string
}

export interface InterbankingOwnAccountTransferLineV2 {
  confection_id: string
  request_date: string
  /** Monto en pesos/dólares como string (schema OpenAPI). */
  amount: string
  debit_account: InterbankingTransferAccountV2
  credit_account: InterbankingTransferAccountV2
}

export interface InterbankingConfeccionCommandOwnAccountV2 {
  operator_id_number: string
  operator_country_code: 'AR'
  consolidated_check: boolean
  unified_send: boolean
  resend_validated: boolean
  found_transfers: InterbankingOwnAccountTransferLineV2[]
}

export interface BuildOwnAccountConfeccionInput {
  confectionId: string
  requestDate: string
  amountPesosString: string
  debit: InterbankingTransferAccountV2
  credit: InterbankingTransferAccountV2
  consolidatedCheck?: boolean
  unifiedSend?: boolean
  resendValidated?: boolean
  operatorIdNumber?: string
}

function readOperatorIdNumber(): string {
  const fromEnv = process.env.INTERBANKING_TRANSFER_OPERATOR_ID_NUMBER?.trim()
  if (fromEnv) return fromEnv
  throw new Error(
    'Falta INTERBANKING_TRANSFER_OPERATOR_ID_NUMBER (documento del operador humano, p. ej. DNI).',
  )
}

export interface InterbankingThirdPartyTransferLineV2 {
  confection_id: string
  request_date: string
  amount: string
  comments?: string
  debit_account: InterbankingTransferAccountV2
  credit_account: InterbankingTransferAccountV2
  concept: string
  disclaimer_accepted: boolean
}

export interface InterbankingConfeccionCommandThirdPartyV2 {
  operator_id_number: string
  operator_country_code: 'AR'
  consolidated_check: boolean
  unified_send: boolean
  resend_validated: boolean
  found_transfers: InterbankingThirdPartyTransferLineV2[]
}

export interface InterbankingSupplierTransferLineV2 {
  confection_id: string
  request_date: string
  amount: string
  comments?: string
  debit_account: InterbankingTransferAccountV2
  credit_account: InterbankingTransferAccountV2
}

export interface InterbankingConfeccionCommandSupplierV2 {
  operator_id_number: string
  operator_country_code: 'AR'
  consolidated_check: boolean
  unified_send: boolean
  resend_validated: boolean
  found_transfers: InterbankingSupplierTransferLineV2[]
}

export interface BuildExternalConfeccionInput {
  confectionId: string
  requestDate: string
  amountPesosString: string
  debit: InterbankingTransferAccountV2
  credit: InterbankingTransferAccountV2
  comments?: string | null
  /** Solo terceros. Si falta, se usa VAR. */
  concept?: string | null
  disclaimerAccepted?: boolean
  /**
   * El schema v2 no tiene campo CUIT (un campo extra responde 1051).
   * Si viene, tiene que ser 11 dígitos; no se manda en el body.
   */
  cuit?: string | null
  consolidatedCheck?: boolean
  unifiedSend?: boolean
  resendValidated?: boolean
  operatorIdNumber?: string
}

function envelopeFlags(input: {
  consolidatedCheck?: boolean
  unifiedSend?: boolean
  resendValidated?: boolean
  operatorIdNumber?: string
}) {
  return {
    operator_id_number: input.operatorIdNumber ?? readOperatorIdNumber(),
    operator_country_code: 'AR' as const,
    consolidated_check: input.consolidatedCheck ?? false,
    unified_send: input.unifiedSend ?? true,
    resend_validated: input.resendValidated ?? true,
  }
}

function commentsOpcional(comments: string | null | undefined): string | undefined {
  const texto = comments?.trim() ?? ''
  if (!texto) return undefined
  return texto.slice(0, 60)
}

function assertCuitSiViene(cuit: string | null | undefined): void {
  if (cuit == null || !cuit.trim()) return
  const digitos = cuit.replace(/\D/g, '')
  if (!/^\d{11}$/.test(digitos)) {
    throw new Error('El CUIT tiene que tener 11 dígitos')
  }
}

export function buildThirdPartyConfeccionBodyV2(
  input: BuildExternalConfeccionInput,
): InterbankingConfeccionCommandThirdPartyV2 {
  assertCuitSiViene(input.cuit)
  const codigo = (input.concept?.trim() || CONCEPTO_TERCEROS_DEFAULT).toUpperCase()
  const concepto = conceptoTercerosPorCodigo(codigo)
  if (!concepto) {
    throw new Error('El motivo del pago no está en la lista del banco')
  }
  if (concepto.requiereDisclaimer && input.disclaimerAccepted !== true) {
    throw new Error('Tenés que aceptar el aviso para este motivo')
  }
  const comments = commentsOpcional(input.comments)
  return {
    ...envelopeFlags(input),
    found_transfers: [
      {
        confection_id: input.confectionId,
        request_date: input.requestDate,
        amount: input.amountPesosString,
        ...(comments ? { comments } : {}),
        debit_account: input.debit,
        credit_account: input.credit,
        concept: concepto.codigo,
        disclaimer_accepted: input.disclaimerAccepted === true,
      },
    ],
  }
}

export function buildSupplierConfeccionBodyV2(
  input: BuildExternalConfeccionInput,
): InterbankingConfeccionCommandSupplierV2 {
  assertCuitSiViene(input.cuit)
  const comments = commentsOpcional(input.comments)
  return {
    ...envelopeFlags(input),
    found_transfers: [
      {
        confection_id: input.confectionId,
        request_date: input.requestDate,
        amount: input.amountPesosString,
        ...(comments ? { comments } : {}),
        debit_account: input.debit,
        credit_account: input.credit,
      },
    ],
  }
}

export function buildOwnAccountConfeccionBodyV2(
  input: BuildOwnAccountConfeccionInput,
): InterbankingConfeccionCommandOwnAccountV2 {
  return {
    operator_id_number: input.operatorIdNumber ?? readOperatorIdNumber(),
    operator_country_code: 'AR',
    consolidated_check: input.consolidatedCheck ?? false,
    unified_send: input.unifiedSend ?? true,
    resend_validated: input.resendValidated ?? true,
    found_transfers: [
      {
        confection_id: input.confectionId,
        request_date: input.requestDate,
        amount: input.amountPesosString,
        debit_account: input.debit,
        credit_account: input.credit,
      },
    ],
  }
}

export function resolveConfeccionUrl(tipo: TransferenciaTipo, apiBaseUrl?: string): string {
  const path = INTERBANKING_CONFECTION_PATH_BY_TIPO[tipo]
  if (!path) {
    throw new Error(`Tipo de transferencia sin endpoint v2 de confección: ${tipo}`)
  }
  const base = (apiBaseUrl ?? loadInterbankingTransferConfig().apiBaseUrl).replace(/\/+$/, '')
  return `${base}${path}`
}

export function buildConfeccionRequestUrl(tipo: TransferenciaTipo): string {
  const cfg = loadInterbankingTransferConfig()
  const url = new URL(resolveConfeccionUrl(tipo, cfg.apiBaseUrl))
  url.searchParams.set('customer-id', cfg.customerId)
  return url.toString()
}

const MAX_CONFECTION_ID_LENGTH = 18

/**
 * Id de confección exigido por Interbanking: solo dígitos, longitud ≤ 18.
 * Base: timestamp ms (~13 dígitos) + sufijo aleatorio para evitar colisiones en el mismo ms.
 */
export function generateInterbankingConfeccionId(): string {
  const ms = String(Date.now())
  if (ms.length > MAX_CONFECTION_ID_LENGTH) {
    return ms.slice(0, MAX_CONFECTION_ID_LENGTH)
  }
  const suffixLen = Math.min(MAX_CONFECTION_ID_LENGTH - ms.length, 5)
  if (suffixLen <= 0) return ms
  const suffix = String(Math.floor(Math.random() * 10 ** suffixLen)).padStart(suffixLen, '0')
  const id = `${ms}${suffix}`
  if (!/^\d+$/.test(id) || id.length > MAX_CONFECTION_ID_LENGTH) {
    throw new Error(`confection_id inválido generado: ${id}`)
  }
  return id
}

/** Formato `amount` desde centavos ARS → string con 2 decimales. */
export function formatInterbankingAmountFromCentavos(centavos: number): string {
  const sign = centavos < 0 ? '-' : ''
  const abs = Math.abs(centavos)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole}.${frac}`
}
