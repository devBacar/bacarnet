import type { BankDataProvider, CuentaDTO, SaldoDTO, SaldosDiariosCuentaDTO } from './bank-provider.types.js'
import {
  mapInterbankingBalancesResponse,
  mapInterbankingSaldosDiarios,
  type InterbankingBalanceAccount,
} from './interbanking.mapping.js'

type InterbankingClient = {
  getBalances: (queryParams?: Record<string, string>) => Promise<{
    accounts: InterbankingBalanceAccount[]
  }>
}

async function createInterbankingClient(config: InterbankingEnvConfig): Promise<InterbankingClient> {
  const mod = (await import('interbanking-client')) as {
    createClient: (options: InterbankingEnvConfig & { logger?: null }) => InterbankingClient
  }
  return mod.createClient({ ...config, logger: null })
}

export interface InterbankingEnvConfig {
  clientId: string
  clientSecret: string
  redirectUrl: string
  customerId: string
}

export function readInterbankingEnvConfig(
  env: NodeJS.ProcessEnv = process.env,
): InterbankingEnvConfig {
  const clientId = env.INTERBANKING_CLIENT_ID?.trim() ?? ''
  const clientSecret = env.INTERBANKING_CLIENT_SECRET?.trim() ?? ''
  const customerId = env.INTERBANKING_CUSTOMER_ID?.trim() ?? ''
  const redirectUrl =
    env.INTERBANKING_REDIRECT_URL?.trim() ||
    env.INTERBANKING_SERVICE_URL?.trim() ||
    ''

  const missing: string[] = []
  if (!clientId) missing.push('INTERBANKING_CLIENT_ID')
  if (!clientSecret) missing.push('INTERBANKING_CLIENT_SECRET')
  if (!customerId) missing.push('INTERBANKING_CUSTOMER_ID')
  if (!redirectUrl) missing.push('INTERBANKING_REDIRECT_URL (o INTERBANKING_SERVICE_URL)')

  if (missing.length > 0) {
    throw new Error(`Interbanking: faltan variables de entorno: ${missing.join(', ')}`)
  }
  if (!redirectUrl.startsWith('https://')) {
    throw new Error(
      'INTERBANKING_REDIRECT_URL debe incluir https:// y coincidir con la Redirect URL del portal',
    )
  }

  return { clientId, clientSecret, redirectUrl, customerId }
}

type LoadedSnapshot = { accounts: CuentaDTO[]; balances: SaldoDTO[] }

/**
 * Integración Interbanking (plan Información Financiera).
 * OAuth client_credentials, customer-id en query, saldos vía GET /accounts/balances.
 */
export class InterbankingProvider implements BankDataProvider {
  private loadPromise: Promise<LoadedSnapshot> | null = null

  private async loadSnapshot(): Promise<LoadedSnapshot> {
    if (!this.loadPromise) {
      this.loadPromise = this.fetchSnapshot().finally(() => {
        this.loadPromise = null
      })
    }
    return this.loadPromise
  }

  private async fetchSnapshot(): Promise<LoadedSnapshot> {
    const config = readInterbankingEnvConfig()
    const client = await createInterbankingClient(config)
    const data = await client.getBalances()
    const accounts = Array.isArray(data.accounts) ? data.accounts : []
    if (accounts.length > 0) {
      console.info(
        '[finanzas/interbanking] respuesta cruda (1 cuenta, antes de mapear): %s',
        JSON.stringify(accounts[0]),
      )
    }
    const mapped = mapInterbankingBalancesResponse(accounts)
    if (mapped.accounts.length === 0) {
      throw new Error(
        'Interbanking: la consulta de saldos no devolvió cuentas mapeables (034 Patagonia, 305 Julio, 020 Córdoba)',
      )
    }
    return mapped
  }

  async getAccounts(): Promise<CuentaDTO[]> {
    const snap = await this.loadSnapshot()
    return snap.accounts
  }

  async getBalances(): Promise<SaldoDTO[]> {
    const snap = await this.loadSnapshot()
    return snap.balances
  }

  async getSaldosDiarios(input: { desde: string; hasta: string }): Promise<SaldosDiariosCuentaDTO[]> {
    const config = readInterbankingEnvConfig()
    const client = await createInterbankingClient(config)
    const data = await client.getBalances({
      'date-since': input.desde,
      'date-until': input.hasta,
    })
    const accounts = Array.isArray(data.accounts) ? data.accounts : []
    return mapInterbankingSaldosDiarios(accounts)
  }
}

export const interbankingProvider = new InterbankingProvider()
