/**
 * E2E: confección Agenda → Interbanking (Firestore emulador + API functions si está arriba).
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   FUNCTIONS_API_BASE=http://127.0.0.1:5001/bacar-web/southamerica-east1/api \
 *   node backend/scripts/e2e-finanzas-transferencias-confeccion-emulator.mjs
 */
import { deleteApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { createCompromisoAgenda } from '../lib/modules/finanzas/agenda/services/compromisos.service.js'
import { syncCuentasFromProvider } from '../lib/modules/finanzas/services/cuentas.service.js'
import { confeccionarTransferenciaDesdeCompromiso } from '../lib/modules/finanzas/transferencias/services/transferencias.service.js'
import { TRANSFERENCIAS_COLLECTION } from '../lib/modules/finanzas/transferencias/services/transferencias.repository.js'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
process.env.FINANZAS_TRANSFERENCIAS_PROVIDER = 'interbanking'

const JULIO_CBU = '3050001101010001303450'
const E2E_UID = 'e2e-finanzas-transferencias'
const E2E_EMAIL = 'e2e-transferencias@bacarsa.com.ar'

function useFirestoreEmulator() {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST?.trim() || '127.0.0.1:8080'
}

async function resetAdminForEmulator() {
  for (const app of getApps()) {
    await deleteApp(app)
  }
  useFirestoreEmulator()
  initAdmin()
}

async function ensureEmulatorAuthUser() {
  const auth = getAuth()
  try {
    await auth.getUser(E2E_UID)
  } catch {
    await auth.createUser({ uid: E2E_UID, email: E2E_EMAIL, emailVerified: true })
  }
}

async function api(idToken, method, path, body) {
  const API =
    process.env.FUNCTIONS_API_BASE?.trim() ||
    'http://127.0.0.1:5001/bacar-web/southamerica-east1/api'
  const init = {
    method,
    headers: { Authorization: `Bearer ${idToken}` },
  }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${API}${path}`, init)
  const text = await res.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // texto
  }
  return { status: res.status, body: parsed, apiBase: API }
}

async function main() {
  let idToken = null
  try {
    const saved = process.env.FIRESTORE_EMULATOR_HOST
    delete process.env.FIRESTORE_EMULATOR_HOST
    const tok = await getTestIdToken()
    idToken = tok.idToken
    await resetAdminForEmulator()
    if (saved) process.env.FIRESTORE_EMULATOR_HOST = saved
    else useFirestoreEmulator()
    await ensureEmulatorAuthUser()
    const db = getAdminDb()
    await db.collection('users').doc(tok.uid).set(
      {
        email: tok.email,
        displayName: 'E2E Transferencias',
        role: 'super_admin',
        accountStatus: 'active',
      },
      { merge: true },
    )
  } catch {
    await resetAdminForEmulator()
    await ensureEmulatorAuthUser()
    const db = getAdminDb()
    await db.collection('users').doc(E2E_UID).set(
      {
        email: E2E_EMAIL,
        displayName: 'E2E Transferencias',
        role: 'super_admin',
        accountStatus: 'active',
      },
      { merge: true },
    )
  }

  const actorUid = E2E_UID
  const db = getAdminDb()
  await db.collection('global_settings').doc('main').set({ finanzasEnabled: true }, { merge: true })
  await syncCuentasFromProvider({ actorUid })

  const compromiso = await createCompromisoAgenda({
    actorUid,
    body: {
      concepto: 'E2E API cuentas propias Patagonia→Julio $1',
      proveedorONombre: 'Interno Bacar',
      montoCentavos: 100,
      fechaVencimiento: '2026-10-15',
      urgenciaManual: 'baja',
      medioPago: 'transferencia',
      cuentaId: 'patagonia-cc',
    },
  })

  console.log('Compromiso creado:', compromiso.id)

  let confResult
  let via = 'service'

  if (idToken) {
    try {
      const confApi = await api(idToken, 'POST', '/api/finanzas/transferencias/confeccionar', {
        compromisoPagoId: compromiso.id,
        cuentaDebitoId: 'patagonia-cc',
        cuentaCreditoCbu: JULIO_CBU,
        tipo: 'cuentas_propias',
      })
      if (confApi.status === 201) {
        confResult = confApi.body
        via = `HTTP ${confApi.apiBase}`
      } else {
        console.warn('API confeccionar no 201, fallback servicio:', confApi.status, confApi.body)
      }
    } catch (err) {
      console.warn('API no disponible, fallback servicio:', err instanceof Error ? err.message : err)
    }
  }

  if (!confResult) {
    confResult = await confeccionarTransferenciaDesdeCompromiso({
      actorUid,
      body: {
        compromisoPagoId: compromiso.id,
        cuentaDebitoId: 'patagonia-cc',
        cuentaCreditoCbu: JULIO_CBU,
        tipo: 'cuentas_propias',
      },
    })
    via = 'service (misma ruta que POST /confeccionar)'
  }

  console.log(`\n--- Resultado confección (${via}) ---`)
  console.log(JSON.stringify(confResult, null, 2))

  const compromisoSnap = await db.collection('compromisosPago').doc(compromiso.id).get()
  console.log('\n--- Firestore compromisosPago ---')
  console.log(JSON.stringify({ id: compromisoSnap.id, ...compromisoSnap.data() }, null, 2))

  const transferenciaId =
    confResult?.transferencia?.id ?? compromisoSnap.data()?.transferenciaConfeccionadaId
  if (transferenciaId) {
    const tSnap = await db.collection(TRANSFERENCIAS_COLLECTION).doc(transferenciaId).get()
    console.log('\n--- Firestore transferenciasConfeccionadas ---')
    console.log(JSON.stringify({ id: tSnap.id, ...tSnap.data() }, null, 2))
  }

  const ok = confResult?.ok === true
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
