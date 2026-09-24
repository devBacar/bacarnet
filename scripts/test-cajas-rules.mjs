/**
 * Reglas Firestore — colección cajas / cajaMovimientos / cajaCierres.
 * Requiere emulador Firestore en :8080 con las rules del repo cargadas.
 *
 *   node scripts/test-cajas-rules.mjs
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'

const PROJECT_ID = 'bacar-web'
const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

const CAJA_CHICA_A = 'rules-caja-chica-a'
const CAJA_CHICA_B = 'rules-caja-chica-b'
const MOV_A = 'rules-mov-a'
const MOV_B = 'rules-mov-b'
const CIERRE_A = 'rules-cierre-a'
const CIERRE_B = 'rules-cierre-b'

const RESP_A = 'rules-resp-chica-a'
const RESP_B = 'rules-resp-chica-b'
const LIDER = 'rules-caja-lider'

function corpToken(email) {
  return { email, email_verified: true }
}

function result(label, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL'
  console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function seed(env) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const userBase = {
      role: 'user',
      accountType: 'corporate',
      accountStatus: 'active',
      permissions: {
        view_finanzas: false,
        manage_finanzas_caja: false,
        super_admin: false,
      },
    }
    await setDoc(doc(db, 'users', RESP_A), {
      ...userBase,
      email: 'resp-a@bacarsa.com.ar',
      displayName: 'Resp A',
    })
    await setDoc(doc(db, 'users', RESP_B), {
      ...userBase,
      email: 'resp-b@bacarsa.com.ar',
      displayName: 'Resp B',
    })
    await setDoc(doc(db, 'users', LIDER), {
      ...userBase,
      email: 'lider-cajas@bacarsa.com.ar',
      displayName: 'Lider Cajas',
      permissions: {
        ...userBase.permissions,
        manage_finanzas_caja: true,
      },
    })

    const cajaChica = {
      nombre: 'Chica',
      tipo: 'chica',
      moneda: 'ARS',
      cajaPadreId: 'rules-principal-ars',
      saldoActualCentavos: 100_000,
    }
    await setDoc(doc(db, 'cajas', CAJA_CHICA_A), {
      ...cajaChica,
      responsableUid: RESP_A,
    })
    await setDoc(doc(db, 'cajas', CAJA_CHICA_B), {
      ...cajaChica,
      nombre: 'Chica B',
      responsableUid: RESP_B,
    })

    await setDoc(doc(db, 'cajaMovimientos', MOV_A), {
      cajaId: CAJA_CHICA_A,
      tipo: 'egreso',
      concepto: 'Gasto A',
      montoCentavos: 5000,
    })
    await setDoc(doc(db, 'cajaMovimientos', MOV_B), {
      cajaId: CAJA_CHICA_B,
      tipo: 'egreso',
      concepto: 'Gasto B',
      montoCentavos: 5000,
    })

    await setDoc(doc(db, 'cajaCierres', CIERRE_A), {
      cajaId: CAJA_CHICA_A,
      estado: 'cerrada',
      saldoTeorico: 100_000,
    })
    await setDoc(doc(db, 'cajaCierres', CIERRE_B), {
      cajaId: CAJA_CHICA_B,
      estado: 'cerrada',
      saldoTeorico: 100_000,
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

  let allOk = true

  try {
    const respA = env.authenticatedContext(RESP_A, corpToken('resp-a@bacarsa.com.ar'))
    await assertSucceeds(getDoc(doc(respA.firestore(), 'cajas', CAJA_CHICA_A)))
    allOk = result('Responsable A lee su caja', true) && allOk
  } catch (err) {
    allOk = result('Responsable A lee su caja', false, String(err)) && allOk
  }

  try {
    const respA = env.authenticatedContext(RESP_A, corpToken('resp-a@bacarsa.com.ar'))
    await assertFails(getDoc(doc(respA.firestore(), 'cajas', CAJA_CHICA_B)))
    allOk = result('Responsable A NO lee caja ajena', true, 'permission-denied') && allOk
  } catch (err) {
    allOk = result('Responsable A NO lee caja ajena', false, String(err)) && allOk
  }

  try {
    const respA = env.authenticatedContext(RESP_A, corpToken('resp-a@bacarsa.com.ar'))
    await assertSucceeds(getDoc(doc(respA.firestore(), 'cajaMovimientos', MOV_A)))
    allOk = result('Responsable A lee movimiento de su caja', true) && allOk
  } catch (err) {
    allOk = result('Responsable A lee movimiento de su caja', false, String(err)) && allOk
  }

  try {
    const respA = env.authenticatedContext(RESP_A, corpToken('resp-a@bacarsa.com.ar'))
    await assertFails(getDoc(doc(respA.firestore(), 'cajaMovimientos', MOV_B)))
    allOk = result('Responsable A NO lee movimiento ajeno', true, 'permission-denied') && allOk
  } catch (err) {
    allOk = result('Responsable A NO lee movimiento ajeno', false, String(err)) && allOk
  }

  try {
    const respA = env.authenticatedContext(RESP_A, corpToken('resp-a@bacarsa.com.ar'))
    await assertSucceeds(getDoc(doc(respA.firestore(), 'cajaCierres', CIERRE_A)))
    allOk = result('Responsable A lee cierre de su caja', true) && allOk
  } catch (err) {
    allOk = result('Responsable A lee cierre de su caja', false, String(err)) && allOk
  }

  try {
    const respA = env.authenticatedContext(RESP_A, corpToken('resp-a@bacarsa.com.ar'))
    await assertFails(getDoc(doc(respA.firestore(), 'cajaCierres', CIERRE_B)))
    allOk = result('Responsable A NO lee cierre ajeno', true, 'permission-denied') && allOk
  } catch (err) {
    allOk = result('Responsable A NO lee cierre ajeno', false, String(err)) && allOk
  }

  try {
    const respA = env.authenticatedContext(RESP_A, corpToken('resp-a@bacarsa.com.ar'))
    await assertFails(getDocs(collection(respA.firestore(), 'cajas')))
    allOk =
      result(
        'List sin filtro denegado (hay cajas ajenas)',
        true,
        'permission-denied esperado',
      ) && allOk
  } catch (err) {
    allOk = result('List sin filtro denegado (hay cajas ajenas)', false, String(err)) && allOk
  }

  try {
    const respA = env.authenticatedContext(RESP_A, corpToken('resp-a@bacarsa.com.ar'))
    const snap = await assertSucceeds(
      getDocs(
        query(collection(respA.firestore(), 'cajas'), where('responsableUid', '==', RESP_A)),
      ),
    )
    const ids = snap.docs.map((d) => d.id)
    allOk =
      result(
        'Query por responsableUid solo devuelve la propia',
        ids.length === 1 && ids[0] === CAJA_CHICA_A,
        `ids=${ids.join(',')}`,
      ) && allOk
  } catch (err) {
    allOk = result('Query por responsableUid solo devuelve la propia', false, String(err)) && allOk
  }

  try {
    const respA = env.authenticatedContext(RESP_A, corpToken('resp-a@bacarsa.com.ar'))
    await assertFails(
      setDoc(doc(respA.firestore(), 'cajas', 'hack-caja'), { nombre: 'x' }),
    )
    allOk = result('Responsable no puede crear caja', true, 'permission-denied') && allOk
  } catch (err) {
    allOk = result('Responsable no puede crear caja', false, String(err)) && allOk
  }

  try {
    const lider = env.authenticatedContext(LIDER, corpToken('lider-cajas@bacarsa.com.ar'))
    await assertSucceeds(getDoc(doc(lider.firestore(), 'cajas', CAJA_CHICA_B)))
    allOk = result('Líder cajas lee cualquier caja', true) && allOk
  } catch (err) {
    allOk = result('Líder cajas lee cualquier caja', false, String(err)) && allOk
  }

  await env.cleanup()
  if (!allOk) process.exitCode = 1
}

main().catch((err) => {
  console.error('Test reglas cajas falló:', err)
  process.exitCode = 1
})
