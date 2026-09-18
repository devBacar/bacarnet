/**
 * Valida callVertexGemini / tool calling en cada superficie que usa el modelo de generación.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-vertex-gemini-surfaces.mjs
 */
import { loadTestEnv, initAdmin } from './get-test-token.mjs'
import { RAG_GENERATION_MODEL } from '../lib/modules/rag/constants.js'
import { callVertexGemini } from '../lib/modules/rag/vertexGemini.js'
import { buildRagToolDeclarations } from '../lib/modules/rag/ragToolDeclarations.js'
import { extractActionPlan } from '../lib/modules/rag/extractActionPlan.js'
import { todayInTimeZone } from '../lib/modules/assistant-actions/calendarDateTime.js'
import { generateMinutaDiagnosticoDraftFromProblematica } from '../lib/modules/helpdesk/generateMinutaDiagnosticoDraft.js'

loadTestEnv()
initAdmin()

function pass(label, detail = '') {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
}
function fail(label, detail = '') {
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  process.exitCode = 1
}

console.log(`Modelo activo: ${RAG_GENERATION_MODEL}\n`)

if (RAG_GENERATION_MODEL !== 'gemini-2.5-pro') {
  fail('RAG_GENERATION_MODEL', `esperaba gemini-2.5-pro, got ${RAG_GENERATION_MODEL}`)
}

// 1) Asistente RAG — tool calling (declaraciones reales)
try {
  const tools = buildRagToolDeclarations(false)
  const result = await callVertexGemini({
    systemInstruction:
      'Debés invocar herramientas cuando corresponda. No respondas con texto libre si el usuario pide contar archivos.',
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Llamá count_files_by_type ahora (sin areaLabel).' }],
      },
    ],
    tools,
    temperature: 0,
    maxOutputTokens: 1024,
  })
  if (result.functionCalls.some((c) => c.name === 'count_files_by_type')) {
    pass('runRagAssistant / tool declarations', 'count_files_by_type invocado')
  } else {
    fail('runRagAssistant / tool declarations', `calls=${JSON.stringify(result.functionCalls)} text=${result.text.slice(0, 80)}`)
  }
} catch (err) {
  fail('runRagAssistant / tool declarations', err instanceof Error ? err.message : String(err))
}

// 2) summarizeDocument — generación sobre texto fijo
try {
  const doc = await callVertexGemini({
    systemInstruction: 'Resumí en 2 viñetas en español. Solo el contenido provisto.',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Documento: Manual VPN\n\nContenido:\n1. Instalar cliente.\n2. Autenticarse con usuario corporativo.\n3. No compartir credenciales.',
          },
        ],
      },
    ],
    temperature: 0.2,
    maxOutputTokens: 256,
  })
  if (doc.text.trim().length > 20) pass('summarizeDocument', doc.text.slice(0, 100).replace(/\n/g, ' '))
  else fail('summarizeDocument', 'respuesta vacía')
} catch (err) {
  fail('summarizeDocument', err instanceof Error ? err.message : String(err))
}

// 3) gmailReadTools (summarize_email path) — mismo patrón de prompt
try {
  const mail = await callVertexGemini({
    systemInstruction: 'Resumí correos en español de forma concisa.',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'De: jefe@sistemas.test\nAsunto: Mantenimiento servidor\n\nContenido:\nEl domingo 02:00 habrá reinicio del servidor de archivos. Avisar a usuarios.',
          },
        ],
      },
    ],
    temperature: 0.2,
    maxOutputTokens: 256,
  })
  if (mail.text.trim().length > 15) pass('gmailReadTools / summarize_email', mail.text.slice(0, 90).replace(/\n/g, ' '))
  else fail('gmailReadTools / summarize_email', 'vacío')
} catch (err) {
  fail('gmailReadTools / summarize_email', err instanceof Error ? err.message : String(err))
}

// 4) extractActionPlan — submit_action_plan tool
try {
  const plan = await extractActionPlan({
    question: 'Enviá un mail a sistemas@bacarsa.com.ar con asunto Prueba y cuerpo Hola.',
    history: [],
    context: { referenceDate: todayInTimeZone() },
  })
  if (plan?.plan?.actions?.length >= 1) {
    pass('extractActionPlan', `${plan.plan.actions.length} acción(es), kind=${plan.plan.actions[0]?.kind}`)
  } else {
    fail('extractActionPlan', 'sin acciones')
  }
} catch (err) {
  fail('extractActionPlan', err instanceof Error ? err.message : String(err))
}

// 5) generateMinutaDiagnosticoDraft
try {
  const minuta = await generateMinutaDiagnosticoDraftFromProblematica({
    problematica: 'Los usuarios no pueden acceder al ERP desde la VPN externa desde el lunes.',
    areaNombre: 'Sistemas',
    urgencia: 'alta',
  })
  if (minuta?.alcance?.trim()) {
    pass('generateMinutaDiagnosticoDraft', `alcance: ${minuta.alcance.slice(0, 80)}…`)
  } else {
    fail('generateMinutaDiagnosticoDraft', JSON.stringify(minuta))
  }
} catch (err) {
  fail('generateMinutaDiagnosticoDraft', err instanceof Error ? err.message : String(err))
}

console.log('\nDone.')
