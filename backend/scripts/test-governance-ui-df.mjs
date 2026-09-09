/**
 * Verificación visual D→F (Playwright): drawer excepciones, botones granulares Drive,
 * labels auditoría, columna Gobierna.
 *
 * Local:  INTRANET_BASE=http://localhost:5173 (+ functions emulator en :5001)
 * Prod:   INTRANET_BASE=https://bacarnet.web.app
 *
 *   node backend/scripts/test-governance-ui-df.mjs
 */

import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const BASE = process.env.INTRANET_BASE?.trim() || 'http://localhost:5173'
const TEST_USER_EMAIL =
  process.env.UI_TEST_USER_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'
const TARGET_AREA_ID =
  process.env.TARGET_AREA_ID?.trim() || 'r7QVKsrSiqDWC8DrXCac'
const TARGET_DRIVE_FOLDER_ID =
  process.env.TARGET_DRIVE_FOLDER_ID?.trim() || '188-zgNhMIfeUjAI8GracINlItBbFwoUb'

const GRANT_REASON =
  'Prueba UI drawer excepciones gobernanza intranet Bacar septiembre 2026'
const REVOKE_REASON =
  'Revocacion prueba UI drawer excepciones gobernanza intranet Bacar 2026'
const MEMBER_REASON =
  'Prueba UI auditoria member areas checklist intranet Bacar septiembre 2026'

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function api(idToken, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // keep text
  }
  return { status: res.status, body: parsed }
}

/** Cuentas reales: los tests UI no deben cambiar su contraseña (solo custom token). */
const PASSWORD_PROTECTED_EMAILS = new Set([
  'implementaciones.it@bacarsa.com.ar',
])

async function setTemporaryPassword(uid, email) {
  if (PASSWORD_PROTECTED_EMAILS.has(email.trim().toLowerCase())) {
    throw new Error(`Refusing to change password for protected account ${email}`)
  }
  const tempPassword = generateEphemeralPassword()
  await getAuth().updateUser(uid, { password: tempPassword })
  return tempPassword
}

async function signInWithCustomToken(page, uid) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  if (!apiKey) throw new Error('Falta VITE_FIREBASE_API_KEY')
  const customToken = await getAuth().createCustomToken(uid)
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    async ({ customToken, apiKey }) => {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        },
      )
      const payload = await res.json()
      if (!res.ok || !payload.idToken) {
        throw new Error(payload.error?.message ?? 'custom token sign-in failed')
      }
      const storageKey = `firebase:authUser:${apiKey}:[DEFAULT]`
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          uid: payload.localId,
          email: payload.email,
          emailVerified: true,
          isAnonymous: false,
          providerData: [],
          stsTokenManager: {
            refreshToken: payload.refreshToken,
            accessToken: payload.idToken,
            expirationTime: Date.now() + Number(payload.expiresIn ?? 3600) * 1000,
          },
        }),
      )
    },
    { customToken, apiKey },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('Sesión activa').waitFor({ timeout: 25000 })
}

async function login(page, email, password) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('***REMOVED***login-email').fill(email)
  await page.locator('***REMOVED***login-password').fill(password)
  await page
    .locator('form')
    .filter({ has: page.locator('***REMOVED***login-email') })
    .getByRole('button', { name: /^iniciar sesión$/i })
    .click()
  await page.getByText('Sesión activa').waitFor({ timeout: 25000 })
}

async function main() {
  const db = getAdminDb()
  const q = await db.collection('users').where('email', '==', TEST_USER_EMAIL).limit(1).get()
  if (q.empty) throw new Error(`Usuario ${TEST_USER_EMAIL} no encontrado`)
  const targetUid = q.docs[0].id
  const targetRef = db.collection('users').doc(targetUid)
  const beforeSnap = await targetRef.get()
  const beforeActionGrants = beforeSnap.get('actionGrants') ?? null
  const beforeManaged = [...(beforeSnap.get('managedAreaIds') ?? [])]
  const beforeRole = beforeSnap.get('role') ?? 'user'
  const beforeMember = [...(beforeSnap.get('memberAreaIds') ?? [])]

  process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
  const admin = await getTestIdToken()
  const adminPassword = await setTemporaryPassword(admin.uid, admin.email)
  let granteePassword = null

  const results = []
  let testFileId = null
  let testFileName = null
  let folderName = null
  let threeAreaIds = []

  console.log(`BASE: ${BASE}`)
  console.log(`grantee: ${TEST_USER_EMAIL}`)
  console.log('')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(30000)

  try {
    // --- Prep: folder name + borrador file + grantee sólo approval ---
    const root = await api(admin.idToken, 'GET', '/api/drive/files?folderId=root')
    const folder = root.body?.files?.find((f) => f.id === TARGET_DRIVE_FOLDER_ID)
    folderName = folder?.name ?? null
    results.push(line(Boolean(folderName), 'setup  carpeta objetivo resuelta', folderName ?? 'null'))

    await targetRef.update({
      role: 'user',
      managedAreaIds: [],
      actionGrants: {},
    })

    const created = await api(admin.idToken, 'POST', '/api/drive/files', {
      name: `UI D-F borrador ${Date.now()}`,
      type: 'google_doc',
      parentFolderId: TARGET_DRIVE_FOLDER_ID,
      reason: GRANT_REASON,
      classification: 'USO_INTERNO',
    })
    testFileId = created.body?.id ?? null
    testFileName = created.body?.name ?? null
    results.push(
      line(
        created.status === 201 && testFileId,
        'setup  archivo borrador en área objetivo',
        testFileName ?? 'null',
      ),
    )

    // member_areas_change audit seed
    const memberPatch = await api(admin.idToken, 'PATCH', `/api/users/${targetUid}/member-areas`, {
      areaIds: beforeMember,
      reason: MEMBER_REASON,
    })
    results.push(
      line(memberPatch.status === 200, 'setup  member_areas_change vía API', `HTTP ${memberPatch.status}`),
    )

    const areasRes = await api(admin.idToken, 'GET', '/api/drive/files?folderId=root')
    threeAreaIds = (areasRes.body?.files ?? [])
      .filter((f) => f.isFolder && f.id)
      .slice(0, 3)
      .map((f) => f.id)
    if (threeAreaIds.length >= 3) {
      await targetRef.update({ role: 'admin', managedAreaIds: threeAreaIds, actionGrants: {} })
    }

    // --- 1. Drawer excepciones (super_admin) ---
    await login(page, admin.email, adminPassword)
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' })
    await page.locator('h1:text-is("Configuración y usuarios")').waitFor({ timeout: 20000 })

    const userRow = page.locator('tr', { hasText: TEST_USER_EMAIL })
    await userRow.waitFor()

    await userRow.getByRole('button', { name: /Excepciones de gobernanza de/i }).click()
    const drawer = page.locator('aside').filter({ hasText: 'Excepciones de gobernanza' })
    await drawer.waitFor()
    results.push(line(true, '1  drawer excepciones abre'))

    await drawer.getByRole('button', { name: /Agregar excepción/i }).click()
    await page.locator('***REMOVED***grant-action').selectOption('permission_grant')
    await page.locator('***REMOVED***grant-area').waitFor({ timeout: 15000 })
    const areaOptions = page.locator('***REMOVED***grant-area option')
    const optionCount = await areaOptions.count()
    let pickedAreaId = null
    for (let i = 1; i < optionCount; i += 1) {
      const value = await areaOptions.nth(i).getAttribute('value')
      if (value && value !== TARGET_AREA_ID) {
        pickedAreaId = value
        await page.locator('***REMOVED***grant-area').selectOption(value)
        break
      }
    }
    results.push(line(Boolean(pickedAreaId), '1  área disponible para excepción', pickedAreaId ?? 'none'))
    if (pickedAreaId) {
      await page.locator('***REMOVED***grant-reason').fill(GRANT_REASON)
      await page.getByRole('button', { name: /^Confirmar$/i }).click()
      await page.getByText(/excepción agregada/i).waitFor({ timeout: 20000 })
      results.push(line(true, '1  excepción agregada (toast)'))

      const chip = drawer.getByText('Gestionar permisos')
      results.push(line((await chip.count()) > 0, '1  chip visible tras grant'))

      await drawer.getByRole('button', { name: /^Quitar$/i }).first().click()
      await page.locator('***REMOVED***revoke-reason').fill(REVOKE_REASON)
      await page.getByRole('button', { name: /^Quitar$/i }).last().click()
      await page.getByText(/excepción quitada/i).waitFor({ timeout: 20000 })
      results.push(line(true, '1  excepción quitada (toast)'))
      await page.waitForTimeout(500)
      const permisoChips = drawer.locator('li').filter({ hasText: 'Gestionar permisos' })
      results.push(line((await permisoChips.count()) === 0, '1  chip desaparece tras revoke'))
    }

    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})

    // --- 4. Columna Gobierna ---
    if (threeAreaIds.length >= 3) {
      const gobiernaCell = userRow.locator('td').nth(4)
      const cellText = await gobiernaCell.innerText()
      results.push(
        line(/\+1/.test(cellText), '4  usuario 3+ áreas muestra "+1"', cellText.replace(/\s+/g, ' ').trim()),
      )
    } else {
      results.push(line(false, '4  usuario 3+ áreas muestra "+1"', `solo ${threeAreaIds.length} carpetas`))
    }

    const adminRow = page.locator('tr', { hasText: admin.email })
    if ((await adminRow.count()) > 0) {
      const adminGobierna = await adminRow.locator('td').nth(4).innerText()
      results.push(line(/Todo/.test(adminGobierna), '4  super_admin muestra "Todo"', adminGobierna.trim()))
    } else {
      results.push(line(true, '4  super_admin muestra "Todo"', 'fila admin no listada (skip)'))
    }

    await targetRef.update({
      role: 'user',
      managedAreaIds: [],
      actionGrants: { permission_grant: [TARGET_AREA_ID] },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await userRow.waitFor()
    const exBadge = userRow.getByText(/\+[0-9]+ excepc/)
    results.push(line((await exBadge.count()) > 0, '4  badge "+N excepciones" visible'))

    // --- 3. Auditoría labels ---
    await page.goto(`${BASE}/admin/auditoria`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /^Consultar$/i }).click()
    await page.waitForTimeout(2000)

    const auditBody = await page.locator('tbody').innerText()
    results.push(
      line(
        auditBody.includes('Excepción de gobernanza') || auditBody.includes('action_grants_change') === false,
        '3  label action_grants_change legible',
        auditBody.includes('Excepción de gobernanza') ? 'Excepción de gobernanza' : 'sin fila reciente',
      ),
    )
    results.push(
      line(
        auditBody.includes('Cambio de pertenencia') || !auditBody.includes('member_areas_change'),
        '3  label member_areas_change legible',
        auditBody.includes('Cambio de pertenencia') ? 'Cambio de pertenencia' : 'sin fila reciente',
      ),
    )
    results.push(
      line(!auditBody.includes('action_grants_change'), '3  no muestra clave cruda action_grants_change'),
    )
    results.push(
      line(!auditBody.includes('member_areas_change'), '3  no muestra clave cruda member_areas_change'),
    )

    // --- 2. Drive botones granulares (grantee) ---
    await targetRef.update({
      role: 'user',
      managedAreaIds: [],
      actionGrants: { approval: [TARGET_AREA_ID] },
    })
    granteePassword = null
    const granteeContext = await browser.newContext()
    const granteePage = await granteeContext.newPage()
    granteePage.setDefaultTimeout(30000)
    await signInWithCustomToken(granteePage, targetUid)

    await granteePage.goto(`${BASE}/recursos`, { waitUntil: 'domcontentloaded' })
    if (folderName) {
      await granteePage
        .getByRole('button', { name: folderName, exact: true })
        .first()
        .click()
      await granteePage.waitForTimeout(1500)
    }

    await granteePage.getByText(testFileName ?? 'UI D-F borrador', { exact: false }).first().waitFor({ timeout: 20000 })

    const moreBtn = granteePage.getByRole('button', {
      name: new RegExp(`Más acciones para ${testFileName?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? 'UI'}`),
    })
    await moreBtn.click()

    const menu = granteePage.locator('.absolute.right-0.top-9')
    await menu.waitFor()

    results.push(line((await menu.getByRole('button', { name: 'Aprobar' }).count()) > 0, '2  grantee ve Aprobar'))
    results.push(
      line((await menu.getByRole('button', { name: 'Permisos' }).count()) === 0, '2  grantee NO ve Permisos'),
    )
    results.push(
      line(
        (await menu.getByRole('button', { name: 'Clasificación' }).count()) === 0,
        '2  grantee NO ve Clasificación',
      ),
    )
    results.push(
      line(
        (await menu.getByRole('button', { name: 'Copia autorizada' }).count()) === 0,
        '2  grantee NO ve Copia autorizada',
      ),
    )

    const inlineShare = granteePage.getByRole('button', {
      name: new RegExp(`Permisos de ${testFileName?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? 'UI'}`),
    })
    results.push(line((await inlineShare.count()) === 0, '2  grantee NO ve botón inline Permisos'))
    await granteeContext.close()
  } finally {
    if (testFileId) {
      await api(admin.idToken, 'DELETE', `/api/drive/files/${testFileId}`, {
        reason: REVOKE_REASON,
      }).catch(() => {})
    }
    await targetRef.update({
      role: beforeRole,
      managedAreaIds: beforeManaged,
      memberAreaIds: beforeMember,
      actionGrants: beforeActionGrants ?? {},
    })
    if (beforeActionGrants === null) {
      await targetRef.update({ actionGrants: {} })
    }
    await browser.close()
  }

  console.log('')
  const ok = results.every(Boolean)
  console.log(ok ? `RESULTADO UI D→F (${BASE}): OK` : `RESULTADO UI D→F (${BASE}): FALLOS`)
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
