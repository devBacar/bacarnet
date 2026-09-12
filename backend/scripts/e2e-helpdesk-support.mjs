/**
 * E2E público /support (Playwright + API + Calendar + limpieza).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-support.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(SCRIPT_DIR, 'output')
const SCREENSHOT_PATH = resolve(OUTPUT_DIR, 'support-confirmacion.png')

/** Puerto dedicado E2E (evita reutilizar un `npm run dev` sin VITE_API_BASE_URL). */
const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5174)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`

const TEAM_EMAILS = ['admin@bacarsa.com.ar', 'sistemas.ti@bacarsa.com.ar']

const results = []
let ticketIdForCleanup = null
let selectedSlot = null

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function loadEnv() {
  loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
  loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))
  loadEnvFile(resolve(ROOT, '.env.local'))
}

function record(label, ok, detail = '') {
  results.push({ label, ok, detail })
  const mark = ok ? '✅' : '❌'
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function waitForHttpOk(url, timeoutMs = 90_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 600))
  }
  throw new Error(`Timeout esperando ${url}`)
}

async function ensureBackendListening() {
  const { app } = await import('../lib/server.js')
  const server = await new Promise((resolvePromise, reject) => {
    const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
  })
  await waitForHttpOk(`${API_ORIGIN}/api/health`, 30_000)
  console.log(`API local E2E en ${API_ORIGIN}`)
  return server
}

async function ensureViteDev() {
  const child = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        VITE_API_BASE_URL: API_ORIGIN,
      },
      stdio: 'ignore',
      detached: false,
      shell: true,
    },
  )

  await waitForHttpOk(VITE_ORIGIN, 120_000)
  console.log(`Vite E2E en ${VITE_ORIGIN} → API ${API_ORIGIN}`)
  return child
}

function initAdmin() {
  if (getApps().length > 0) return
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath || !existsSync(resolve(credPath))) {
    throw new Error('ADMIN_SDK_KEY_PATH requerido para limpieza')
  }
  const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
}

async function findLatestTicketIdByEmail(email) {
  initAdmin()
  const db = getFirestore()
  const normalized = email.trim().toLowerCase()
  const snap = await db
    .collection('helpdeskTickets')
    .where('requesterEmail', '==', normalized)
    .limit(10)
    .get()
  if (snap.empty) return null
  let best = snap.docs[0]
  for (const doc of snap.docs) {
    const t = doc.get('createdAt')?.toMillis?.() ?? 0
    const bestT = best.get('createdAt')?.toMillis?.() ?? 0
    if (t >= bestT) best = doc
  }
  return best.id
}

async function cleanupHelpdeskTicket(ticketId) {
  if (!ticketId) {
    record('Limpieza completa (ticket, reunión y evento borrados)', false, 'sin ticketId')
    return
  }

  initAdmin()
  const db = getFirestore()
  const { deleteCalendarEvent } = await import('../lib/modules/helpdesk/calendar.js')

  const reunionsSnap = await db
    .collection('helpdeskTickets')
    .doc(ticketId)
    .collection('reuniones')
    .get()

  for (const reunionDoc of reunionsSnap.docs) {
    const eventId =
      typeof reunionDoc.get('calendarEventId') === 'string' ? reunionDoc.get('calendarEventId') : ''
    const organizer =
      typeof reunionDoc.get('calendarOrganizerEmail') === 'string'
        ? reunionDoc.get('calendarOrganizerEmail')
        : ''
    if (eventId && organizer) {
      try {
        await deleteCalendarEvent(organizer, eventId)
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? err.code : null
        if (code !== 404 && code !== 410) throw err
      }
    }
  }

  for (const sub of ['reuniones', 'notas']) {
    const snap = await db.collection('helpdeskTickets').doc(ticketId).collection(sub).get()
    for (const doc of snap.docs) {
      await doc.ref.delete()
    }
  }

  await db.collection('helpdeskTickets').doc(ticketId).delete().catch(() => {})
  const check = await db.collection('helpdeskTickets').doc(ticketId).get()
  record(
    'Limpieza completa (ticket, reunión y evento borrados)',
    !check.exists,
    check.exists ? 'ticket aún existe' : undefined,
  )
}

async function runPlaywrightFlow(token, requesterEmail) {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(`${VITE_ORIGIN}/support?t=${encodeURIComponent(token)}`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    })

    const libreSlot = page.locator('button:has-text("Libre")').first()
    await libreSlot.waitFor({ state: 'visible', timeout: 60_000 })
    record('Disponibilidad cargó horarios', true)

    const submitBtn = page.getByRole('button', { name: 'Enviar solicitud' })
    const disabledBefore = await submitBtn.isDisabled()
    record(
      'Botón deshabilitado antes de completar el formulario',
      disabledBefore,
      disabledBefore ? undefined : 'el botón estaba habilitado demasiado pronto',
    )

    await page.locator('#helpdesk-problematica').fill(
      'E2E Playwright — prueba automatizada del flujo /support (ignorar).',
    )
    await page.getByRole('button', { name: /Alta/i }).first().click()

    const firstLibre = libreSlot
    const ariaLabel = (await firstLibre.getAttribute('aria-label')) ?? ''
    const slotMatch = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2})/.exec(ariaLabel)
    if (slotMatch) {
      selectedSlot = { fecha: slotMatch[1], hora: slotMatch[2] }
    }
    await firstLibre.click()

    const enabledAfter = await submitBtn.isEnabled()
    record(
      'Botón habilitado tras completar',
      enabledAfter,
      enabledAfter ? undefined : 'sigue deshabilitado',
    )

    const createResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/helpdesk/solicitudes') &&
        res.request().method() === 'POST' &&
        res.status() !== 0,
      { timeout: 60_000 },
    )

    await submitBtn.click()
    const res = await createResponse
    const httpStatus = res.status()

    await page.getByRole('heading', { name: 'Solicitud enviada' }).waitFor({ timeout: 60_000 })
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })

    const pageText = await page.locator('body').innerText()
    const tokenVisible = pageText.includes(token)
    const createdOk = httpStatus === 201
    if (createdOk) {
      ticketIdForCleanup = await findLatestTicketIdByEmail(requesterEmail)
    }

    record(
      'Solicitud creada (201) y pantalla de confirmación sin token visible',
      createdOk && !tokenVisible,
      !createdOk
        ? `status ${res.status()}`
        : tokenVisible
          ? 'el token sigue visible en pantalla'
          : undefined,
    )
  } catch (err) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'support-e2e-failure.png'), fullPage: true }).catch(() => {})
    throw err
  } finally {
    await browser.close()
  }
}

async function verifyCalendarAndToken(token) {
  if (!selectedSlot?.fecha || !selectedSlot?.hora) {
    record('Slot quedó ocupado en Calendar tras la reserva', false, 'no se capturó slot elegido')
  } else {
    const { parseSlotLabels, isJointSlotFree } = await import(
      '../lib/modules/helpdesk/slotScheduling.js'
    )
    const { getFreeBusyForEmails } = await import('../lib/modules/helpdesk/calendar.js')
    const { startISO, endISO } = parseSlotLabels(selectedSlot.fecha, selectedSlot.hora)
    const busy = await getFreeBusyForEmails(TEAM_EMAILS, startISO, endISO)
    const libre = isJointSlotFree(busy, TEAM_EMAILS, selectedSlot.fecha, selectedSlot.hora)
    record(
      'Slot quedó ocupado en Calendar tras la reserva',
      !libre,
      libre ? 'freebusy aún marca libre' : undefined,
    )
  }

  const replay = await fetch(`${API_ORIGIN}/api/helpdesk/solicitudes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      problematica: 'Reintento E2E',
      urgencia: 'baja',
      fecha: selectedSlot?.fecha ?? '14/09/2026',
      hora: selectedSlot?.hora ?? '09:00',
    }),
  })
  record(
    'Token no reutilizable (401 en segundo intento)',
    replay.status === 401,
    `status ${replay.status}`,
  )
}

async function main() {
  loadEnv()

  if (!process.env.HELPDESK_TOKEN_SECRET?.trim()) {
    throw new Error('HELPDESK_TOKEN_SECRET requerido en backend/.env.local')
  }

  let backendServer = null
  let viteProcess = null

  try {
    backendServer = await ensureBackendListening()
    viteProcess = await ensureViteDev()

    const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')
    const requesterEmail = `e2e.support+${Date.now()}@bacarsa.com.ar`
    const token = generarTokenSolicitud({
      uid: null,
      email: requesterEmail,
      nombre: 'E2E Support Playwright',
      areaId: 'r7QVKsrSiqDWC8DrXCac',
      areaNombre: 'Sistemas',
    })

    const preDisp = await fetch(
      `${API_ORIGIN}/api/helpdesk/disponibilidad-inicial?token=${encodeURIComponent(token)}&semanaOffset=0`,
    )
    const preBody = await preDisp.json().catch(() => ({}))
    const preLibre = (preBody.slots ?? []).find((s) => s.libre === true)
    if (!preLibre) {
      throw new Error('No hay slots libres en API antes del E2E UI')
    }

    await runPlaywrightFlow(token, requesterEmail)
    await verifyCalendarAndToken(token)
  } catch (err) {
    console.error('\nError en E2E:', err)
    record('Ejecución E2E', false, err instanceof Error ? err.message : String(err))
  } finally {
    try {
      await cleanupHelpdeskTicket(ticketIdForCleanup)
    } catch (cleanupErr) {
      console.error('Limpieza falló:', cleanupErr)
      record(
        'Limpieza completa (ticket, reunión y evento borrados)',
        false,
        cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      )
    }

    if (viteProcess && !viteProcess.killed) {
      viteProcess.kill('SIGTERM')
    }
    if (backendServer) {
      await new Promise((r) => backendServer.close(r))
    }
  }

  console.log('\n=== Resumen E2E /support ===')
  for (const row of results) {
    const mark = row.ok ? '✅' : '❌'
    console.log(`${mark} ${row.label}${row.detail ? ` — ${row.detail}` : ''}`)
  }

  const failed = results.some((r) => !r.ok)
  if (existsSync(SCREENSHOT_PATH)) {
    console.log(`\nScreenshot: ${SCREENSHOT_PATH}`)
  }
  process.exit(failed ? 1 : 0)
}

main()
