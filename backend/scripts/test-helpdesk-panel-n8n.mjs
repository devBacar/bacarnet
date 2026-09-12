/**
 * Panel helpdesk + webhooks n8n (estado, correo-enviado).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-panel-n8n.mjs
 */

import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FieldValue } from 'firebase-admin/firestore'
import { getTestIdToken, initAdmin, getAdminDb } from './get-test-token.mjs'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
}

const checks = []

function record(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function deleteSubcollection(db, ticketId, sub) {
  const snap = await db.collection('helpdeskTickets').doc(ticketId).collection(sub).get()
  for (const doc of snap.docs) {
    await doc.ref.delete()
  }
}

async function main() {
  loadEnv()
  initAdmin()
  const db = getAdminDb()

  const n8nApiKey = process.env.HELPDESK_N8N_API_KEY?.trim()
  if (!n8nApiKey) {
    throw new Error('Definí HELPDESK_N8N_API_KEY en backend/.env.local')
  }

  const webhookBodies = []
  const mockServer = createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        webhookBodies.push(JSON.parse(raw))
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('ok')
      } catch (err) {
        res.writeHead(500)
        res.end(String(err))
      }
    })
  })

  const mockPort = await new Promise((resolvePort, reject) => {
    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('No se pudo abrir servidor mock'))
        return
      }
      resolvePort(addr.port)
    })
  })

  let apiServer
  let apiBase = process.env.FUNCTIONS_API_BASE?.trim() || ''
  if (!apiBase) {
    const { app } = await import('../lib/server.js')
    const port = Number(process.env.HELPDESK_TEST_PORT ?? 8798)
    await new Promise((resolveListen, reject) => {
      apiServer = app.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolveListen()))
    })
    apiBase = `http://127.0.0.1:${port}`
    console.log(`Express local en ${apiBase}`)
  }
  apiBase = apiBase.replace(/\/+$/, '')

  const { idToken, uid, email } = await getTestIdToken()

  const ticketRef = db.collection('helpdeskTickets').doc()
  const ticketId = ticketRef.id
  let emailLogId = null

  await ticketRef.set({
    token: 'test-token-panel',
    requesterUid: uid,
    requesterEmail: email,
    requesterNombre: 'Prueba panel helpdesk',
    areaId: 'test-area',
    areaNombre: 'Sistemas',
    problematica: 'Ticket de prueba automatizada panel/n8n',
    urgencia: 'media',
    estadoIdx: 1,
    asignadoATeamId: null,
    createdAt: FieldValue.serverTimestamp(),
  })

  const authHeaders = {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  }

  const savedEstadoWebhook = process.env.HELPDESK_N8N_WEBHOOK_ESTADO_CAMBIADO
  delete process.env.HELPDESK_N8N_WEBHOOK_ESTADO_CAMBIADO

  try {
    const patchSinWebhook = await fetch(`${apiBase}/api/helpdesk/tickets/${ticketId}/estado`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ estadoIdx: 2 }),
    })
    const patchSinWebhookBody = await patchSinWebhook.json().catch(() => ({}))
    record(
      'PATCH estado sin webhook configurado (no rompe)',
      patchSinWebhook.status === 200 && patchSinWebhookBody.estadoIdx === 2,
      `status=${patchSinWebhook.status}`,
    )

    process.env.HELPDESK_N8N_WEBHOOK_ESTADO_CAMBIADO = `http://127.0.0.1:${mockPort}/n8n-estado`
    const beforeHooks = webhookBodies.length

    const patchConWebhook = await fetch(`${apiBase}/api/helpdesk/tickets/${ticketId}/estado`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ estadoIdx: 3 }),
    })
    await sleep(250)
    const patchConWebhookBody = await patchConWebhook.json().catch(() => ({}))
    const lastHook = webhookBodies[webhookBodies.length - 1]
    record(
      'PATCH estado dispara webhook n8n de prueba',
      patchConWebhook.status === 200 &&
        patchConWebhookBody.estadoIdx === 3 &&
        webhookBodies.length > beforeHooks &&
        lastHook?.evento === 'estado_cambiado' &&
        lastHook?.ticketId === ticketId &&
        lastHook?.estadoIdx === 3,
      `hooks=${webhookBodies.length - beforeHooks}`,
    )

    const correoRes = await fetch(`${apiBase}/api/helpdesk/webhooks/correo-enviado`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': n8nApiKey,
      },
      body: JSON.stringify({
        tipo: 'actualizacion_estado',
        destinatarios: [email],
        area: 'Sistemas',
        ticketId,
      }),
    })
    const correoBody = await correoRes.json().catch(() => ({}))
    emailLogId = typeof correoBody.logId === 'string' ? correoBody.logId : null
    const emailLogSnap = emailLogId
      ? await db.collection('helpdeskEmailLog').doc(emailLogId).get()
      : null
    record(
      'POST correo-enviado crea helpdeskEmailLog',
      correoRes.status === 201 &&
        emailLogSnap?.exists === true &&
        emailLogSnap.get('ticketId') === ticketId &&
        emailLogSnap.get('area') === 'Sistemas',
      `status=${correoRes.status}`,
    )
  } finally {
    if (savedEstadoWebhook === undefined) {
      delete process.env.HELPDESK_N8N_WEBHOOK_ESTADO_CAMBIADO
    } else {
      process.env.HELPDESK_N8N_WEBHOOK_ESTADO_CAMBIADO = savedEstadoWebhook
    }

    console.log('\nLimpieza…')
    await deleteSubcollection(db, ticketId, 'reuniones')
    await deleteSubcollection(db, ticketId, 'notas')
    await ticketRef.delete()
    if (emailLogId) {
      await db.collection('helpdeskEmailLog').doc(emailLogId).delete()
    }

    await new Promise((resolveClose) => mockServer.close(resolveClose))
    if (apiServer) {
      await new Promise((resolveClose) => apiServer.close(resolveClose))
    }
  }

  console.log('\n=== Resumen ===')
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}`)
  }

  const failed = checks.filter((c) => !c.ok)
  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
