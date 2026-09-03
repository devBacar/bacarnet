/**
 * Reglas: managedAreaIds / memberAreaIds / actionGrants bloqueados en cliente.
 *
 *   node backend/scripts/test-governance-fields-rules.mjs
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, updateDoc } from 'firebase/firestore'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const RULES = readFileSync(resolve(ROOT, 'firestore.rules'), 'utf8')
const PROJECT_ID = 'bacar-governance-rules-test'

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function seed(env) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await db.doc('users/target-user').set({
      email: 'target@bacarsa.com.ar',
      role: 'user',
      managedAreaIds: [],
      memberAreaIds: [],
      permissions: { super_admin: false, manage_users: false },
    })
    await db.doc('users/manager-user').set({
      email: 'manager@bacarsa.com.ar',
      role: 'user',
      managedAreaIds: [],
      memberAreaIds: [],
      permissions: { super_admin: false, manage_users: true },
    })
  })
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
  await seed(env)

  const results = []

  // manage_users NO puede mutar managedAreaIds
  try {
    const manager = env.authenticatedContext('manager-user', {
      email: 'manager@bacarsa.com.ar',
    })
    await assertFails(
      updateDoc(doc(manager.firestore(), 'users', 'target-user'), {
        managedAreaIds: ['area-hack'],
      }),
    )
    results.push(line(true, '6  manage_users no escribe managedAreaIds'))
  } catch (err) {
    results.push(line(false, '6  manage_users no escribe managedAreaIds', String(err)))
  }

  // manage_users NO puede mutar memberAreaIds
  try {
    const manager = env.authenticatedContext('manager-user', {
      email: 'manager@bacarsa.com.ar',
    })
    await assertFails(
      updateDoc(doc(manager.firestore(), 'users', 'target-user'), {
        memberAreaIds: ['area-hack'],
      }),
    )
    results.push(line(true, '6  manage_users no escribe memberAreaIds'))
  } catch (err) {
    results.push(line(false, '6  manage_users no escribe memberAreaIds', String(err)))
  }

  // manage_users NO puede mutar actionGrants
  try {
    const manager = env.authenticatedContext('manager-user', {
      email: 'manager@bacarsa.com.ar',
    })
    await assertFails(
      updateDoc(doc(manager.firestore(), 'users', 'target-user'), {
        actionGrants: { approval: ['area-hack'] },
      }),
    )
    results.push(line(true, '6  manage_users no escribe actionGrants'))
  } catch (err) {
    results.push(line(false, '6  manage_users no escribe actionGrants', String(err)))
  }

  // manage_users SÍ puede mutar otros campos (displayName)
  try {
    const manager = env.authenticatedContext('manager-user', {
      email: 'manager@bacarsa.com.ar',
    })
    await assertSucceeds(
      updateDoc(doc(manager.firestore(), 'users', 'target-user'), {
        displayName: 'Nombre actualizado',
      }),
    )
    results.push(line(true, '6  manage_users puede editar displayName'))
  } catch (err) {
    results.push(line(false, '6  manage_users puede editar displayName', String(err)))
  }

  await env.cleanup()

  const ok = results.every(Boolean)
  console.log(ok ? 'RESULTADO: OK' : 'RESULTADO: HAY FALLOS')
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
