import type { RagMemoryEstimate } from './types.js'

const BYTES_PER_FLOAT32 = 4
const RUNTIME_OVERHEAD_BYTES = 64 * 1024 * 1024
const MANIFEST_BYTES_PER_CHUNK = 600

export function estimateChunksFromTextBytes(
  textBytes: number,
  chunkChars: number,
  chunkOverlapChars: number,
): number {
  if (textBytes <= 0) return 0
  if (textBytes <= chunkChars) return 1
  const stride = Math.max(1, chunkChars - chunkOverlapChars)
  return 1 + Math.ceil((textBytes - chunkChars) / stride)
}

export function estimateRagMemoryUsage(input: {
  chunkCount: number
  embeddingDims?: number
}): RagMemoryEstimate {
  const embeddingDims = input.embeddingDims ?? 768
  const chunkCount = Math.max(0, input.chunkCount)
  const embeddingBytes = chunkCount * embeddingDims * BYTES_PER_FLOAT32
  const manifestBytesEst = chunkCount * MANIFEST_BYTES_PER_CHUNK
  const snapshotBytesEst = embeddingBytes + manifestBytesEst
  const queryPeakBytesEst = snapshotBytesEst + RUNTIME_OVERHEAD_BYTES
  const mem512 = 512 * 1024 * 1024
  const mem256 = 256 * 1024 * 1024

  return {
    chunkCount,
    embeddingBytes,
    manifestBytesEst,
    snapshotBytesEst,
    queryPeakBytesEst,
    margin512MiB: mem512 - queryPeakBytesEst,
    margin256MiB: mem256 - queryPeakBytesEst,
  }
}
