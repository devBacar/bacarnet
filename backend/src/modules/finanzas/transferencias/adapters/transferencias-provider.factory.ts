import { interbankingTransferenciasProvider } from './interbanking-transferencias-provider.js'
import { loadInterbankingTransferConfig } from './interbanking-transfer.config.js'
import { mockTransferenciasProvider } from './mock-transferencias-provider.js'
import type { TransferenciasDataProvider } from './transferencias-provider.types.js'

export type FinanzasTransferenciasProviderMode = 'mock' | 'interbanking'

export function resolveFinanzasTransferenciasProviderMode(): FinanzasTransferenciasProviderMode {
  const mode = process.env.FINANZAS_TRANSFERENCIAS_PROVIDER?.trim().toLowerCase()
  if (mode === 'interbanking') return 'interbanking'
  return 'mock'
}

export function getFinanzasTransferenciasProvider(): TransferenciasDataProvider {
  const mode = resolveFinanzasTransferenciasProviderMode()
  if (mode === 'interbanking') {
    loadInterbankingTransferConfig()
    return interbankingTransferenciasProvider
  }
  return mockTransferenciasProvider
}
