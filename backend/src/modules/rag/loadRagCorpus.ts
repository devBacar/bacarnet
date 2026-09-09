import { adminDb } from '../../lib/firebase/admin.js'
import { downloadRagObject } from '../../lib/google/ragStagingStorage.js'
import {
  getRagConfig,
  ragChunksContentObjectPath,
  ragManifestObjectPath,
  ragSnapshotObjectPath,
} from './config.js'
import { decodeEmbeddingsSnapshot } from './decodeEmbeddingsSnapshot.js'
import { RAG_INDEX_STATE_COLLECTION } from './constants.js'
import type { RagChunkContentMap } from './chunkAccess.js'
import type { RagIndexedChunk, RagManifest } from './types.js'

export type LoadedRagCorpus = {
  governingAreaId: string
  manifest: RagManifest
  chunks: RagIndexedChunk[]
  vectors: Float32Array
  dims: number
  contents: RagChunkContentMap
  loadedAt: string
}

const CACHE_TTL_MS = 5 * 60_000
const corpusCache = new Map<string, { expiresAt: number; corpus: LoadedRagCorpus }>()

function parseContentsPayload(raw: string): RagChunkContentMap {
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) return {}

  const out: RagChunkContentMap = {}
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue
    const id = (row as { id?: unknown }).id
    const content = (row as { content?: unknown }).content
    if (typeof id === 'string' && typeof content === 'string' && content.trim()) {
      out[id] = content
    }
  }
  return out
}

export async function getRagIndexState(
  governingAreaId: string,
): Promise<Record<string, unknown> | null> {
  const snap = await adminDb().collection(RAG_INDEX_STATE_COLLECTION).doc(governingAreaId).get()
  if (!snap.exists) return null
  const data = snap.data() ?? {}
  return {
    ...data,
    lastIndexedAt:
      data.lastIndexedAt && typeof data.lastIndexedAt.toDate === 'function'
        ? data.lastIndexedAt.toDate().toISOString()
        : data.lastIndexedAt ?? null,
  }
}

export async function loadRagCorpus(governingAreaId: string): Promise<LoadedRagCorpus> {
  const now = Date.now()
  const cached = corpusCache.get(governingAreaId)
  if (cached && cached.expiresAt > now) {
    return cached.corpus
  }

  const config = await getRagConfig()
  const manifestPath = ragManifestObjectPath(governingAreaId)
  const snapshotPath = ragSnapshotObjectPath(governingAreaId)
  const contentsPath = ragChunksContentObjectPath(governingAreaId)

  const [manifestBuffer, snapshotBuffer] = await Promise.all([
    downloadRagObject(manifestPath),
    downloadRagObject(snapshotPath),
  ])

  const manifest = JSON.parse(manifestBuffer.toString('utf8')) as RagManifest
  const decoded = decodeEmbeddingsSnapshot(snapshotBuffer)

  if (decoded.dims !== config.embeddingDims) {
    throw new Error(
      `Snapshot dims=${decoded.dims}, config=${config.embeddingDims}. Reindexá el área.`,
    )
  }

  if (manifest.chunks.length !== decoded.chunkCount) {
    throw new Error('Manifest y snapshot desincronizados. Reindexá el área.')
  }

  let contents: RagChunkContentMap = {}
  try {
    const contentsBuffer = await downloadRagObject(contentsPath)
    contents = parseContentsPayload(contentsBuffer.toString('utf8'))
  } catch {
    contents = {}
  }

  const corpus: LoadedRagCorpus = {
    governingAreaId,
    manifest,
    chunks: manifest.chunks,
    vectors: decoded.vectors,
    dims: decoded.dims,
    contents,
    loadedAt: manifest.indexedAt,
  }

  corpusCache.set(governingAreaId, { expiresAt: now + CACHE_TTL_MS, corpus })
  return corpus
}

export function clearRagCorpusCache(governingAreaId?: string): void {
  if (governingAreaId) {
    corpusCache.delete(governingAreaId)
    return
  }
  corpusCache.clear()
}
