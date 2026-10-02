/**
 * Promueve a super_admin en Firestore emulador (merge). Puede crear el doc si falta.
 *
 * Resuelve UID por:
 *   1) users collection (email)
 *   2) Firebase Auth getUserByEmail (prod Auth — mismo uid que al loguearte)
 *
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
 *   node backend/scripts/grant-emulator-super-admin.mjs --email=admin@bacarsa.com.ar --create-if-missing
 *   node backend/scripts/grant-emulator-super-admin.mjs --email=vo@bacarsa.com.ar --create-if-missing
 *   node backend/scripts/grant-emulator-super-admin.mjs --list
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
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

function baseProfileForEmail(email) {
  const normalized = email.trim().toLowerCase()
  const local = normalized.split('@')[0] || 'Usuario'
  return {
    email: normalized,
    displayName: local.replace(/[.+]/g, ' ').trim() || 'Usuario',
    department: 'Sistemas',
    role: 'super_admin',
    accountType: 'corporate',
    accountStatus: 'active',
    permissions: { ...SUPER_ADMIN_PERMISSIONS },
    favoriteApps: [],
    personalLinks: [],
    widgetPreferences: { weather: true, dollar: true },
  }
}

async function resolveUid(db, email) {
  const normalized = email.trim().toLowerCase()
  const q = await db.collection('users').where('email', '==', normalized).limit(1).get()
  if (!q.empty) return q.docs[0].id

  try {
    const authUser = await getAuth().getUserByEmail(normalized)
    return authUser.uid
  } catch {
    return null
  }
}

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST?.trim()) {
    console.error('Definí FIRESTORE_EMULATOR_HOST=127.0.0.1:8080')
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

  const email = readArg('--email').toLowerCase()
  const uidArg = readArg('--uid')
  const createIfMissing = process.argv.includes('--create-if-missing')

  if (!email && !uidArg) {
    throw new Error('Indicá --email=... o --uid=...')
  }

  let uid = uidArg
  if (!uid && email) {
    uid = await resolveUid(db, email)
    if (!uid && createIfMissing) {
      throw new Error(
        `No hay users/${email} ni usuario Auth con ese email. Creá la cuenta en Firebase Auth o logueate una vez.`,
      )
    }
    if (!uid) {
      throw new Error(
        `No se encontró ${email}. Usá --create-if-missing si existe en Firebase Auth, o logueate en la intranet.`,
      )
    }
  }

  const ref = db.collection('users').doc(uid)
  const before = await ref.get()

  if (!before.exists) {
    if (!createIfMissing) {
      throw new Error(`users/${uid} no existe. Agregá --create-if-missing o logueate en la intranet.`)
    }
    const profileEmail = email || (await getAuth().getUser(uid)).email?.toLowerCase()
    if (!profileEmail) {
      throw new Error(`No se pudo inferir email para uid ${uid}`)
    }
    await ref.set({
      ...baseProfileForEmail(profileEmail),
      createdAt: FieldValue.serverTimestamp(),
      emulatorSuperAdminGrantedAt: FieldValue.serverTimestamp(),
    })
    console.log(`OK creado users/${uid} (${profileEmail}) → super_admin`)
    return
  }

  await ref.set(
    {
      role: 'super_admin',
      permissions: SUPER_ADMIN_PERMISSIONS,
      accountStatus: 'active',
      accountType: before.get('accountType') === 'external' ? 'external' : 'corporate',
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
  console.error(err.message ?? err)
  process.exit(1)
})
