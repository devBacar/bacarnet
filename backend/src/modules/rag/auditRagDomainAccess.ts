import { getEnv } from '../../config/env.js'
import { getRagConfig } from './config.js'
import { loadRagCorpus } from './loadRagCorpus.js'

export type RagDomainAccessAuditSummary = {
  totalChunks: number
  chunksWithDomainAccess: number
  distinctFilesWithDomainAccess: number
  allowedEmailDomain: string
  chunksWithOrgDomain: number
  sampleFileNames: string[]
}

export async function auditRagDomainAccessInPilotIndex(): Promise<RagDomainAccessAuditSummary> {
  const config = await getRagConfig()
  const corpus = await loadRagCorpus(config.pilot.governingAreaId)
  const allowedDomain = getEnv().allowedEmailDomain.trim().toLowerCase()

  const chunksWithDomain = corpus.chunks.filter((chunk) => chunk.domainAccess != null)
  const filesWithDomain = new Map<string, string>()

  for (const chunk of chunksWithDomain) {
    if (!filesWithDomain.has(chunk.fileId)) {
      filesWithDomain.set(chunk.fileId, chunk.fileName)
    }
  }

  const chunksWithOrgDomain = chunksWithDomain.filter(
    (chunk) => (chunk.domainAccess?.domain ?? '').toLowerCase() === allowedDomain,
  )

  return {
    totalChunks: corpus.chunks.length,
    chunksWithDomainAccess: chunksWithDomain.length,
    distinctFilesWithDomainAccess: filesWithDomain.size,
    allowedEmailDomain: allowedDomain,
    chunksWithOrgDomain: chunksWithOrgDomain.length,
    sampleFileNames: [...filesWithDomain.values()].slice(0, 5),
  }
}
