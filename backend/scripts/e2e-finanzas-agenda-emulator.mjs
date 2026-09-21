/**
 * E2E Agenda Finanzas contra emuladores Firestore + Functions.
 *
 * Requiere:
 *   firebase emulators:start --only firestore,functions --project bacar-web
 *
 * Opcional UI (puntos 2 y 5):
 *   npm run dev  →  INTRANET_BASE=http://localhost:5173
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   FUNCTIONS_API_BASE=http://127.0.0.1:5001/bacar-web/southamerica-east1/api \
 *   node backend/scripts/e2e-finanzas-agenda-emulator.mjs
 */

import { chromium } from 'playwright'
import { deleteApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { syncCuentasFromProvider } from '../lib/modules/finanzas/services/cuentas.service.js'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

function useFirestoreEmulator() {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST?.trim() || '127.0.0.1:8080'
}

const API =
  process.env.FUNCTIONS_API_BASE?.trim() ||
  'http://127.0.0.1:5001/bacar-web/southamerica-east1/api'
const BASE = process.env.INTRANET_BASE?.trim() || 'http://localhost:5173'
const RUN_UI = process.env.SKIP_UI !== '1'

function log(ok, label, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`${tag}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function api(idToken, method, path, body) {
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
  return { status: res.status, body: parsed }
}

async function seedEmulatorUser(uid, email) {
  const db = getAdminDb()
  await db.collection('users').doc(uid).set(
    {
      email,
      displayName: 'E2E Finanzas Agenda',
      role: 'super_admin',
      accountStatus: 'active',
    },
    { merge: true },
  )
  await db.collection('global_settings').doc('main').set({ finanzasEnabled: true }, { merge: true })
}

function urgenciaRank(u) {
  if (u === 'alta') return 0
  if (u === 'media') return 1
  if (u === 'baja') return 2
  return 3
}

function assertPendientesOrder(compromisos) {
  for (let i = 1; i < compromisos.length; i++) {
    const a = compromisos[i - 1]
    const b = compromisos[i]
    const ra = urgenciaRank(a.urgenciaManual)
    const rb = urgenciaRank(b.urgenciaManual)
    if (ra > rb) return { ok: false, detail: `urgencia ${a.concepto}(${a.urgenciaManual}) antes de ${b.concepto}(${b.urgenciaManual})` }
    if (ra === rb) {
      const fa = a.fechaVencimiento ? Date.parse(a.fechaVencimiento) : 0
      const fb = b.fechaVencimiento ? Date.parse(b.fechaVencimiento) : 0
      if (fa > fb) {
        return {
          ok: false,
          detail: `misma urgencia pero ${a.concepto} vence después que ${b.concepto}`,
        }
      }
    }
  }
  return { ok: true, detail: compromisos.map((c) => `${c.concepto}[${c.urgenciaManual ?? '—'}]`).join(' → ') }
}

async function runApiChecks(idToken) {
  const results = []

  await api(idToken, 'POST', '/api/finanzas/agenda/compromisos', {
    concepto: 'E2E Cheque vinculado',
    proveedorONombre: 'Proveedor test',
    montoCentavos: 50_000_00,
    fechaVencimiento: '2026-10-01',
    urgenciaManual: 'baja',
    medioPago: 'cheque',
    chequeId: 'cheque-emulador-fake-id',
  })

  const creates = [
    {
      concepto: 'E2E Alta urgencia',
      proveedorONombre: 'Prov A',
      montoCentavos: 10_000_00,
      fechaVencimiento: '2026-12-31',
      urgenciaManual: 'alta',
      medioPago: 'transferencia',
    },
    {
      concepto: 'E2E Media urgencia',
      proveedorONombre: 'Prov B',
      montoCentavos: 20_000_00,
      fechaVencimiento: '2026-11-15',
      urgenciaManual: 'media',
      medioPago: 'transferencia',
    },
    {
      concepto: 'E2E Baja urgencia',
      proveedorONombre: 'Prov C',
      montoCentavos: 30_000_00,
      fechaVencimiento: '2026-10-01',
      urgenciaManual: 'baja',
      medioPago: 'transferencia',
    },
  ]

  let payTargetId = null
  for (const body of creates) {
    const cr = await api(idToken, 'POST', '/api/finanzas/agenda/compromisos', body)
    if (cr.status !== 201) {
      results.push([false, '1. Crear compromisos', JSON.stringify(cr.body)])
      return { results, lowSaldo: null, payTargetId: null }
    }
  }

  const payCr = await api(idToken, 'POST', '/api/finanzas/agenda/compromisos', {
    concepto: 'E2E Pago saldo bajo',
    proveedorONombre: 'Prov Pago',
    montoCentavos: 15_000_000,
    fechaVencimiento: '2026-10-05',
    urgenciaManual: 'alta',
    medioPago: 'transferencia',
  })
  payTargetId = payCr.body?.compromiso?.id ?? null

  const listPend = await api(idToken, 'GET', '/api/finanzas/agenda/compromisos?vista=pendientes')
  const pendientes = listPend.body?.compromisos ?? []
  const ours = pendientes.filter((c) => c.concepto?.startsWith('E2E '))
  const order = assertPendientesOrder(ours.filter((c) => c.concepto !== 'E2E Cheque vinculado'))
  results.push([
    order.ok,
    '1. Orden Pendientes (urgencia → fecha)',
    order.detail,
  ])

  const cuentasRes = await api(idToken, 'GET', '/api/finanzas/cuentas')
  const cuentas = cuentasRes.body?.cuentas ?? []
  const lowSaldo = [...cuentas]
    .filter((c) => c.moneda === 'ARS' && c.tipo === 'CA')
    .sort((a, b) => a.saldoActualCentavos - b.saldoActualCentavos)[0]
  if (!payTargetId || !lowSaldo) {
    results.push([false, '2/3. Precondición marcar pagado', 'falta compromiso o cuenta'])
    return { results, lowSaldo: null, payTargetId: null }
  }

  return {
    results,
    lowSaldo,
    payTargetId,
    chequeRowConcepto: 'E2E Cheque vinculado',
    pendingUi: true,
  }
}

async function runApiAfterUi(idToken, ctx) {
  const results = []
  const { lowSaldo, payTargetId } = ctx
  if (!lowSaldo || !payTargetId) {
    results.push([false, '2–5. API post-UI', 'setup incompleto (ver pasos anteriores)'])
    return results
  }
  const fechaPago = '2026-09-10'
  const payRes = await api(idToken, 'POST', `/api/finanzas/agenda/compromisos/${payTargetId}/marcar-pagado`, {
    medioPago: 'transferencia',
    cuentaId: lowSaldo.id,
    fechaPago,
  })
  results.push([
    payRes.status === 200,
    '2. Marcar pagado (API, cuenta saldo bajo)',
    `cuenta=${lowSaldo.id} saldo=${lowSaldo.saldoActualCentavos} monto=15000000 status=${payRes.status}`,
  ])

  const pendAfter = await api(idToken, 'GET', '/api/finanzas/agenda/compromisos?vista=pendientes')
  const pagados = await api(idToken, 'GET', '/api/finanzas/agenda/compromisos?vista=pagados')
  const stillPend = (pendAfter.body?.compromisos ?? []).some((c) => c.id === payTargetId)
  const inPagados = (pagados.body?.compromisos ?? []).find((c) => c.id === payTargetId)
  const fechaOk =
    inPagados?.fechaPago && String(inPagados.fechaPago).slice(0, 10) === fechaPago
  results.push([
    !stillPend && Boolean(inPagados) && fechaOk,
    '3. Compromiso en Pagados y fuera de Pendientes',
    stillPend
      ? 'sigue en pendientes'
      : inPagados
        ? `pagados OK fechaPago=${String(inPagados.fechaPago).slice(0, 10)}`
        : 'no aparece en pagados',
  ])

  const cobroCr = await api(idToken, 'POST', '/api/finanzas/agenda/cobros', {
    clienteONombre: 'Cliente E2E',
    montoCentavos: 15_000_00,
    fechaEsperada: '2026-11-01',
    urgenciaManual: 'media',
  })
  const cobroId = cobroCr.body?.cobro?.id
  const cuentasRes = await api(idToken, 'GET', '/api/finanzas/cuentas')
  const cuentas = cuentasRes.body?.cuentas ?? []
  const cuentaIngreso = cuentas.find((c) => c.moneda === 'ARS') ?? lowSaldo
  const fechaCobro = '2026-09-12'
  const confRes = await api(idToken, 'POST', `/api/finanzas/agenda/cobros/${cobroId}/confirmar`, {
    cuentaId: cuentaIngreso.id,
    fechaConfirmado: fechaCobro,
  })
  const espAfter = await api(idToken, 'GET', '/api/finanzas/agenda/cobros?vista=esperados')
  const cobrados = await api(idToken, 'GET', '/api/finanzas/agenda/cobros?vista=cobrados')
  const stillEsp = (espAfter.body?.cobros ?? []).some((c) => c.id === cobroId)
  const inCobrados = (cobrados.body?.cobros ?? []).find((c) => c.id === cobroId)
  const fechaCobroOk =
    inCobrados?.fechaConfirmado && String(inCobrados.fechaConfirmado).slice(0, 10) === fechaCobro
  results.push([
    confRes.status === 200 && !stillEsp && Boolean(inCobrados) && fechaCobroOk,
    '4. Cobro en Cobrados y fuera de Esperados',
    stillEsp
      ? 'sigue en esperados'
      : inCobrados
        ? `cobrados OK fechaConfirmado=${String(inCobrados.fechaConfirmado).slice(0, 10)}`
        : `confirm status=${confRes.status}`,
  ])

  const listPend2 = await api(idToken, 'GET', '/api/finanzas/agenda/compromisos?vista=pendientes')
  const chequeRow = (listPend2.body?.compromisos ?? []).find(
    (c) => c.concepto === 'E2E Cheque vinculado',
  )
  results.push([
    Boolean(chequeRow?.chequeId) && !chequeRow?.cheque,
    '5. Cheque vinculado (API: chequeId sin objeto cheque)',
    chequeRow
      ? `chequeId=${chequeRow.chequeId} cheque=${chequeRow.cheque}`
      : 'no encontré fila E2E Cheque vinculado',
  ])

  return results
}

async function runUiChecks(customToken, lowSaldoCuentaId) {
  const uiResults = []
  if (!RUN_UI) {
    uiResults.push([true, '2. Banner ámbar (UI)', 'SKIP_UI=1'])
    uiResults.push([true, '5. Texto Vinculado sin Link (UI)', 'SKIP_UI=1'])
    return uiResults
  }

  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    let dialogFired = false
    page.on('dialog', async (d) => {
      dialogFired = true
      await d.dismiss()
    })

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', null, {
      timeout: 30_000,
    })
    await page.evaluate(async (token) => {
      await window.__e2eSignInWithCustomToken(token)
    }, customToken)
    await page.goto(`${BASE}/finanzas/agenda`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.getByRole('heading', { name: 'Agenda' }).waitFor({ timeout: 45_000 })

    await page.getByRole('button', { name: 'Pendientes' }).click()
    const marcarBtn = page
      .getByRole('row', { name: /E2E Pago saldo bajo/ })
      .getByRole('button', { name: 'Marcar pagado' })
    if ((await marcarBtn.count()) === 0) {
      await page.getByRole('button', { name: 'Marcar pagado' }).first().click()
    } else {
      await marcarBtn.click()
    }
    await page.getByRole('heading', { name: 'Marcar pagado' }).waitFor()

    const cuentaSelect = page.locator('#agenda-pagado-cuenta')
    await cuentaSelect.selectOption(lowSaldoCuentaId)
    const bannerVisible = await page
      .getByText('El saldo de esta cuenta es menor al monto', { exact: false })
      .isVisible()
      .catch(() => false)

    uiResults.push([
      bannerVisible && !dialogFired,
      '2. Banner ámbar sin window.confirm (UI)',
      `banner=${bannerVisible} dialog=${dialogFired} (sin enviar el formulario)`,
    ])
    await page.getByRole('button', { name: 'Cancelar' }).click()

    const vinculado = page.getByText('Vinculado', { exact: true })
    const chequesLink = page.locator('a[href="/finanzas/cheques"]')
    const vCount = await vinculado.count()
    const linkCount = await chequesLink.count()
    uiResults.push([
      vCount > 0 && linkCount === 0,
      '5. "Vinculado" visible, sin Link a /finanzas/cheques (UI)',
      `vinculado=${vCount} linksCheques=${linkCount}`,
    ])
  } catch (err) {
    uiResults.push([
      false,
      'UI emulador',
      err instanceof Error ? err.message : String(err),
    ])
  } finally {
    await browser?.close()
  }
  return uiResults
}

async function resetAdminForEmulator() {
  for (const app of getApps()) {
    await deleteApp(app)
  }
  useFirestoreEmulator()
  initAdmin()
}

async function main() {
  const savedEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST
  delete process.env.FIRESTORE_EMULATOR_HOST
  const { uid, email, idToken } = await getTestIdToken()
  await resetAdminForEmulator()
  if (savedEmulatorHost) process.env.FIRESTORE_EMULATOR_HOST = savedEmulatorHost

  const auth = getAuth()
  const customToken = await auth.createCustomToken(uid)

  await seedEmulatorUser(uid, email)
  await syncCuentasFromProvider({ actorUid: uid })

  console.log(`\n=== Finanzas Agenda E2E (emulador) ===`)
  console.log(`API=${API}`)
  console.log(`Firestore emulator=${process.env.FIRESTORE_EMULATOR_HOST}`)
  console.log(`uid=${uid}\n`)

  const ctx = await runApiChecks(idToken)
  for (const [ok, label, detail] of ctx.results) {
    log(ok, label, detail)
  }

  const uiResults = await runUiChecks(customToken, ctx.lowSaldo?.id)
  for (const [ok, label, detail] of uiResults) {
    log(ok, label, detail)
  }

  const afterResults = await runApiAfterUi(idToken, ctx)
  for (const [ok, label, detail] of afterResults) {
    log(ok, label, detail)
  }

  const allOk = [...ctx.results, ...uiResults, ...afterResults].every((r) => r[0])
  if (!allOk) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
