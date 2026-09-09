/**
 * Simula POST /api/drive/ask localmente (misma lógica que askDriveRag) para evaluar
 * respuestas y ACL sin depender de rag.enabled en HTTP.
 *
 *   node backend/scripts/test-rag-ask-local.mjs "pregunta" email@bacarsa.com.ar
 */

import { getDrive } from '../lib/lib/google/driveClient.js'
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
import { generateRagAnswer } from '../lib/modules/rag/generateRagAnswer.js'

loadTestEnv()
initAdmin()

const question = process.argv[2] ?? '¿Cómo instalo el driver ASR de Queclink para las cámaras?'
const email = (process.argv[3] ?? 'implementaciones.it@bacarsa.com.ar').trim().toLowerCase()

async function askAs(email) {
  const started = Date.now()
  const config = await getRagConfig()
  const searchSubject = email
  const [queryVector] = await embedTexts([question])
  const corpus = await loadRagCorpus(config.pilot.governingAreaId)
  const ranked = rankByCosineSimilarity(queryVector, corpus.vectors, corpus.dims, 20)

  const drive = await getDrive(searchSubject)
  const verifiedFileIds = new Set()
  const citations = []

  for (const hit of ranked) {
    if (citations.length >= 5) break
    const chunk = corpus.chunks[hit.index]
    if (!chunk) continue
    if (!chunkPassesRegulatoryFilters(chunk, config)) continue
    if (!chunkPassesIndexedAcl(chunk, searchSubject)) continue

    if (!verifiedFileIds.has(chunk.fileId)) {
      try {
        await drive.files.get({ fileId: chunk.fileId, supportsAllDrives: true, fields: 'id,trashed' })
        verifiedFileIds.add(chunk.fileId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('invalid_grant') || msg.includes('Invalid email')) {
          // Usuario sin cuenta Workspace / DWD: bloqueo total (equivalente a sin acceso Drive)
          continue
        }
        continue
      }
    }

    citations.push({
      fileId: chunk.fileId,
      fileName: chunk.fileName,
      webViewLink: chunk.webViewLink,
      chunkIndex: chunk.chunkIndex,
      excerpt: resolveChunkContent(chunk, corpus.contents),
      score: hit.score,
    })
  }

  let answer = '(sin Gemini)'
  try {
    answer = await generateRagAnswer({ question, citations })
  } catch (err) {
    answer = `[Gemini error: ${err instanceof Error ? err.message : err}]`
  }
  return {
    email: searchSubject,
    latencyMs: Date.now() - started,
    citations,
    answer,
  }
}

console.log('=== RAG ask local (pipeline prod) ===')
console.log(`Pregunta: ${question}`)
console.log('')

for (const userEmail of [email, 'visual.requester@bacarsa.com.ar', 'sistemas.ti@bacarsa.com.ar']) {
  const result = await askAs(userEmail)
  console.log('='.repeat(72))
  console.log(`Usuario: ${result.email} · ${result.latencyMs} ms · ${result.citations.length} fuente(s)`)
  console.log('\n--- Respuesta ---')
  console.log(result.answer)
  console.log('\n--- Fuentes ---')
  for (const [i, c] of result.citations.entries()) {
    console.log(`[${i + 1}] ${c.fileName} (score=${c.score.toFixed(3)})`)
    console.log(`    ${String(c.excerpt).slice(0, 220)}…`)
  }
  console.log('')
}
