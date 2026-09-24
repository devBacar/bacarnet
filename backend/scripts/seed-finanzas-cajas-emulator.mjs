/**
 * Seed mínimo Cajas (emulador): 2 principales (ARS/USD) + 1 chica fondeada.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run finanzas:cajas:seed:dry-run
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run finanzas:cajas:seed
 *
 * Usuarios fijos (Auth + Firestore):
 *   seed-finanzas-cajas-lider@bacarsa.com.ar — manage_finanzas_caja
 *   seed-finanzas-cajas-resp@bacarsa.com.ar — responsable caja chica
 * Opcional: SEED_CAJAS_DEV_PASSWORD (si no, se genera una por corrida).
 */

import { randomUUID } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import {
  createCajaDoc,
  createMovimientoWithSaldo,
  ejecutarFondeoAtomico,
} from '../lib/modules/finanzas/cajachica/services/caja.repository.js'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST?.trim() || '127.0.0.1:8080'

const dryRun = !process.argv.includes('--apply')
const fresh = process.argv.includes('--fresh')

export const SEED_LIDER_UID = 'seed-finanzas-cajas-lider'
export const SEED_RESP_UID = 'seed-finanzas-cajas-resp'
export const SEED_PRINCIPAL_ARS_ID = 'seed-caja-principal-ars'
export const SEED_PRINCIPAL_USD_ID = 'seed-caja-principal-usd'
export const SEED_CHICA_ARS_ID = 'seed-caja-chica-recepcion'

const SEED_ACTOR = SEED_LIDER_UID

function devPasswordForSeed() {
  const fromEnv = process.env.SEED_CAJAS_DEV_PASSWORD?.trim()
  if (fromEnv) return fromEnv
  return `seed-${randomUUID().slice(0, 12)}`
}

const LEGACY_COLLECTIONS = ['cajasChicas', 'cajaChicaMovimientos', 'cajaChicaRendiciones']
const CAJAS_COLLECTIONS = ['cajas', 'cajaMovimientos', 'cajaCierres']

async function deleteCollection(db, name) {
  const snap = await db.collection(name).get()
  if (snap.empty) return 0
  const batch = db.batch()
  for (const doc of snap.docs) batch.delete(doc.ref)
  await batch.commit()
  return snap.size
}

async function ensureAuthUser(uid, email, password) {
  try {
    await getAuth().createUser({
      uid,
      email,
      emailVerified: true,
      password,
    })
  } catch (err) {
    if (err?.code !== 'auth/uid-already-exists' && err?.code !== 'auth/email-already-exists') {
      throw err
    }
    await getAuth().updateUser(uid, { emailVerified: true, password })
  }
}

async function ensureFirestoreUser(uid, email, permissions) {
  await getAdminDb()
    .collection('users')
    .doc(uid)
    .set(
      {
        email,
        displayName: email.split('@')[0],
        role: 'user',
        accountStatus: 'active',
        accountType: 'corporate',
        permissions,
      },
      { merge: true },
    )
}

async function main() {
  initAdmin()
  const db = getAdminDb()

  await db.collection('global_settings').doc('main').set({ finanzasEnabled: true }, { merge: true })

  const liderEmail = `${SEED_LIDER_UID}@bacarsa.com.ar`
  const respEmail = `${SEED_RESP_UID}@bacarsa.com.ar`

  if (dryRun) {
    console.log('[dry-run] Se crearían/actualizarían:')
    console.log(`  - Usuarios: ${liderEmail}, ${respEmail}`)
    console.log(`  - Cajas: ${SEED_PRINCIPAL_ARS_ID}, ${SEED_PRINCIPAL_USD_ID}, ${SEED_CHICA_ARS_ID}`)
    console.log('  - Fondeo ARS 250.000 → chica + egreso demo 12.000')
    if (fresh) console.log('  - --fresh borraría colecciones cajas* y legacy cajasChicas*')
    console.log('Ejecutá con --apply (y opcional --fresh).')
    return
  }

  if (fresh) {
    for (const name of [...LEGACY_COLLECTIONS, ...CAJAS_COLLECTIONS]) {
      const n = await deleteCollection(db, name)
      if (n) console.log(`Borrados ${n} docs en ${name}`)
    }
  }

  const devPassword = devPasswordForSeed()
  await ensureAuthUser(SEED_LIDER_UID, liderEmail, devPassword)
  await ensureAuthUser(SEED_RESP_UID, respEmail, devPassword)
  await ensureFirestoreUser(SEED_LIDER_UID, liderEmail, {
    view_finanzas: true,
    manage_finanzas_caja: true,
  })
  await ensureFirestoreUser(SEED_RESP_UID, respEmail, {
    view_finanzas: false,
    manage_finanzas_caja: false,
  })

  const principalArsSnap = await db.collection('cajas').doc(SEED_PRINCIPAL_ARS_ID).get()
  if (!principalArsSnap.exists) {
    await createCajaDoc({
      id: SEED_PRINCIPAL_ARS_ID,
      nombre: 'Caja Principal ARS',
      tipo: 'principal',
      moneda: 'ARS',
      cajaPadreId: null,
      responsableUid: SEED_LIDER_UID,
      saldoInicialCentavos: 10_000_000,
      createdBy: SEED_ACTOR,
    })
    console.log('Creada caja principal ARS')
  } else {
    console.log('Caja principal ARS ya existe — omitida')
  }

  const principalUsdSnap = await db.collection('cajas').doc(SEED_PRINCIPAL_USD_ID).get()
  if (!principalUsdSnap.exists) {
    await createCajaDoc({
      id: SEED_PRINCIPAL_USD_ID,
      nombre: 'Caja Principal USD',
      tipo: 'principal',
      moneda: 'USD',
      cajaPadreId: null,
      responsableUid: SEED_LIDER_UID,
      saldoInicialCentavos: 500_000,
      createdBy: SEED_ACTOR,
    })
    console.log('Creada caja principal USD')
  } else {
    console.log('Caja principal USD ya existe — omitida')
  }

  const chicaSnap = await db.collection('cajas').doc(SEED_CHICA_ARS_ID).get()
  if (!chicaSnap.exists) {
    await createCajaDoc({
      id: SEED_CHICA_ARS_ID,
      nombre: 'Caja Chica Recepción',
      tipo: 'chica',
      moneda: 'ARS',
      cajaPadreId: SEED_PRINCIPAL_ARS_ID,
      responsableUid: SEED_RESP_UID,
      saldoInicialCentavos: 0,
      createdBy: SEED_ACTOR,
    })
    console.log('Creada caja chica Recepción')
  }

  const chicaAfter = (await db.collection('cajas').doc(SEED_CHICA_ARS_ID).get()).data()
  const fondeoCentavos = 250_000
  if (chicaAfter && chicaAfter.saldoActualCentavos < fondeoCentavos) {
    const fondeoId = randomUUID()
    await ejecutarFondeoAtomico({
      principalId: SEED_PRINCIPAL_ARS_ID,
      chicaId: SEED_CHICA_ARS_ID,
      montoCentavos: fondeoCentavos,
      concepto: 'Fondeo inicial seed',
      registradoPor: SEED_ACTOR,
      fondeoVinculadoId: fondeoId,
      movimientoEnviadoId: randomUUID(),
      movimientoRecibidoId: randomUUID(),
      fecha: Timestamp.now(),
    })
    console.log(`Fondeo seed: ${fondeoCentavos} centavos → chica`)
  } else {
    console.log('Chica ya fondeada — omitido fondeo')
  }

  const movs = await db
    .collection('cajaMovimientos')
    .where('cajaId', '==', SEED_CHICA_ARS_ID)
    .where('tipo', '==', 'egreso')
    .limit(1)
    .get()
  if (movs.empty) {
    await createMovimientoWithSaldo({
      movimientoId: randomUUID(),
      doc: {
        cajaId: SEED_CHICA_ARS_ID,
        tipo: 'egreso',
        concepto: 'Gasto demo seed (café)',
        montoCentavos: 12_000,
        fecha: Timestamp.now(),
        comprobanteStoragePath: null,
        categoria: null,
        esViatico: false,
        beneficiarioEmpleado: null,
        fondeoVinculadoId: null,
        registradoPor: SEED_RESP_UID,
      },
    })
    console.log('Egreso demo en chica')
  }

  const finalChica = await db.collection('cajas').doc(SEED_CHICA_ARS_ID).get()
  console.log(
    `Seed OK — chica saldo=${finalChica.get('saldoActualCentavos')} centavos. Login resp: ${respEmail}`,
  )
  if (!process.env.SEED_CAJAS_DEV_PASSWORD?.trim()) {
    console.log('Definí SEED_CAJAS_DEV_PASSWORD para login estable en UI (emulador).')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
