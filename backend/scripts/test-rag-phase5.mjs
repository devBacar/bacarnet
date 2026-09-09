/**
 * Fase 5 — validación piloto RAG-lite.
 *
 *   npm run test:rag:phase5
 *   npm run test:rag:phase5 -- --ask "¿Qué políticas hay sobre backup?"
 */

import { initAdmin, loadTestEnv, getTestIdToken } from './get-test-token.mjs'
import { verifyNoExcludedChunks } from '../lib/modules/rag/indexPilotArea.js'
import { getRagConfig } from '../lib/modules/rag/config.js'
import { getRagIndexState } from '../lib/modules/rag/loadRagCorpus.js'
import { RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID } from '../lib/modules/rag/constants.js'

loadTestEnv()
initAdmin()

const ASK = process.argv.includes('--ask')
const questionArgIndex = process.argv.indexOf('--ask')
const question =
  questionArgIndex >= 0 ? process.argv.slice(questionArgIndex + 1).join(' ').trim() : ''

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function main() {
  const config = await getRagConfig()
  console.log('=== RAG-lite Fase 5: validación piloto ===')
  console.log(`Piloto: ${config.pilot.label} (${config.pilot.governingAreaId})`)
  console.log(`rag.enabled: ${config.enabled}`)
  console.log('')

  let allOk = true

  allOk = line(config.enabled === false, 'rag.enabled sigue en false (piloto no generalizado)') && allOk

  const verify = await verifyNoExcludedChunks(config.pilot.governingAreaId)
  allOk = line(verify.ok, '0 chunks RESTRINGIDO o área excluida en corpus', verify.violations.join('; ')) && allOk

  const cumplimientoViolations = verify.violations.filter((v) =>
    v.includes(RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID),
  )
  allOk =
    line(
      cumplimientoViolations.length === 0,
      '0 chunks de Cumplimiento en corpus',
      cumplimientoViolations.join('; '),
    ) && allOk

  const indexState = await getRagIndexState(config.pilot.governingAreaId)
  const chunkCount = typeof indexState?.chunkCount === 'number' ? indexState.chunkCount : 0
  allOk = line(chunkCount > 0, 'Índice con chunks listos', `chunkCount=${chunkCount}`) && allOk

  if (ASK && question.length >= 4) {
    const token = await getTestIdToken()
    const started = Date.now()
    const res = await fetch(`${process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'}/api/drive/ask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    })
    const body = await res.json().catch(() => ({}))
    const latencyMs = Date.now() - started
    allOk = line(res.ok, 'POST /api/drive/ask responde 200', body.error ?? `HTTP ${res.status}`) && allOk
    allOk = line(latencyMs <= 15000, 'Latencia consulta <= 15s (objetivo p95 piloto)', `${latencyMs} ms`) && allOk
    if (res.ok) {
      console.log('')
      console.log('--- Respuesta (extracto) ---')
      console.log(String(body.answer ?? '').slice(0, 600))
      console.log(`Citas: ${Array.isArray(body.citations) ? body.citations.length : 0}`)
      console.log(`Impersonación: ${body.impersonatedAs ?? '—'}`)
      allOk =
        line(
          typeof body.impersonatedAs === 'string' && !body.impersonatedAs.includes('datos@'),
          'Consulta impersona usuario real (no datos@)',
          String(body.impersonatedAs ?? ''),
        ) && allOk
    }
  } else {
    console.log('')
    console.log('Tip: agregá --ask "tu pregunta" para probar latencia y respuesta en prod.')
  }

  if (!allOk) process.exitCode = 1
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
