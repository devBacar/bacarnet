/**
 * Confirma que helpdesk* no es legible ni escribible desde el cliente.
 * Requiere emulador Firestore en :8080.
 *
 *   npx firebase emulators:start --only firestore --project bacar-web
 *   node scripts/test-helpdesk-rules.mjs
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const PROJECT_ID = 'bacar-web-rules-test'
const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

function result(label, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL'
  console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function main() {
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: RULES,
      host: '127.0.0.1',
      port: 8080,
    },
  })

  await env.clearFirestore()

  let allOk = true

  const superAdmin = env.authenticatedContext('user-super', {
    email: 'admin@bacarsa.com.ar',
    email_verified: true,
  })
  const db = superAdmin.firestore()

  try {
    await assertFails(getDoc(doc(db, 'helpdeskTickets', 'ticket-1')))
    allOk = result('GET helpdeskTickets (cliente autenticado)', true, 'denegado') && allOk
  } catch (err) {
    allOk = result('GET helpdeskTickets (cliente autenticado)', false, String(err)) && allOk
  }

  try {
    await assertFails(
      setDoc(doc(db, 'helpdeskTickets', 'ticket-1'), {
        requesterEmail: 'atacante@bacarsa.com.ar',
      }),
    )
    allOk = result('CREATE helpdeskTickets (cliente autenticado)', true, 'denegado') && allOk
  } catch (err) {
    allOk = result('CREATE helpdeskTickets (cliente autenticado)', false, String(err)) && allOk
  }

  try {
    await assertFails(getDoc(doc(db, 'helpdeskTeam', 'member-1')))
    allOk = result('GET helpdeskTeam', true, 'denegado') && allOk
  } catch (err) {
    allOk = result('GET helpdeskTeam', false, String(err)) && allOk
  }

  try {
    await assertFails(getDoc(doc(db, 'helpdeskUsedTokens', 'jti-1')))
    allOk = result('GET helpdeskUsedTokens', true, 'denegado') && allOk
  } catch (err) {
    allOk = result('GET helpdeskUsedTokens', false, String(err)) && allOk
  }

  try {
    await assertFails(getDoc(doc(db, 'helpdeskEmailLog', 'log-1')))
    allOk = result('GET helpdeskEmailLog', true, 'denegado') && allOk
  } catch (err) {
    allOk = result('GET helpdeskEmailLog', false, String(err)) && allOk
  }

  try {
    await assertFails(getDoc(doc(db, 'helpdeskTickets', 'ticket-1', 'reuniones', 'reunion-1')))
    allOk = result('GET helpdeskTickets/reuniones', true, 'denegado') && allOk
  } catch (err) {
    allOk = result('GET helpdeskTickets/reuniones', false, String(err)) && allOk
  }

  try {
    await assertFails(
      setDoc(doc(db, 'helpdeskTickets', 'ticket-1', 'notas', 'nota-1'), { texto: 'x' }),
    )
    allOk = result('CREATE helpdeskTickets/notas', true, 'denegado') && allOk
  } catch (err) {
    allOk = result('CREATE helpdeskTickets/notas', false, String(err)) && allOk
  }

  await env.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore()
    await assertSucceeds(
      setDoc(doc(adminDb, 'helpdeskTickets', 'ticket-seed'), { estadoIdx: 0 }),
    )
  })
  allOk = result('Seed helpdeskTickets con reglas deshabilitadas', true) && allOk

  const userA = env.authenticatedContext('uid-a', {
    email: 'a@bacarsa.com.ar',
    email_verified: true,
  })
  const userB = env.authenticatedContext('uid-b', {
    email: 'b@bacarsa.com.ar',
    email_verified: true,
  })
  try {
    await assertSucceeds(
      setDoc(doc(userA.firestore(), 'helpdeskTickets', 'ticket-seed', 'vistoPor', 'uid-a'), {
        bitacora: new Date(),
      }),
    )
    allOk = result('vistoPor: usuario escribe su propio doc', true) && allOk
  } catch (err) {
    allOk = result('vistoPor: usuario escribe su propio doc', false, String(err)) && allOk
  }
  try {
    await assertFails(
      getDoc(doc(userB.firestore(), 'helpdeskTickets', 'ticket-seed', 'vistoPor', 'uid-a')),
    )
    allOk = result('vistoPor: no leer doc ajeno', true, 'denegado') && allOk
  } catch (err) {
    allOk = result('vistoPor: no leer doc ajeno', false, String(err)) && allOk
  }

  await env.cleanup()
  if (!allOk) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('Test de reglas helpdesk falló:', err)
  process.exitCode = 1
})
