/**

 * E2E Cajas (jerarquía) — emulador Firestore + Functions API.

 *

 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \

 * FUNCTIONS_API_BASE=http://127.0.0.1:5001/bacar-web/southamerica-east1/api \

 * node backend/scripts/e2e-finanzas-caja-chica-emulator.mjs

 */



import { randomUUID } from 'node:crypto'

import { getAuth } from 'firebase-admin/auth'

import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'



loadTestEnv()

process.env.FIRESTORE_EMULATOR_HOST =

  process.env.FIRESTORE_EMULATOR_HOST?.trim() || '127.0.0.1:8080'



const EMULATOR_API = 'http://127.0.0.1:5001/bacar-web/southamerica-east1/api'
const API = process.env.FIRESTORE_EMULATOR_HOST?.trim()
  ? EMULATOR_API
  : process.env.FUNCTIONS_API_BASE?.trim() || EMULATOR_API

const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken'

const CAJAS = '/api/finanzas/cajas'



function log(ok, label, detail = '') {

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)

  if (!ok) process.exitCode = 1

}



async function apiJson(idToken, method, path, body) {

  const res = await fetch(`${API}${path}`, {

    method,

    headers: {

      Authorization: `Bearer ${idToken}`,

      'Content-Type': 'application/json',

    },

    body: body !== undefined ? JSON.stringify(body) : undefined,

  })

  const parsed = await res.json().catch(() => ({}))

  return { status: res.status, body: parsed }

}



async function apiMultipart(idToken, cajaId, fields, pngBuffer) {

  const form = new FormData()

  for (const [k, v] of Object.entries(fields)) form.set(k, v)

  form.set(

    'comprobante',

    new Blob([pngBuffer], { type: 'image/png' }),

    'comprobante-e2e.png',

  )

  const res = await fetch(`${API}${CAJAS}/${cajaId}/movimientos`, {

    method: 'POST',

    headers: { Authorization: `Bearer ${idToken}` },

    body: form,

  })

  const parsed = await res.json().catch(() => ({}))

  return { status: res.status, body: parsed }

}



const TINY_PNG = Buffer.from(

  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',

  'base64',

)



async function idTokenForUid(uid) {

  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()

  if (!apiKey) throw new Error('Falta VITE_FIREBASE_API_KEY')

  const customToken = await getAuth().createCustomToken(uid)

  const res = await fetch(`${IDENTITY_URL}?key=${encodeURIComponent(apiKey)}`, {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({ token: customToken, returnSecureToken: true }),

  })

  const payload = await res.json()

  if (!res.ok || typeof payload.idToken !== 'string') {

    throw new Error(payload.error?.message ?? 'No idToken')

  }

  return payload.idToken

}



async function ensureUser(uid, email, permissions) {

  const db = getAdminDb()

  await db.collection('users').doc(uid).set(

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

  try {

    await getAuth().createUser({
      uid,
      email,
      emailVerified: true,
      password: process.env.E2E_CAJAS_USER_PASSWORD?.trim() || `e2e-${randomUUID()}`,
    })

  } catch (err) {

    if (err?.code !== 'auth/uid-already-exists' && err?.code !== 'auth/email-already-exists') throw err

  }

}



async function main() {

  initAdmin()

  await getAdminDb().collection('global_settings').doc('main').set({ finanzasEnabled: true }, { merge: true })



  const suffix = randomUUID().slice(0, 8)

  const liderUid = `e2e-cajas-lider-${suffix}`

  const respUid = `e2e-cajas-resp-${suffix}`

  const resp2Uid = `e2e-cajas-resp2-${suffix}`

  const liderEmail = `${liderUid}@bacarsa.com.ar`

  const respEmail = `${respUid}@bacarsa.com.ar`



  await ensureUser(liderUid, liderEmail, {

    view_finanzas: true,

    manage_finanzas_caja: true,

  })

  await ensureUser(respUid, respEmail, {

    view_finanzas: false,

    manage_finanzas_caja: false,

  })

  await ensureUser(resp2Uid, `${resp2Uid}@bacarsa.com.ar`, {

    view_finanzas: false,

    manage_finanzas_caja: false,

  })



  const liderToken = await idTokenForUid(liderUid)

  const respToken = await idTokenForUid(respUid)

  const resp2Token = await idTokenForUid(resp2Uid)



  const principalArs = await apiJson(liderToken, 'POST', CAJAS, {

    nombre: `E2E Principal ARS ${suffix}`,

    tipo: 'principal',

    moneda: 'ARS',

    responsableUid: liderUid,

    saldoInicialCentavos: 2_000_000,

  })

  log(principalArs.status === 201, 'Alta caja principal ARS', String(principalArs.status))

  const principalArsId = principalArs.body?.caja?.id

  if (!principalArsId) {

    log(false, 'principalArsId')

    return

  }



  const principalUsd = await apiJson(liderToken, 'POST', CAJAS, {

    nombre: `E2E Principal USD ${suffix}`,

    tipo: 'principal',

    moneda: 'USD',

    responsableUid: liderUid,

    saldoInicialCentavos: 100_000,

  })

  log(principalUsd.status === 201, 'Alta caja principal USD', String(principalUsd.status))



  const dupPrincipal = await apiJson(liderToken, 'POST', CAJAS, {

    nombre: 'Duplicada ARS',

    tipo: 'principal',

    moneda: 'ARS',

    responsableUid: liderUid,

    saldoInicialCentavos: 1,

  })

  log(dupPrincipal.status === 400, 'Rechaza segunda principal ARS', dupPrincipal.body?.error ?? '')



  const chica = await apiJson(liderToken, 'POST', CAJAS, {

    nombre: `E2E Chica ${suffix}`,

    tipo: 'chica',

    moneda: 'ARS',

    cajaPadreId: principalArsId,

    responsableUid: respUid,

    saldoInicialCentavos: 0,

  })

  log(chica.status === 201, 'Alta caja chica', String(chica.status))

  const chicaId = chica.body?.caja?.id

  if (!chicaId) {

    log(false, 'chicaId')

    return

  }



  const chica2 = await apiJson(liderToken, 'POST', CAJAS, {

    nombre: `E2E Chica 2 ${suffix}`,

    tipo: 'chica',

    moneda: 'ARS',

    cajaPadreId: principalArsId,

    responsableUid: resp2Uid,

    saldoInicialCentavos: 0,

  })

  log(chica2.status === 201, 'Alta segunda caja chica', String(chica2.status))

  const chica2Id = chica2.body?.caja?.id



  const fondeo = await apiJson(liderToken, 'POST', `${CAJAS}/${principalArsId}/fondear`, {

    cajaChicaId: chicaId,

    montoCentavos: 400_000,

    concepto: 'Fondeo E2E',

  })

  log(fondeo.status === 201, 'Fondeo principal → chica', String(fondeo.status))



  const ingreso = await apiJson(respToken, 'POST', `${CAJAS}/${chicaId}/movimientos`, {

    tipo: 'ingreso',

    concepto: 'Ingreso menor E2E',

    montoCentavos: 25_000,

  })

  log(ingreso.status === 201, 'Ingreso responsable chica', String(ingreso.status))



  const egreso = await apiMultipart(

    respToken,

    chicaId,

    {

      tipo: 'egreso',

      concepto: 'Gasto con foto',

      montoCentavos: '15000',

      esViatico: 'false',

    },

    TINY_PNG,

  )

  log(egreso.status === 201 && egreso.body?.movimiento?.comprobanteUrl, 'Egreso con comprobante')



  const listResp = await apiJson(respToken, 'GET', CAJAS)

  const idsResp = (listResp.body?.cajas ?? []).map((c) => c.id)

  log(

    listResp.status === 200 && idsResp.length === 1 && idsResp[0] === chicaId,

    'List API solo devuelve caja propia al responsable',

    `count=${idsResp.length}`,

  )



  const intrusoMov = await apiJson(resp2Token, 'GET', `${CAJAS}/${chicaId}/movimientos`)

  log(

    intrusoMov.status === 403,

    'API rechaza movimientos de caja ajena',

    `${intrusoMov.status} ${intrusoMov.body?.error ?? ''}`,

  )



  const intrusoCierre = await apiJson(resp2Token, 'GET', `${CAJAS}/${chicaId}/cierres`)

  log(

    intrusoCierre.status === 403 || (intrusoCierre.status === 400 && String(intrusoCierre.body?.error).includes('acceso')),

    'API rechaza cierres de caja ajena',

    String(intrusoCierre.status),

  )



  const listAfter = await apiJson(liderToken, 'GET', CAJAS)

  const chicaRow = (listAfter.body?.cajas ?? []).find((c) => c.id === chicaId)

  const saldoActual = chicaRow?.saldoActualCentavos ?? 410_000



  const cierre = await apiJson(respToken, 'POST', `${CAJAS}/${chicaId}/cerrar`, {

    periodoDesde: new Date(Date.now() - 7 * 864e5).toISOString(),

    periodoHasta: new Date().toISOString(),

    efectivoContado: saldoActual,

    cerrar: true,

  })

  log(cierre.status === 201 && cierre.body?.cierre?.estado === 'cerrada', 'Cierre de caja')



  const reasign = await apiJson(liderToken, 'POST', `${CAJAS}/${chicaId}/responsable`, {

    responsableUid: resp2Uid,

    motivo: 'Prueba E2E custodia',

  })

  log(reasign.status === 200, 'Cambio de responsable', String(reasign.status))



  const db = getAdminDb()

  const custodia = await db.collection('cajas').doc(chicaId).collection('historialCustodia').get()

  log(custodia.size >= 2, 'historialCustodia eventos', String(custodia.size))



  const cid = cierre.body?.cierre?.id

  if (cid) {

    const apr = await apiJson(liderToken, 'POST', `${CAJAS}/${chicaId}/cierres/${cid}/aprobar`)

    log(apr.status === 200 && apr.body?.cierre?.estado === 'aprobada', 'Aprobación cierre líder')

  }



  if (chica2Id) {

    const postReasign = await apiJson(respToken, 'POST', `${CAJAS}/${chicaId}/movimientos`, {

      tipo: 'egreso',

      concepto: 'Ya no soy responsable',

      montoCentavos: 100,

    })

    log(postReasign.status === 403 || postReasign.status === 400, 'Ex responsable no opera la caja', String(postReasign.status))

  }



  const movsPrincipal = await db

    .collection('cajaMovimientos')

    .where('cajaId', '==', principalArsId)

    .where('tipo', '==', 'fondeo_enviado')

    .get()

  log(movsPrincipal.size >= 1, 'Movimiento fondeo_enviado en principal', String(movsPrincipal.size))



  const agenda = await apiJson(liderToken, 'POST', '/api/finanzas/agenda/compromisos', {

    concepto: 'Viático E2E transferencia',

    proveedorONombre: 'Empleado viaje',

    montoCentavos: 80_000,

    fechaVencimiento: '2026-12-15',

    medioPago: 'transferencia',

    esViatico: true,

    beneficiarioEmpleado: 'Juan Test',

  })

  log(agenda.status === 201, 'Compromiso viático Agenda', String(agenda.status))

}



main().catch((err) => {

  console.error(err)

  process.exit(1)

})

