/**
 * Seed del emulador de Firestore con datos mínimos para desarrollo local.
 * Uso: node scripts/seed-emulator.mjs
 *
 * Requiere el emulador corriendo (npx firebase emulators:start).
 * Usa Admin SDK para bypasear security rules.
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'

const app = initializeApp({ projectId: 'bacar-web' })
const db = getFirestore(app)
const auth = getAuth(app)

const DEV_EMAIL = 'dev@bacarsa.com.ar'
const DEV_PASSWORD = 'dev123456'

async function seed() {
  // 1. Global settings
  const globalConfig = {
    finanzasEnabled: true,
    resourcesEnabled: true,
    directoryEnabled: true,
    boardsEnabled: true,
    notificationsEnabled: true,
  }
  await db.doc('globalSettings/config').set(globalConfig)
  await db.doc('global_settings/main').set(globalConfig)
  console.log('[seed] global_settings/main y globalSettings/config creados')

  // 2. Crear usuario en Auth del emulador
  let uid
  try {
    const user = await auth.createUser({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      emailVerified: true,
      displayName: 'Dev Local',
    })
    uid = user.uid
    console.log(`[seed] Usuario Auth creado: ${DEV_EMAIL} (uid: ${uid})`)
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      const user = await auth.getUserByEmail(DEV_EMAIL)
      uid = user.uid
      console.log(`[seed] Usuario Auth ya existía: ${DEV_EMAIL} (uid: ${uid})`)
    } else {
      throw err
    }
  }

  // 3. Perfil de usuario en Firestore
  await db.doc(`users/${uid}`).set({
    email: DEV_EMAIL,
    displayName: 'Dev Local',
    role: 'super_admin',
    department: 'Sistemas',
    permissions: {
      super_admin: true,
      view_directory: true,
      view_drive: true,
      view_links: true,
      manage_news: true,
      manage_links: true,
      manage_users: true,
      rag_assistant: true,
      view_finanzas: true,
      finanzas_agenda: true,
      finanzas_cheques: true,
      finanzas_categorias: true,
      finanzas_transferencias: true,
      finanzas_destinatarios: true,
      finanzas_saldos: true,
      manage_finanzas_caja: true,
      rrhh_detalle: true,
    },
    favoriteApps: [],
    personalLinks: [],
    widgetPreferences: { weather: true, calendar: false, gmail: false },
    accountType: 'corporate',
    accountStatus: 'active',
  })
  console.log(`[seed] users/${uid} creado con super_admin + finanzas`)

  console.log('\n--- Listo ---')
  console.log(`Login: ${DEV_EMAIL} / ${DEV_PASSWORD}`)

  process.exit(0)
}

seed().catch((err) => {
  console.error('[seed] Error:', err)
  process.exit(1)
})
