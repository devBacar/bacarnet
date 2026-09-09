export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  const len = Math.min(a.length, b.length)
  if (len === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < len; i += 1) {
    const av = a[i]
    const bv = b[i]
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }

  if (normA <= 0 || normB <= 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function rankByCosineSimilarity(
  queryVector: number[],
  corpusVectors: Float32Array,
  dims: number,
  limit: number,
): Array<{ index: number; score: number }> {
  const chunkCount = Math.floor(corpusVectors.length / dims)
  const scored: Array<{ index: number; score: number }> = []

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * dims
    const slice = corpusVectors.subarray(start, start + dims)
    scored.push({ index, score: cosineSimilarity(queryVector, slice) })
  }

  scored.sort((left, right) => right.score - left.score)
  return scored.slice(0, Math.max(1, limit))
}
