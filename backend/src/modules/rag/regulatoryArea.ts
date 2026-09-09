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

const EXCLUDED_AREA_KEYWORDS = ['cumplimiento', 'uif', 'restringido']

export function questionReferencesExcludedArea(
  question: string,
  config: Pick<RagConfig, 'excludedGoverningAreaIds' | 'excludedAreaLabels'>,
): string | null {
  const normalized = question.trim().toLowerCase()
  if (!normalized) return null

  for (const keyword of EXCLUDED_AREA_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return config.excludedGoverningAreaIds[0] ?? null
    }
  }

  for (const areaId of config.excludedGoverningAreaIds) {
    const label = config.excludedAreaLabels[areaId]
    if (label && normalized.includes(label.trim().toLowerCase())) {
      return areaId
    }
  }

  return null
}

export function areaLabelReferencesExcludedArea(
  areaLabel: string | null | undefined,
  config: Pick<RagConfig, 'excludedGoverningAreaIds' | 'excludedAreaLabels'>,
): string | null {
  if (!areaLabel?.trim()) return null
  const normalized = areaLabel.trim().toLowerCase()

  for (const keyword of EXCLUDED_AREA_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return config.excludedGoverningAreaIds[0] ?? null
    }
  }

  for (const areaId of config.excludedGoverningAreaIds) {
    const label = config.excludedAreaLabels[areaId]
    if (label && normalized.includes(label.trim().toLowerCase())) {
      return areaId
    }
  }

  return null
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
