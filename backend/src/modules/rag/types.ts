export type RagPilotArea = {
  governingAreaId: string
  driveFolderId: string
  label: string
}

export type RagConfig = {
  enabled: boolean
  stagingBucket: string
  stagingLocation: string
  pilot: RagPilotArea
  excludedGoverningAreaIds: string[]
  excludedAreaLabels: Record<string, string>
  regulatoryMessage: string
  chunkChars: number
  chunkOverlapChars: number
  embeddingDims: number
  queryMemoryMiB: number
}

export type RagMemoryEstimate = {
  chunkCount: number
  embeddingBytes: number
  manifestBytesEst: number
  snapshotBytesEst: number
  queryPeakBytesEst: number
  margin512MiB: number
  margin256MiB: number
}

export type RagDomainAccess = {
  domain: string
  role: 'reader' | 'writer' | 'commenter'
}

export type RagIndexedChunk = {
  id: string
  fileId: string
  fileName: string
  webViewLink: string | null
  mimeType: string
  classification: string
  governingAreaId: string | null
  allowedReaders: string[]
  domainAccess: RagDomainAccess | null
  chunkIndex: number
  charStart: number
  charEnd: number
  textPreview: string
  embeddingIndex: number
}

export type RagManifest = {
  version: 1
  governingAreaId: string
  pilotLabel: string
  indexedAt: string
  chunkChars: number
  chunkOverlapChars: number
  embeddingDims: number
  embeddingModel: string
  chunks: RagIndexedChunk[]
}

export type RagIndexStats = {
  foldersVisited: number
  filesSeen: number
  filesIndexed: number
  chunksWritten: number
  skippedRestricted: number
  skippedExcludedArea: number
  skippedNoText: number
  skippedUnsupported: number
  errors: Array<{ fileId: string; fileName: string; reason: string }>
}

export type RagIndexResult = {
  governingAreaId: string
  dryRun: boolean
  embedded: boolean
  stats: RagIndexStats
  memoryEstimate: RagMemoryEstimate
  manifestPath: string
  snapshotPath: string
}
