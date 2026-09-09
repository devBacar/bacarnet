import type { RagIndexedChunk } from './types.js'
import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { isExcludedGoverningArea } from './regulatoryArea.js'
import type { RagConfig } from './types.js'

export function userEmailDomain(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return ''
  return email.slice(at + 1).trim().toLowerCase()
}

export function chunkPassesIndexedAcl(
  chunk: Pick<RagIndexedChunk, 'allowedReaders' | 'domainAccess'>,
  userEmail: string,
): boolean {
  const normalized = userEmail.trim().toLowerCase()
  if (chunk.allowedReaders.includes(normalized)) return true

  const domainAccess = chunk.domainAccess
  if (!domainAccess) return false

  const env = getEnv()
  return (
    domainAccess.domain === userEmailDomain(normalized) &&
    isEmailInAllowedDomain(normalized, env.allowedEmailDomain)
  )
}

export function chunkPassesRegulatoryFilters(
  chunk: Pick<RagIndexedChunk, 'classification' | 'governingAreaId'>,
  config: Pick<RagConfig, 'excludedGoverningAreaIds'>,
): boolean {
  if (chunk.classification === 'RESTRINGIDO') return false
  if (isExcludedGoverningArea(chunk.governingAreaId, config)) return false
  return true
}

export function userTouchesExcludedArea(
  user: { managedAreaIds: string[] },
  config: Pick<RagConfig, 'excludedGoverningAreaIds'>,
): string | null {
  for (const areaId of user.managedAreaIds) {
    if (isExcludedGoverningArea(areaId, config)) return areaId
  }
  return null
}

export type RagChunkContentMap = Record<string, string>

export function resolveChunkContent(
  chunk: RagIndexedChunk,
  contents: RagChunkContentMap,
): string {
  return contents[chunk.id] ?? chunk.textPreview
}
