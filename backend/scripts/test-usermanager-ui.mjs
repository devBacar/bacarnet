/**
 * Prueba UI real de UserManager (Gestionar rol → managed areas + motivo).
 * Login email/contraseña temporal vía Admin SDK (solo entorno de prueba).
 *
 *   node backend/scripts/test-usermanager-ui.mjs
 */

import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const BASE = process.env.INTRANET_BASE?.trim() || 'https://bacarnet.web.app'
const TEST_USER_EMAIL =
  process.env.UI_TEST_USER_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'
const REASON =
  'Prueba UI UserManager managed areas checklist intranet Bacar septiembre 2026'

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function setTemporaryPassword(uid) {
  const tempPassword = generateEphemeralPassword()
  await getAuth().updateUser(uid, { password: tempPassword })
  return tempPassword
}

async function main() {
  process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
  const adminUser = await getTestIdToken()
  const tempPassword = await setTemporaryPassword(adminUser.uid)

  const db = getAdminDb()
  const q = await db.collection('users').where('email', '==', TEST_USER_EMAIL).limit(1).get()
  if (q.empty) throw new Error(`Usuario ${TEST_USER_EMAIL} no encontrado`)
  const targetUid = q.docs[0].id
  const beforeManaged = Array.isArray(q.docs[0].get('managedAreaIds'))
    ? [...q.docs[0].get('managedAreaIds')]
    : []
  const beforeRole = q.docs[0].get('role') ?? 'user'

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(30000)

  const results = []

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.locator('***REMOVED***login-email').fill(adminUser.email)
    await page.locator('***REMOVED***login-password').fill(tempPassword)
    await page.locator('form').filter({ has: page.locator('***REMOVED***login-email') }).getByRole('button', { name: /^iniciar sesión$/i }).click()
    await page.getByText('Sesión activa').waitFor({ timeout: 20000 })
    results.push(line(true, '5  login super_admin en UI', adminUser.email))

    await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' })
    await page.locator('h1:text-is("Configuración y usuarios")').waitFor({ timeout: 20000 })
    results.push(
      line(page.url().includes('/admin/users'), '5  navegación a /admin/users', page.url()),
    )

    const userRow = page.locator('tr', { hasText: TEST_USER_EMAIL })
    await userRow.waitFor()
    results.push(line((await userRow.count()) > 0, '5  fila del usuario de prueba visible'))

    await userRow.getByRole('button', { name: /Gestionar rol de/i }).click()
    const drawer = page.locator('aside').filter({ hasText: 'Gestionar rol' })
    await drawer.locator('***REMOVED***assign-role').waitFor()
    const currentRole = await drawer.locator('***REMOVED***assign-role').inputValue()
    if (currentRole !== 'admin') {
      await drawer.locator('***REMOVED***assign-role').selectOption('admin')
    }
    await drawer.getByText('Áreas administradas').waitFor({ timeout: 15000 })

    const areaCheckboxes = drawer.locator('input[type=checkbox]')
    await areaCheckboxes.first().waitFor({ timeout: 15000 })
    const checkboxCount = await areaCheckboxes.count()
    results.push(line(checkboxCount > 0, '5  checkboxes de áreas visibles', `count=${checkboxCount}`))

    const first = areaCheckboxes.first()
    if (await first.isChecked()) await first.uncheck()
    else await first.check()

    await drawer.getByRole('button', { name: /^Guardar$/i }).click()
    await page.getByRole('dialog').waitFor()
    results.push(
      line((await page.locator('***REMOVED***role-areas-reason').count()) > 0, '5  modal pide motivo'),
    )

    await page.locator('***REMOVED***role-areas-reason').fill(REASON)
    await page.getByRole('button', { name: /^Confirmar$/i }).click()
    await page.getByText(/rol actualizado/i).waitFor({ timeout: 20000 })
    results.push(line(true, '5  toast de éxito tras confirmar'))

    const afterSnap = await db.collection('users').doc(targetUid).get()
    const afterManaged = afterSnap.get('managedAreaIds') ?? []
    const afterRole = afterSnap.get('role')
    results.push(line(afterRole === 'admin', '5  role=admin en Firestore', String(afterRole)))
    results.push(
      line(
        JSON.stringify([...afterManaged].sort()) !== JSON.stringify([...beforeManaged].sort()) ||
          beforeRole !== 'admin',
        '5  managedAreaIds cambió en Firestore',
        JSON.stringify(afterManaged),
      ),
    )

    const auditQ = await db
      .collection('auditLogs')
      .where('targetId', '==', targetUid)
      .where('action', '==', 'managed_areas_change')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
    const audit = auditQ.empty ? null : auditQ.docs[0].data()
    results.push(
      line(
        audit?.reason === REASON,
        '5  auditoría managed_areas_change con motivo UI',
        audit?.reason ?? 'sin log',
      ),
    )
  } finally {
    await db.collection('users').doc(targetUid).update({
      role: beforeRole,
      managedAreaIds: beforeManaged,
    })
    await browser.close()
  }

  console.log('')
  const ok = results.every(Boolean)
  console.log(ok ? 'RESULTADO UI UserManager: OK' : 'RESULTADO UI UserManager: FALLOS')
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
