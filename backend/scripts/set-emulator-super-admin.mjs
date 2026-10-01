/**
 * Promueve un usuario a super_admin en Firestore (emulador local).
 *
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
 *   node backend/scripts/set-emulator-super-admin.mjs --uid=<firebase-auth-uid>
 *   node backend/scripts/set-emulator-super-admin.mjs --email=usuario@bacarsa.com.ar
 *   node backend/scripts/set-emulator-super-admin.mjs --list
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const SUPER_ADMIN_PERMISSIONS = {
  view_directory: true,
  view_drive: true,
  view_links: true,
  manage_news: true,
  manage_links: true,
  manage_users: true,
  super_admin: true,
  rag_assistant: true,
  view_finanzas: true,
}

function readArg(prefix) {
  const hit = process.argv.find((arg) => arg.startsWith(`${prefix}=`))
  return hit ? hit.slice(prefix.length + 1).trim() : ''
}

async function resolveUid(db) {
  const uid = readArg('--uid')
  if (uid) return uid

  const email = readArg('--email').toLowerCase()
  if (email) {
    const q = await db.collection('users').where('email', '==', email).limit(1).get()
    if (q.empty) {
      throw new Error(`No hay users con email ${email} en Firestore (emulador).`)
    }
    return q.docs[0].id
  }

  throw new Error('Indicá --uid=... o --email=... (o --list para ver usuarios).')
}

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST?.trim()) {
    console.warn(
      'AVISO: FIRESTORE_EMULATOR_HOST no está definido; el script escribiría en el proyecto real.',
    )
    process.exit(1)
  }

  loadTestEnv()
  initAdmin()
  const db = getFirestore()

  if (process.argv.includes('--list')) {
    const snap = await db.collection('users').get()
    if (snap.empty) {
      console.log('(sin documentos en users)')
      return
    }
    for (const doc of snap.docs) {
      const data = doc.data()
      console.log(`${doc.id}\t${data.email ?? ''}\trole=${data.role ?? '—'}`)
    }
    return
  }

  const uid = await resolveUid(db)
  const ref = db.collection('users').doc(uid)
  const before = await ref.get()
  if (!before.exists) {
    throw new Error(`users/${uid} no existe. Logueate una vez en la intranet para crear el perfil.`)
  }

  await ref.set(
    {
      role: 'super_admin',
      permissions: SUPER_ADMIN_PERMISSIONS,
      updatedAt: FieldValue.serverTimestamp(),
      emulatorSuperAdminGrantedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  const after = await ref.get()
  console.log(
    `OK users/${uid} (${after.get('email') ?? 'sin email'}) → role=super_admin, permissions.super_admin=true`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
