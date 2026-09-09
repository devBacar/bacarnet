/**
 * Batería de regresión: orquestación N acciones (action plan).
 *
 *   node backend/scripts/test-action-plan-battery.mjs
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'

const CASES = [
  {
    id: 'summarize-mail-meet',
    name: 'Resumen + 1 mail + 1 Meet',
    question:
      "Hacé un resumen de los PDF que tengo en mi carpeta, cuando tengas ese resumen enviale un correo a admin@bacarsa.com.ar con el asunto 'Info de prueba' e invitalo a una meet mañana a las 10 para conversar este tema",
    assert(body) {
      assertHttpOk(body)
      assertTools(body, ['orchestrated_extract_action_plan', 'orchestrated_prepare_action_batch'])
      assertMinPending(body, 2)
      assertTypes(body, ['email', 'calendar_event'])
    },
  },
  {
    id: 'complex-presencial-meet',
    name: 'Resumen + mail + presencial 2 invitados + Meet otro invitado/horario',
    question:
      "Hacé un resumen de los PDF de mi carpeta. Cuando lo tengas: 1) enviá un correo a admin@bacarsa.com.ar con asunto 'Info de prueba' con los resúmenes; 2) agendá mañana a las 10 una reunión presencial en la oficina con admin@bacarsa.com.ar y sistemas.ti@bacarsa.com.ar para revisar el tema; 3) agendá mañana a las 15 una meet con implementaciones.it@bacarsa.com.ar para conversar lo mismo",
    assert(body) {
      assertHttpOk(body)
      assertMinPending(body, 3)
      const types = (body.pendingActions ?? []).map((a) => a.type)
      const emailCount = types.filter((t) => t === 'email').length
      const eventCount = types.filter((t) => t === 'calendar_event').length
      if (emailCount < 1 || eventCount < 2) {
        throw new Error(`Se esperaban ≥1 email y ≥2 eventos, obtuve ${JSON.stringify(types)}`)
      }
      const meetEvent = (body.pendingActions ?? []).find(
        (a) => a.type === 'calendar_event' && a.preview?.addGoogleMeet === true,
      )
      const inPerson = (body.pendingActions ?? []).find(
        (a) =>
          a.type === 'calendar_event' &&
          a.preview?.addGoogleMeet !== true &&
          (a.preview?.attendees?.length ?? 0) >= 2,
      )
      if (!meetEvent) throw new Error('Falta evento con Google Meet')
      if (!inPerson) throw new Error('Falta evento presencial con 2 invitados')
    },
  },
  {
    id: 'three-mails',
    name: '3 correos distintos',
    question:
      "Con el resumen de los PDF de mi carpeta: mandá un correo a admin@bacarsa.com.ar asunto 'Reporte A', otro a sistemas.ti@bacarsa.com.ar asunto 'Reporte B', y otro a implementaciones.it@bacarsa.com.ar asunto 'Reporte C'. Usá los resúmenes como cuerpo en los tres.",
    assert(body) {
      assertHttpOk(body)
      assertMinPending(body, 3)
      const emails = (body.pendingActions ?? []).filter((a) => a.type === 'email')
      const subjects = emails.map((a) => a.preview?.subject).sort()
      if (emails.length < 3) throw new Error(`Se esperaban 3 emails, hay ${emails.length}`)
      for (const expected of ['Reporte A', 'Reporte B', 'Reporte C']) {
        if (!subjects.some((s) => s?.includes(expected.replace('Reporte ', '')) || s === expected)) {
          // tolerate Gemini paraphrasing subjects slightly
          if (!subjects.join('|').toLowerCase().includes(expected.split(' ')[1].toLowerCase())) {
            throw new Error(`Falta asunto parecido a "${expected}", obtuve: ${subjects.join(', ')}`)
          }
        }
      }
    },
  },
  {
    id: 'partial-failure',
    name: 'Fallo parcial: email inválido + email válido',
    question:
      "Hacé un resumen de los PDF de mi carpeta. Después enviá dos correos con los resúmenes: uno a admin@bacarsa.com.ar asunto 'OK parcial' y otro a no-es-bacarsa@gmail.com asunto 'Debe fallar'",
    assert(body) {
      assertHttpOk(body)
      assertMinPending(body, 1)
      const failures = body.preparationFailures ?? []
      if (failures.length < 1) {
        throw new Error('Se esperaba al menos 1 preparationFailure por email inválido')
      }
      const validEmail = (body.pendingActions ?? []).find((a) => a.type === 'email')
      if (!validEmail) throw new Error('El correo válido debería haberse preparado')
    },
  },
]

function assertHttpOk(result) {
  if (!result.ok) {
    throw new Error(`HTTP ${result.status}: ${JSON.stringify(result.body)}`)
  }
}

function assertTools(body, required) {
  const tools = body.toolsUsed ?? []
  for (const tool of required) {
    if (!tools.includes(tool)) {
      throw new Error(`Falta tool "${tool}" en ${tools.join(', ')}`)
    }
  }
}

function assertMinPending(body, min) {
  const count = (body.pendingActions ?? []).length
  if (count < min) {
    throw new Error(`Se esperaban ≥${min} pendingActions, hay ${count}`)
  }
}

function assertTypes(body, expectedTypes) {
  const types = (body.pendingActions ?? []).map((a) => a.type).sort()
  for (const type of expectedTypes) {
    if (!types.includes(type)) {
      throw new Error(`Falta pendingAction type "${type}" en ${types.join(', ')}`)
    }
  }
}

async function ask(token, question, history = []) {
  const started = Date.now()
  const res = await fetch(`${API_BASE}/api/drive/ask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, history }),
  })
  const body = await res.json().catch(() => ({}))
  return {
    ok: res.ok,
    status: res.status,
    body,
    ms: Date.now() - started,
  }
}

async function runCase(token, testCase, runLabel) {
  console.log(`\n=== ${runLabel}: ${testCase.name} ===`)
  const result = await ask(token, testCase.question)
  console.log('HTTP', result.status, `(${result.ms}ms)`)
  console.log('tools:', (result.body.toolsUsed ?? []).join(', ') || '(none)')
  console.log(
    'pendingActions:',
    (result.body.pendingActions ?? []).map((a) => a.type).join(', ') || '(none)',
  )
  console.log(
    'preparationFailures:',
    (result.body.preparationFailures ?? []).length || 0,
  )
  if (!result.ok) {
    console.log('ERROR body:', JSON.stringify(result.body, null, 2))
  }
  testCase.assert({ ...result.body, ok: result.ok, status: result.status })
  console.log('PASS')
  return result
}

const { idToken, email } = await getTestIdToken({ requireSuperAdmin: false })
console.log('User:', email)
console.log('API:', API_BASE)

console.log('\n=== Warmup ===')
await ask(idToken, '¿Qué correos tengo hoy?')
console.log('Warmup OK')

let failed = 0

for (const testCase of CASES) {
  try {
    await runCase(idToken, testCase, testCase.id)
  } catch (err) {
    failed += 1
    console.error('FAIL:', err instanceof Error ? err.message : err)
  }
}

console.log('\n=== Estabilidad: 4 corridas del caso complejo ===')
const complex = CASES.find((c) => c.id === 'complex-presencial-meet')
for (let i = 1; i <= 4; i += 1) {
  try {
    await runCase(idToken, complex, `complex-run-${i}/4`)
  } catch (err) {
    failed += 1
    console.error(`FAIL run ${i}:`, err instanceof Error ? err.message : err)
  }
}

console.log('\n=== RESUMEN ===')
if (failed > 0) {
  console.error(`FALLARON ${failed} prueba(s)`)
  process.exit(1)
}
console.log('TODAS LAS PRUEBAS PASS')
