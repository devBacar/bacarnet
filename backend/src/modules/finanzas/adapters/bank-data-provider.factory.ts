import type { BankDataProvider } from './bank-provider.types.js'
import { interbankingProvider } from './interbanking-provider.js'
import { mockBankDataProvider } from './mock-provider.js'

export type FinanzasBankProviderMode = 'mock' | 'interbanking'

const INTERBANKING_ENV_KEYS = [
  'INTERBANKING_CLIENT_ID',
  'INTERBANKING_CLIENT_SECRET',
  'INTERBANKING_CUSTOMER_ID',
  'INTERBANKING_REDIRECT_URL',
  'INTERBANKING_SERVICE_URL',
] as const

export function resolveFinanzasBankProviderMode(
  raw = process.env.FINANZAS_BANK_PROVIDER,
): FinanzasBankProviderMode {
  const mode = raw?.trim().toLowerCase()
  if (mode === 'interbanking') return 'interbanking'
  return 'mock'
}

/** Aviso si hay credenciales Interbanking pero el modo sigue en mock (default). */
export function warnIfInterbankingEnvButMockProvider(env: NodeJS.ProcessEnv = process.env): void {
  if (resolveFinanzasBankProviderMode(env.FINANZAS_BANK_PROVIDER) === 'interbanking') {
    return
  }
  const setKeys = INTERBANKING_ENV_KEYS.filter((key) => Boolean(env[key]?.trim()))
  if (setKeys.length === 0) return

  console.warn(
    '[finanzas] FINANZAS_BANK_PROVIDER no es "interbanking" (valor=%s) pero hay variables INTERBANKING_* (%s); se usa MOCK. Revisá backend/.env.local del proceso Functions.',
    env.FINANZAS_BANK_PROVIDER?.trim() || '(unset)',
    setKeys.join(', '),
  )
}

export function getFinanzasBankDataProvider(): BankDataProvider {
  warnIfInterbankingEnvButMockProvider()
  if (resolveFinanzasBankProviderMode() === 'interbanking') {
    return interbankingProvider
  }
  return mockBankDataProvider
}
