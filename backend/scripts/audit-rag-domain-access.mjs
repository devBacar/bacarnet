/**
 * Cuenta chunks/archivos con domainAccess en el manifest RAG del piloto.
 *
 *   node backend/scripts/audit-rag-domain-access.mjs
 */
import { loadTestEnv, initAdmin } from './get-test-token.mjs'
import { getRagConfig } from '../lib/modules/rag/config.js'
import { loadRagCorpus } from '../lib/modules/rag/loadRagCorpus.js'
import { getEnv } from '../lib/config/env.js'

loadTestEnv()
initAdmin()

const config = await getRagConfig()
const corpus = await loadRagCorpus(config.pilot.governingAreaId)
const allowedDomain = getEnv().allowedEmailDomain

const chunksWithDomain = corpus.chunks.filter((c) => c.domainAccess != null)
const filesWithDomain = new Map()

for (const chunk of chunksWithDomain) {
  const key = chunk.fileId
  if (!filesWithDomain.has(key)) {
    filesWithDomain.set(key, {
      fileId: chunk.fileId,
      fileName: chunk.fileName,
      domain: chunk.domainAccess?.domain ?? null,
      role: chunk.domainAccess?.role ?? null,
      chunkCount: 0,
    })
  }
  filesWithDomain.get(key).chunkCount += 1
}

const bacarsaDomain = chunksWithDomain.filter(
  (c) => (c.domainAccess?.domain ?? '').toLowerCase() === allowedDomain.toLowerCase(),
)
const bacarsaFiles = [...filesWithDomain.values()].filter(
  (f) => (f.domain ?? '').toLowerCase() === allowedDomain.toLowerCase(),
)

console.log('=== domainAccess en índice RAG (piloto Sistemas) ===')
console.log(`Total chunks en corpus: ${corpus.chunks.length}`)
console.log(`Chunks con domainAccess: ${chunksWithDomain.length}`)
console.log(`Archivos distintos con domainAccess: ${filesWithDomain.size}`)
console.log(`Chunks domain=@${allowedDomain}: ${bacarsaDomain.length}`)
console.log(`Archivos domain=@${allowedDomain}: ${bacarsaFiles.length}`)
console.log('')

if (bacarsaFiles.length > 0) {
  console.log('--- Archivos con permiso dominio @bacarsa.com.ar (hasta 25) ---')
  for (const f of bacarsaFiles.slice(0, 25)) {
    console.log(`  • ${f.fileName} (${f.chunkCount} chunks, role=${f.role ?? '?'})`)
  }
  if (bacarsaFiles.length > 25) {
    console.log(`  … y ${bacarsaFiles.length - 25} más`)
  }
}

const onlyReaders = corpus.chunks.filter(
  (c) => !c.domainAccess && c.allowedReaders.length > 0,
)
console.log('')
console.log(`Chunks solo allowedReaders (sin domain): ${onlyReaders.length}`)
