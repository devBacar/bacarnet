/** Decodifica snapshot.bin generado por encodeEmbeddingsSnapshot. */
export function decodeEmbeddingsSnapshot(buffer: Buffer): {
  version: number
  chunkCount: number
  dims: number
  vectors: Float32Array
} {
  if (buffer.length < 12) {
    throw new Error('Snapshot RAG demasiado corto')
  }

  const magic = buffer.toString('ascii', 0, 4)
  if (magic !== 'RAG1') {
    throw new Error(`Snapshot RAG magic inválido: ${magic}`)
  }

  const version = buffer.readUInt32LE(4)
  const chunkCount = buffer.readUInt32LE(8)
  if (chunkCount <= 0) {
    throw new Error('Snapshot RAG sin chunks')
  }

  const body = buffer.subarray(12)
  if (body.length % (chunkCount * 4) !== 0) {
    throw new Error('Snapshot RAG tamaño inconsistente')
  }

  const dims = body.length / chunkCount / 4
  if (!Number.isInteger(dims) || dims <= 0) {
    throw new Error('Snapshot RAG dims inválidas')
  }

  const vectors = new Float32Array(chunkCount * dims)
  for (let i = 0; i < chunkCount * dims; i += 1) {
    vectors[i] = body.readFloatLE(i * 4)
  }

  return { version, chunkCount, dims, vectors }
}

export function vectorAt(vectors: Float32Array, dims: number, index: number): Float32Array {
  const start = index * dims
  return vectors.subarray(start, start + dims)
}
