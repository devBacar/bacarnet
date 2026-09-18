import type { BankDataProvider, CuentaDTO, SaldoDTO } from './bank-provider.types.js'

/**
 * Integración futura con Interbanking (plan Información Financiera).
 *
 * Relevamiento pendiente de implementación:
 * - OAuth2 client_credentials → auth.interbanking.com.ar/cas/oidc/accessToken (token ~2 h).
 * - Base URL api-gw.interbanking.com.ar/api/prod/v1.
 * - customer-id como query param, no header.
 * - Saldos y movimientos usan URLs base distintas (no reutilizar /v1 para ambos).
 * - Movimientos históricos: rango máximo 64 días por consulta.
 * - Credenciales vía Secret Manager / defineSecret en Cloud Functions.
 */
export class InterbankingProvider implements BankDataProvider {
  async getAccounts(): Promise<CuentaDTO[]> {
    throw new Error('InterbankingProvider no implementado — pendiente confirmación comercial')
  }

  async getBalances(): Promise<SaldoDTO[]> {
    throw new Error('InterbankingProvider no implementado — pendiente confirmación comercial')
  }
}
