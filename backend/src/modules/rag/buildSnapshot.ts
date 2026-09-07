import type { RagIndexedChunk, RagManifest } from './types.js'
import { RAG_EMBEDDING_MODEL } from './embeddings.js'

export function buildRagManifest(input: {
  governingAreaId: string
  pilotLabel: string
  chunkChars: number
  chunkOverlapChars: number
  embeddingDims: number
  chunks: RagIndexedChunk[]
}): RagManifest {
  return {
    version: 1,
    governingAreaId: input.governingAreaId,
    pilotLabel: input.pilotLabel,
    indexedAt: new Date().toISOString(),
    chunkChars: input.chunkChars,
    chunkOverlapChars: input.chunkOverlapChars,
    embeddingDims: input.embeddingDims,
    embeddingModel: RAG_EMBEDDING_MODEL,
    chunks: input.chunks,
  }
}

export function makeChunkId(fileId: string, chunkIndex: number): string {
  return `${fileId}_${chunkIndex}`
}
