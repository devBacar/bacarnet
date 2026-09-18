/**
 * Prueba redacción sobre Cumplimiento/RESTRINGIDO con el system prompt real + gemini-2.5-pro.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-rag-access-limit-phrasing.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTestEnv, initAdmin } from './get-test-token.mjs'
import { getRagConfig } from '../lib/modules/rag/config.js'
import { buildAssistantSystemInstruction } from '../lib/modules/rag/executeRagTool.js'
import { callVertexGemini } from '../lib/modules/rag/vertexGemini.js'
import { resolveAccessibleAreaLabels } from '../lib/modules/rag/ragReadableLabels.js'
import { RAG_GENERATION_MODEL } from '../lib/modules/rag/constants.js'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const PREVIOUS = resolve(OUT, 'rag-flash-vs-pro-comparison.json')

const QUESTIONS = [
  '¿puedo leer Cumplimiento?',
  '¿Puedo usar el asistente para leer documentos de Cumplimiento?',
  'Necesito ver documentos RESTRINGIDO de Cumplimiento, ¿me los mostrás?',
  '¿Tenés acceso a políticas de Cumplimiento indexadas en el RAG?',
]

loadTestEnv()
initAdmin()

const config = await getRagConfig()
const accessibleAreaLabels = await resolveAccessibleAreaLabels({
  pilotGoverningAreaId: config.pilot.governingAreaId,
  pilotLabel: config.pilot.label,
  excludedGoverningAreaIds: config.excludedGoverningAreaIds,
})
const systemInstruction = buildAssistantSystemInstruction({
  config,
  accessibleAreaLabels,
  isSuperAdmin: false,
})

let beforePro = null
try {
  const prev = JSON.parse(readFileSync(PREVIOUS, 'utf8'))
  beforePro = prev.comparisons?.find((c) => c.id === 'rag_limites')?.pro ?? null
} catch {
  beforePro = null
}

const results = []
for (const question of QUESTIONS) {
  const { text } = await callVertexGemini({
    systemInstruction,
    contents: [{ role: 'user', parts: [{ text: question }] }],
    temperature: 0.2,
    maxOutputTokens: 1024,
  })
  results.push({ question, answer: text.trim() })
}

const payload = {
  model: RAG_GENERATION_MODEL,
  generatedAt: new Date().toISOString(),
  beforeProFromComparisonScript: beforePro,
  after: results,
}

mkdirSync(OUT, { recursive: true })
const outPath = resolve(OUT, 'rag-access-limit-phrasing-after.json')
writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8')

console.log('=== Antes (Pro, script compare, pregunta similar) ===')
console.log(beforePro ?? '(no encontrado)')
console.log('')
console.log(`=== Después (${RAG_GENERATION_MODEL}, system prompt actual) ===`)
for (const item of results) {
  console.log(`\n--- ${item.question} ---`)
  console.log(item.answer)
}
console.log(`\nGuardado: ${outPath}`)
