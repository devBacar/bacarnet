import { mockTransferenciasProvider } from './mock-transferencias-provider.js'
import type { TransferenciasDataProvider } from './transferencias-provider.types.js'

export type FinanzasTransferenciasProviderMode = 'mock'

export function resolveFinanzasTransferenciasProviderMode(): FinanzasTransferenciasProviderMode {
  const mode = process.env.FINANZAS_TRANSFERENCIAS_PROVIDER?.trim().toLowerCase()
  if (mode === 'interbanking') {
    console.warn(
      '[finanzas/transferencias] FINANZAS_TRANSFERENCIAS_PROVIDER=interbanking aún no implementado; usando MOCK.',
    )
  }
  return 'mock'
}

export function getFinanzasTransferenciasProvider(): TransferenciasDataProvider {
  resolveFinanzasTransferenciasProviderMode()
  return mockTransferenciasProvider
}
