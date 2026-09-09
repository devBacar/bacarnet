/**
 * Prueba local de herramientas de metadata (runRagAssistant).
 *
 *   node backend/scripts/test-rag-metadata-local.mjs
 *   node backend/scripts/test-rag-metadata-local.mjs "¿cuántos archivos hay en Sistemas por tipo?"
 *   node backend/scripts/test-rag-metadata-local.mjs "¿cuántos archivos hay en Cumplimiento?"
 */

import { getDrive } from '../lib/lib/google/driveClient.js'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'
import { getRagConfig } from '../lib/modules/rag/config.js'
import { loadRagCorpus } from '../lib/modules/rag/loadRagCorpus.js'
import { runRagAssistant } from '../lib/modules/rag/runRagAssistant.js'
import {
  buildRegulatoryBlockResponse,
  questionReferencesExcludedArea,
} from '../lib/modules/rag/regulatoryArea.js'

loadTestEnv()
initAdmin()

const question =
  process.argv[2] ?? '¿Cuántos archivos hay en Sistemas, separados por tipo?'
const email = (process.argv[3] ?? 'sistemas.ti@bacarsa.com.ar').trim().toLowerCase()

const config = await getRagConfig()
const excludedInQuestion = questionReferencesExcludedArea(question, config)
if (excludedInQuestion) {
  const blocked = buildRegulatoryBlockResponse(excludedInQuestion, config)
  console.log('=== Bloqueo regulatorio (pre-check) ===')
  console.log(JSON.stringify(blocked.body, null, 2))
  process.exit(0)
}

const started = Date.now()
const drive = await getDrive(email)
const corpus = await loadRagCorpus(config.pilot.governingAreaId)

const result = await runRagAssistant({
  question,
  config,
  searchSubject: email,
  drive,
  corpus,
})

console.log('=== RAG metadata local ===')
console.log(`Usuario: ${email}`)
console.log(`Pregunta: ${question}`)
console.log(`Tools: ${result.toolsUsed.join(', ') || '—'}`)
console.log(`Latencia: ${Date.now() - started} ms`)
console.log('\n--- Respuesta ---')
console.log(result.answer)
if (result.citations.length > 0) {
  console.log('\n--- Fuentes ---')
  for (const [i, c] of result.citations.entries()) {
    console.log(`[${i + 1}] ${c.fileName}`)
  }
}
