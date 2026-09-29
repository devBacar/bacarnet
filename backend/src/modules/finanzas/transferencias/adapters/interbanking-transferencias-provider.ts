import type { TransferenciaTipo } from '../domain/transferencia.types.js'
import type {
  ConfeccionTransferenciaItem,
  ConfeccionTransferenciaResult,
  ConsultaProcesoResult,
  TransferenciasDataProvider,
} from './transferencias-provider.types.js'
import {
  assertCuentaDebitoCompatible,
  resolveInterbankingCreditAccountByCbu,
  resolveInterbankingDebitAccount,
} from './interbanking-cuenta.routing.js'
import {
  buildConfeccionRequestUrl,
  buildOwnAccountConfeccionBodyV2,
  type BuildOwnAccountConfeccionInput,
  type InterbankingConfeccionCommandOwnAccountV2,
  formatInterbankingAmountFromCentavos,
  generateInterbankingConfeccionId,
  INTERBANKING_CONFECTION_PATH_BY_TIPO,
} from './interbanking-transfer-confection.js'
import { fetchInterbankingTransferAccessToken } from './interbanking-transfer-auth.js'
import { loadInterbankingTransferConfig } from './interbanking-transfer.config.js'
import { parseInterbankingConfeccionResponse } from './interbanking-transfer-response.js'
import { getCuentaDocument } from '../../services/cuentas.repository.js'

export interface InterbankingConfeccionPostResult {
  httpStatus: number
  requestUrl: string
  requestBody: unknown
  responseBody: unknown
  responseText: string
  parsed: ReturnType<typeof parseInterbankingConfeccionResponse>
}

/** Corte de seguridad: sin esta variable no sale ninguna confección real a Interbanking. */
function assertTransferenciasRealesHabilitadas(): void {
  if (process.env.INTERBANKING_TRANSFER_ALLOW_REAL !== 'true') {
    throw new Error('Transferencias reales deshabilitadas: falta INTERBANKING_TRANSFER_ALLOW_REAL=true')
  }
}

function requestDateArgentina(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function mapPostToProviderResult(post: InterbankingConfeccionPostResult): ConfeccionTransferenciaResult {
  const { parsed } = post
  if (parsed.estadoInmediato === 'rechazada') {
    return {
      operationId: parsed.operationId ?? '',
      processId: parsed.processId,
      estadoInmediato: 'confeccionada',
      erroresCodigos: parsed.failedCodes.length ? parsed.failedCodes : ['interbanking.confeccion.rechazada'],
    }
  }
  return {
    operationId: parsed.operationId ?? '',
    processId: parsed.processId,
    estadoInmediato: parsed.estadoInmediato === 'pendiente_proceso' ? 'pendiente_proceso' : 'confeccionada',
    erroresCodigos: null,
  }
}

export class InterbankingTransferenciasProvider implements TransferenciasDataProvider {
  private readonly config = loadInterbankingTransferConfig()

  async obtainAccessToken() {
    return fetchInterbankingTransferAccessToken({ config: this.config })
  }

  confeccionUrlForTipo(tipo: ConfeccionTransferenciaItem['tipo']): string {
    return buildConfeccionRequestUrl(tipo)
  }

  async postConfeccionV2(
    tipo: TransferenciaTipo,
    body: InterbankingConfeccionCommandOwnAccountV2 | Record<string, unknown>,
  ): Promise<InterbankingConfeccionPostResult> {
    assertTransferenciasRealesHabilitadas()
    const path = INTERBANKING_CONFECTION_PATH_BY_TIPO[tipo]
    if (!path) {
      throw new Error(`Tipo de transferencia sin endpoint v2 de confección: ${tipo}`)
    }

    const requestUrl = buildConfeccionRequestUrl(tipo)
    const { accessToken } = await fetchInterbankingTransferAccessToken({
      config: this.config,
      forceRefresh: true,
    })

    const res = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        client_id: this.config.clientId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const responseText = await res.text()
    let responseBody: unknown = responseText
    try {
      responseBody = responseText ? JSON.parse(responseText) : null
    } catch {
      responseBody = responseText
    }

    const parsed = parseInterbankingConfeccionResponse(res.status, responseBody)

    return {
      httpStatus: res.status,
      requestUrl,
      requestBody: body,
      responseBody,
      responseText,
      parsed,
    }
  }

  async confeccionarCuentasPropiasV2(
    input: BuildOwnAccountConfeccionInput,
  ): Promise<InterbankingConfeccionPostResult> {
    const body = buildOwnAccountConfeccionBodyV2(input)
    return this.postConfeccionV2('cuentas_propias', body)
  }

  async confeccionarLote(items: ConfeccionTransferenciaItem[]): Promise<ConfeccionTransferenciaResult> {
    assertTransferenciasRealesHabilitadas()
    if (items.length !== 1) {
      throw new Error('Confección Interbanking v2: por ahora solo un ítem por lote.')
    }
    const item = items[0]!
    if (item.tipo !== 'cuentas_propias') {
      throw new Error(`Confección Interbanking v2 no implementada para tipo ${item.tipo}`)
    }

    const cuenta = await getCuentaDocument(item.cuentaDebitoId)
    if (!cuenta) throw new Error('Cuenta de débito no encontrada')
    assertCuentaDebitoCompatible(cuenta.data)

    const debit = resolveInterbankingDebitAccount(cuenta.id)
    const credit = resolveInterbankingCreditAccountByCbu(item.cuentaCreditoCbu)

    const post = await this.confeccionarCuentasPropiasV2({
      confectionId: generateInterbankingConfeccionId(),
      requestDate: requestDateArgentina(),
      amountPesosString: formatInterbankingAmountFromCentavos(item.montoCentavos),
      debit,
      credit,
    })

    if (post.httpStatus >= 400 && post.parsed.failedCodes.length === 0) {
      return {
        operationId: '',
        processId: null,
        estadoInmediato: 'confeccionada',
        erroresCodigos: [`interbanking.http.${post.httpStatus}`],
      }
    }

    return mapPostToProviderResult(post)
  }

  async consultarProceso(_processId: string): Promise<ConsultaProcesoResult> {
    throw new Error('Consulta de proceso Interbanking no implementada aún')
  }
}

let defaultProvider: InterbankingTransferenciasProvider | null = null

export function getInterbankingTransferenciasProvider(): InterbankingTransferenciasProvider {
  if (!defaultProvider) {
    defaultProvider = new InterbankingTransferenciasProvider()
  }
  return defaultProvider
}

export const interbankingTransferenciasProvider = new Proxy({} as InterbankingTransferenciasProvider, {
  get(_target, prop, receiver) {
    return Reflect.get(getInterbankingTransferenciasProvider(), prop, receiver)
  },
})
