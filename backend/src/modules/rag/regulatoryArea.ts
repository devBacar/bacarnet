import type { RagConfig } from './types.js'
import { RAG_REGULATORY_ERROR_CODE } from './constants.js'

export function isExcludedGoverningArea(
  governingAreaId: string | null | undefined,
  config: Pick<RagConfig, 'excludedGoverningAreaIds'>,
): boolean {
  if (!governingAreaId) return false
  return config.excludedGoverningAreaIds.includes(governingAreaId)
}

export function regulatoryAreaLabel(
  governingAreaId: string,
  config: Pick<RagConfig, 'excludedAreaLabels'>,
): string {
  return config.excludedAreaLabels[governingAreaId] ?? 'esta área'
}

export function buildRegulatoryBlockResponse(
  governingAreaId: string,
  config: Pick<RagConfig, 'regulatoryMessage' | 'excludedAreaLabels'>,
) {
  const label = regulatoryAreaLabel(governingAreaId, config)
  const message =
    config.regulatoryMessage.includes('Cumplimiento') || label === 'Cumplimiento'
      ? config.regulatoryMessage
      : `Esta función no está disponible para documentos de ${label} por motivos regulatorios.`

  return {
    status: 403 as const,
    body: {
      error: message,
      code: RAG_REGULATORY_ERROR_CODE,
      governingAreaId,
      areaLabel: label,
    },
  }
}
