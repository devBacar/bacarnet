/**
 * Crea o actualiza miembros iniciales de helpdeskTeam (idempotente por email).
 *
 *   node scripts/seed-helpdesk-team.mjs           ***REMOVED*** dry-run
 *   node scripts/seed-helpdesk-team.mjs --apply   ***REMOVED*** escribe Firestore
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = !process.argv.includes('--apply')
const COLLECTION = 'helpdeskTeam'

const MEMBERS = [
  {
    nombre: 'Mauro Martinez',
    email: 'admin@bacarsa.com.ar',
    rol: 'Desarrollador',
    primeraReunion: true,
    responsablePrincipal: true,
    activo: true,
  },
  {
    nombre: 'Franco Sartori',
    email: 'sistemas.ti@bacarsa.com.ar',
    rol: 'Desarrollador',
    primeraReunion: true,
    responsablePrincipal: false,
    activo: true,
  },
  {
    nombre: 'Surly Meyer',
    email: 'desarrollo.it@bacarsa.com.ar',
    rol: 'Desarrolladora',
    primeraReunion: false,
    responsablePrincipal: false,
    activo: true,
  },
  {
    nombre: 'Debora Quinteros',
    email: 'implementaciones.it@bacarsa.com.ar',
    rol: 'Implementadora',
    primeraReunion: false,
    responsablePrincipal: false,
    activo: true,
  },
]

const LEGACY_EXAMPLE_NAMES = new Set([
  'Marcos Duarte',
  'Lucía Fernández',
  'Julián Vega',
  'Agustina Rey',
])

function loadBackendEnv() {
  const envPath = resolve(ROOT, 'backend/.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
  const localPath = resolve(ROOT, 'backend/.env.local')
  if (existsSync(localPath)) {
    for (const line of readFileSync(localPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

function initAdmin() {
  if (getApps().length > 0) return
  loadBackendEnv()
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credPath) {
    const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    })
    return
  }
  initializeApp({ credential: applicationDefault() })
}

function normEmail(email) {
  return email.trim().toLowerCase()
}

async function resolveUidByEmail(db, email) {
  const q = await db.collection('users').where('email', '==', email).limit(1).get()
  if (q.empty) return null
  return q.docs[0].id
}

async function main() {
  initAdmin()
  const db = getFirestore()

  console.log(
    dryRun
      ? '=== DRY-RUN: no se escribe helpdeskTeam ==='
      : '=== APPLY: upsert en helpdeskTeam ===',
  )

  const existingTeam = await db.collection(COLLECTION).get()
  for (const doc of existingTeam.docs) {
    const nombre = typeof doc.get('nombre') === 'string' ? doc.get('nombre').trim() : ''
    if (!LEGACY_EXAMPLE_NAMES.has(nombre)) continue
    console.log(`ELIMINA ejemplo  ${nombre}  id=${doc.id}`)
    if (!dryRun) await doc.ref.delete()
  }

  for (const member of MEMBERS) {
    const email = normEmail(member.email)
    const uid = await resolveUidByEmail(db, email)
    const existing = await db.collection(COLLECTION).where('email', '==', email).limit(1).get()
    const action = existing.empty ? 'CREA' : 'ACTUALIZA'

    console.log(
      `${action}  ${member.nombre} <${email}>  rol="${member.rol}"  primeraReunion=${member.primeraReunion}  responsablePrincipal=${member.responsablePrincipal}  uid=${uid ?? '(sin users/)'}`,
    )

    if (dryRun) continue

    const payload = {
      uid,
      nombre: member.nombre,
      email,
      rol: member.rol,
      activo: member.activo,
      primeraReunion: member.primeraReunion,
      responsablePrincipal: member.responsablePrincipal,
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (existing.empty) {
      await db.collection(COLLECTION).doc().set({
        ...payload,
        createdAt: FieldValue.serverTimestamp(),
      })
    } else {
      await existing.docs[0].ref.set(payload, { merge: true })
    }
  }

  if (!dryRun) {
    const verified = await db.collection(COLLECTION).get()
    console.log('\n=== VERIFICACIÓN helpdeskTeam ===')
    for (const doc of verified.docs) {
      const row = doc.data()
      console.log(
        `${doc.id}  ${row.nombre} <${row.email}>  activo=${row.activo}  primeraReunion=${row.primeraReunion}  responsablePrincipal=${row.responsablePrincipal}`,
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
