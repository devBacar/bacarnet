/**
 * Prueba que el cliente ya no puede crear users/{uid} con super_admin.
 * Requiere emulador Firestore en :8080 con rules actualizadas.
 *
 *   node backend/scripts/test-users-create-blocked.mjs
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const PROJECT_ID = 'bacar-web-rules-test'
const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function main() {
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  })

  await env.clearFirestore()
  let ok = true

  const attacker = env.authenticatedContext('attacker-uid', {
    email: 'attacker@bacarsa.com.ar',
  })

  try {
    await assertFails(
      setDoc(doc(attacker.firestore(), 'users', 'attacker-uid'), {
        email: 'attacker@bacarsa.com.ar',
        displayName: 'Atacante',
        role: 'super_admin',
        permissions: { super_admin: true },
      }),
    )
    ok = line(true, 'create users con super_admin bloqueado') && ok
  } catch (err) {
    ok = line(false, 'create users con super_admin bloqueado', String(err)) && ok
  }

  try {
    await assertFails(
      setDoc(doc(attacker.firestore(), 'users', 'attacker-uid'), {
        email: 'attacker@bacarsa.com.ar',
        displayName: 'Atacante',
        role: 'user',
      }),
    )
    ok = line(true, 'create users legítimo también bloqueado (solo Admin SDK)') && ok
  } catch (err) {
    ok = line(false, 'create users legítimo bloqueado', String(err)) && ok
  }

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'attacker-uid'), {
      email: 'attacker@bacarsa.com.ar',
      displayName: 'Atacante',
      role: 'user',
      permissions: { super_admin: false },
    })
  })

  try {
    await assertSucceeds(
      getDoc(doc(attacker.firestore(), 'users', 'attacker-uid')),
    )
    ok = line(true, 'get propio doc sigue permitido') && ok
  } catch (err) {
    ok = line(false, 'get propio doc', String(err)) && ok
  }

  await env.cleanup()
  if (!ok) process.exit(1)
  console.log('\nOK: escalada vía create bloqueada en rules.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
