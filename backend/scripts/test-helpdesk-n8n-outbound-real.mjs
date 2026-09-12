/**
 * E2E real: webhooks salientes n8n (solicitud_creada + estado_cambiado).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-n8n-outbound-real.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FieldValue } from 'firebase-admin/firestore'
import { getTestIdToken, initAdmin, getAdminDb } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_AREA = 'N8N Outbound Test'

const sessionTicketIds = new Set()

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

function maskSecret(value) {
  if (!value || value.length < 8) return '(vacío o corto)'
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`
}

async function seedTestTicket({ uid, email, displayName }) {
  initAdmin()
  const db = getAdminDb()
  const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(1).get()
  if (teamSnap.empty) throw new Error('helpdeskTeam vacío')
  const assigneeId = teamSnap.docs[0].id

  const ref = db.collection('helpdeskTickets').doc()
  sessionTicketIds.add(ref.id)

  await ref.set({
    token: 'n8n-outbound-test-token',
    requesterUid: uid,
    requesterEmail: email,
    requesterNombre: displayName || 'N8N Outbound Test',
    areaId: 'r7QVKsrSiqDWC8DrXCac',
    areaNombre: TEST_AREA,
    problematica: 'Prueba webhook n8n saliente — ignorar',
    urgencia: 'baja',
    estadoIdx: 1,
    asignadoATeamId: assigneeId,
    createdAt: FieldValue.serverTimestamp(),
  })

  return { ticketId: ref.id, assigneeId }
}

async function cleanupSession() {
  for (const id of sessionTicketIds) {
    await deleteHelpdeskTicketFull(id)
  }
  sessionTicketIds.clear()
}

async function main() {
  loadEnv()

  const webhookSolicitud = process.env.HELPDESK_N8N_WEBHOOK_SOLICITUD_CREADA?.trim()
  const webhookEstado = process.env.HELPDESK_N8N_WEBHOOK_ESTADO_CAMBIADO?.trim()
  const outboundKey = process.env.HELPDESK_N8N_OUTBOUND_API_KEY?.trim()

  console.log('=== Config (enmascarada) ===')
  console.log('HELPDESK_N8N_WEBHOOK_SOLICITUD_CREADA:', webhookSolicitud || '(vacío)')
  console.log('HELPDESK_N8N_WEBHOOK_ESTADO_CAMBIADO:', webhookEstado || '(vacío)')
  console.log('HELPDESK_N8N_OUTBOUND_API_KEY:', maskSecret(outboundKey))

  if (!webhookSolicitud || !webhookEstado || !outboundKey) {
    throw new Error('Faltan webhooks o HELPDESK_N8N_OUTBOUND_API_KEY en backend/.env.local')
  }

  let server
  let ticketId

  try {
    const { app } = await import('../lib/server.js')
    const port = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
    server = await new Promise((resolvePromise, reject) => {
      const s = app.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
    })
    const base = `http://127.0.0.1:${port}`

    const { uid, email, idToken } = await getTestIdToken()
    console.log(`\nSolicitante de prueba: ${email}`)

    const seeded = await seedTestTicket({
      uid,
      email,
      displayName: 'N8N Outbound Test',
    })
    ticketId = seeded.ticketId
    console.log(`Ticket creado: ${ticketId}`)

    const { notificarN8n } = await import('../lib/modules/helpdesk/n8nWebhooks.js')
    const { ticketPayloadForN8n } = await import('../lib/modules/helpdesk/serializeTicket.js')

    const db = getAdminDb()
    const snap = await db.collection('helpdeskTickets').doc(ticketId).get()
    const ticket = { id: ticketId, ...snap.data() }

    const rSolicitud = await notificarN8n('solicitud_creada', {
      ...ticketPayloadForN8n(ticket),
    })
    console.log('\nPOST n8n solicitud_creada →', rSolicitud)
    if (!rSolicitud.ok || rSolicitud.status !== 200) {
      throw new Error(`solicitud_creada no devolvió 200 (got ${rSolicitud.status ?? rSolicitud.reason})`)
    }

    const nuevoEstadoIdx = 3
    const patchRes = await fetch(`${base}/api/helpdesk/tickets/${ticketId}/estado`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ estadoIdx: nuevoEstadoIdx }),
    })
    const patchBody = await patchRes.json().catch(() => ({}))
    console.log(`\nPATCH estado → ${patchRes.status}`, patchBody)

    if (patchRes.status !== 200) {
      throw new Error('PATCH estado falló')
    }

    const { peekLastN8nNotifyResult } = await import('../lib/modules/helpdesk/n8nWebhooks.js')
    await new Promise((r) => setTimeout(r, 300))
    const rEstadoPatch = peekLastN8nNotifyResult()
    console.log('\nPOST n8n estado_cambiado (vía PATCH handler) →', rEstadoPatch)
    if (
      rEstadoPatch?.evento !== 'estado_cambiado' ||
      !rEstadoPatch.ok ||
      rEstadoPatch.status !== 200
    ) {
      throw new Error(
        `estado_cambiado vía PATCH no devolvió 200 (got ${JSON.stringify(rEstadoPatch)})`,
      )
    }
    console.log(
      `Revisá la bandeja de ${email} por correos de n8n (puede tardar 1–2 min).`,
    )

    console.log('\n=== OK: webhooks n8n respondieron 200 ===')
  } finally {
    try {
      await cleanupSession()
      console.log('\nLimpieza ticket(s) de prueba: OK')
    } catch (err) {
      console.error('Limpieza falló:', err)
      process.exitCode = 1
    }
    if (server) await new Promise((r) => server.close(r))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
