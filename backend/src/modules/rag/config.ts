import { adminDb } from '../../lib/firebase/admin.js'
import { getEnv } from '../../config/env.js'
import {
  RAG_CHUNK_CHARS,
  RAG_CHUNK_OVERLAP_CHARS,
  RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID,
  RAG_DEFAULT_REGULATORY_MESSAGE,
  RAG_EMBEDDING_DIMS,
  RAG_PILOT_DRIVE_FOLDER_ID,
  RAG_PILOT_GOVERNING_AREA_ID,
  RAG_PILOT_LABEL,
  RAG_QUERY_MEMORY_MIB,
  RAG_SETTINGS_COLLECTION,
  RAG_SETTINGS_DOC,
} from './constants.js'
import type { RagConfig } from './types.js'

const CACHE_TTL_MS = 60_000

let cached: { loadedAt: number; config: RagConfig } | null = null

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function asLabelMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, label] of Object.entries(value)) {
    if (typeof label === 'string' && label.trim()) {
      out[key] = label.trim()
    }
  }
  return out
}

export function defaultRagConfig(): RagConfig {
  const env = getEnv()
  return {
    enabled: false,
    stagingBucket: env.ragStagingBucket,
    stagingLocation: env.ragStagingLocation,
    pilot: {
      governingAreaId: RAG_PILOT_GOVERNING_AREA_ID,
      driveFolderId: RAG_PILOT_DRIVE_FOLDER_ID,
      label: RAG_PILOT_LABEL,
    },
    excludedGoverningAreaIds: [RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID],
    excludedAreaLabels: {
      [RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID]: 'Cumplimiento',
    },
    regulatoryMessage: RAG_DEFAULT_REGULATORY_MESSAGE,
    chunkChars: RAG_CHUNK_CHARS,
    chunkOverlapChars: RAG_CHUNK_OVERLAP_CHARS,
    embeddingDims: RAG_EMBEDDING_DIMS,
    queryMemoryMiB: RAG_QUERY_MEMORY_MIB,
  }
}

export async function getRagConfig(): Promise<RagConfig> {
  const now = Date.now()
  if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
    return cached.config
  }

  const base = defaultRagConfig()
  const snap = await adminDb().collection(RAG_SETTINGS_COLLECTION).doc(RAG_SETTINGS_DOC).get()
  if (!snap.exists) {
    cached = { loadedAt: now, config: base }
    return base
  }

  const data = snap.data() ?? {}
  const pilot = data.pilot && typeof data.pilot === 'object' ? data.pilot : {}

  const config: RagConfig = {
    ...base,
    enabled: data.enabled === true,
    stagingBucket:
      typeof data.stagingBucket === 'string' && data.stagingBucket.trim()
        ? data.stagingBucket.trim()
        : base.stagingBucket,
    stagingLocation:
      typeof data.stagingLocation === 'string' && data.stagingLocation.trim()
        ? data.stagingLocation.trim()
        : base.stagingLocation,
    pilot: {
      governingAreaId:
        typeof pilot.governingAreaId === 'string' && pilot.governingAreaId.trim()
          ? pilot.governingAreaId.trim()
          : base.pilot.governingAreaId,
      driveFolderId:
        typeof pilot.driveFolderId === 'string' && pilot.driveFolderId.trim()
          ? pilot.driveFolderId.trim()
          : base.pilot.driveFolderId,
      label:
        typeof pilot.label === 'string' && pilot.label.trim()
          ? pilot.label.trim()
          : base.pilot.label,
    },
    excludedGoverningAreaIds: asStringArray(data.excludedGoverningAreaIds).length
      ? asStringArray(data.excludedGoverningAreaIds)
      : base.excludedGoverningAreaIds,
    excludedAreaLabels: {
      ...base.excludedAreaLabels,
      ...asLabelMap(data.excludedAreaLabels),
    },
    regulatoryMessage:
      typeof data.regulatoryMessage === 'string' && data.regulatoryMessage.trim()
        ? data.regulatoryMessage.trim()
        : base.regulatoryMessage,
    chunkChars:
      typeof data.chunkChars === 'number' && data.chunkChars > 256
        ? Math.floor(data.chunkChars)
        : base.chunkChars,
    chunkOverlapChars:
      typeof data.chunkOverlapChars === 'number' && data.chunkOverlapChars >= 0
        ? Math.floor(data.chunkOverlapChars)
        : base.chunkOverlapChars,
    embeddingDims:
      typeof data.embeddingDims === 'number' && data.embeddingDims > 0
        ? Math.floor(data.embeddingDims)
        : base.embeddingDims,
    queryMemoryMiB:
      typeof data.queryMemoryMiB === 'number' && data.queryMemoryMiB >= 256
        ? Math.floor(data.queryMemoryMiB)
        : base.queryMemoryMiB,
  }

  cached = { loadedAt: now, config }
  return config
}

export function clearRagConfigCache(): void {
  cached = null
}

export function ragSnapshotObjectPath(governingAreaId: string, version = 'current'): string {
  return `areas/${governingAreaId}/${version}/snapshot.bin`
}

export function ragManifestObjectPath(governingAreaId: string, version = 'current'): string {
  return `areas/${governingAreaId}/${version}/manifest.json`
}

export function ragChunksContentObjectPath(governingAreaId: string, version = 'current'): string {
  return `areas/${governingAreaId}/${version}/chunks-content.json`
}
