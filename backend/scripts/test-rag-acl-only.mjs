import { initAdmin, loadTestEnv } from './get-test-token.mjs'
import { getRagConfig } from '../lib/modules/rag/config.js'
import { embedTexts } from '../lib/modules/rag/embeddings.js'
import { loadRagCorpus } from '../lib/modules/rag/loadRagCorpus.js'
import { rankByCosineSimilarity } from '../lib/modules/rag/cosineSimilarity.js'
import {
  chunkPassesIndexedAcl,
  chunkPassesRegulatoryFilters,
  resolveChunkContent,
} from '../lib/modules/rag/chunkAccess.js'

loadTestEnv()
initAdmin()

const question = '¿Cómo instalo el driver ASR de Queclink para las cámaras?'
const users = [
  'implementaciones.it@bacarsa.com.ar',
  'sistemas.ti@bacarsa.com.ar',
  'visual.requester@bacarsa.com.ar',
  'admin@bacarsa.com.ar',
]

const config = await getRagConfig()
const [queryVector] = await embedTexts([question])
const corpus = await loadRagCorpus(config.pilot.governingAreaId)
const ranked = rankByCosineSimilarity(queryVector, corpus.vectors, corpus.dims, 20)

console.log('=== ACL retrieval (sin Drive verify) ===')
console.log(`Pregunta: ${question}\n`)

for (const email of users) {
  const hits = []
  for (const hit of ranked) {
    const chunk = corpus.chunks[hit.index]
    if (!chunk) continue
    if (!chunkPassesRegulatoryFilters(chunk, config)) continue
    if (!chunkPassesIndexedAcl(chunk, email)) continue
    hits.push({ fileName: chunk.fileName, fileId: chunk.fileId, score: hit.score })
    if (hits.length >= 5) break
  }
  console.log(`${email}: ${hits.length} chunk(s) tras ACL`)
  for (const [i, h] of hits.entries()) {
    console.log(`  [${i + 1}] ${h.fileName} (${h.score.toFixed(3)})`)
  }
  console.log('')
}
