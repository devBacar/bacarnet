/**
 * Acceso panel helpdesk: 403 fuera del equipo, 200 miembros + disponibilidad + emailLog.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-team-access.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getTestIdToken, initAdmin, getAdminDb } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HELPDESK_SLOT_COUNT = 5 * 9
const sessionTicketIds = new Set()
let emailLogId = null

const results = []

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

function record(label, ok, detail = '') {
  results.push({ label, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options)
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

async function expect403(url, token, label) {
  const { res, body } = await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  record(
    label,
    res.status === 403 && body.error?.includes('panel de Desarrollo'),
    `status ${res.status}`,
  )
}

async function main() {
  loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
  loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))

  let server
  try {
    const { app } = await import('../lib/server.js')
    const port = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
    server = await new Promise((resolvePromise, reject) => {
      const s = app.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
    })
    const base = `http://127.0.0.1:${port}/api/helpdesk`

    initAdmin()
    const db = getAdminDb()

    const outsiderEmail =
      process.env.HELPDESK_TEST_OUTSIDER_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'
    process.env.TEST_EMAIL = outsiderEmail
    const outsider = await getTestIdToken({ requireSuperAdmin: false })

    await expect403(`${base}/team`, outsider.idToken, 'GET /team → 403 usuario fuera del equipo')
    await expect403(
      `${base}/tickets`,
      outsider.idToken,
      'GET /tickets → 403 usuario fuera del equipo',
    )

    const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(1).get()
    if (teamSnap.empty) throw new Error('helpdeskTeam vacío')
    const teamMemberId = teamSnap.docs[0].id
    await expect403(
      `${base}/disponibilidad/${teamMemberId}`,
      outsider.idToken,
      'GET /disponibilidad/:id → 403 usuario fuera del equipo',
    )

    const { res: miasRes } = await fetchJson(`${base}/tickets/mias`, {
      headers: { Authorization: `Bearer ${outsider.idToken}`, Accept: 'application/json' },
    })
    record('GET /tickets/mias → 200 empleado logueado', miasRes.status === 200, `status ${miasRes.status}`)

    const teamEmail =
      process.env.HELPDESK_TEST_TEAM_EMAIL?.trim() || 'admin@bacarsa.com.ar'
    process.env.TEST_EMAIL = teamEmail
    const insider = await getTestIdToken({ requireSuperAdmin: true })

    const { res: teamRes, body: teamBody } = await fetchJson(`${base}/team`, {
      headers: { Authorization: `Bearer ${insider.idToken}`, Accept: 'application/json' },
    })
    const members = teamBody.members ?? []
    record(
      'GET /team → 200 con miembros activos',
      teamRes.status === 200 && members.length >= 1,
      `${members.length} miembros`,
    )

    const memberId =
      members.find((m) => m.email === teamEmail.toLowerCase())?.id ?? teamMemberId
    const { res: dispRes, body: dispBody } = await fetchJson(
      `${base}/disponibilidad/${memberId}?semanaOffset=0`,
      {
        headers: { Authorization: `Bearer ${insider.idToken}`, Accept: 'application/json' },
      },
    )
    const slots = dispBody.slots ?? []
    const daySet = new Set(slots.map((s) => s.fecha))
    record(
      'GET /disponibilidad/:teamMemberId → slots coherentes',
      dispRes.status === 200 &&
        slots.length === HELPDESK_SLOT_COUNT &&
        daySet.size === 5 &&
        slots.every((s) => typeof s.libre === 'boolean'),
      `${slots.length} slots, ${daySet.size} días`,
    )

    const ticketRef = db.collection('helpdeskTickets').doc()
    sessionTicketIds.add(ticketRef.id)
    await ticketRef.set({
      token: 'team-access-test',
      requesterUid: outsider.uid,
      requesterEmail: outsider.email,
      requesterNombre: 'Test Outsider',
      areaId: 'test',
      areaNombre: 'Team Access Test',
      problematica: 'Prueba emailLog embed',
      urgencia: 'baja',
      estadoIdx: 1,
      asignadoATeamId: memberId,
      createdAt: FieldValue.serverTimestamp(),
    })

    const logRef = db.collection('helpdeskEmailLog').doc()
    emailLogId = logRef.id
    await logRef.set({
      fecha: Timestamp.now(),
      tipo: 'actualizacion_estado',
      destinatarios: [outsider.email],
      area: 'Team Access Test',
      ticketId: ticketRef.id,
      respondido: null,
      fechaRespuesta: null,
    })

    const { res: listRes, body: listBody } = await fetchJson(`${base}/tickets`, {
      headers: { Authorization: `Bearer ${insider.idToken}`, Accept: 'application/json' },
    })
    const found = (listBody.tickets ?? []).find((t) => t.id === ticketRef.id)
    const hasLog =
      found &&
      Array.isArray(found.emailLog) &&
      found.emailLog.some((e) => e.id === emailLogId && e.tipo === 'actualizacion_estado')
    record(
      'GET /tickets incluye emailLog embebido',
      listRes.status === 200 && hasLog,
      hasLog ? 'OK' : 'no encontrado',
    )
  } finally {
    try {
      for (const id of sessionTicketIds) {
        await deleteHelpdeskTicketFull(id)
      }
      if (emailLogId) {
        initAdmin()
        await getAdminDb().collection('helpdeskEmailLog').doc(emailLogId).delete().catch(() => {})
      }
      sessionTicketIds.clear()
      emailLogId = null
      record('Limpieza datos de prueba', true)
    } catch (err) {
      record('Limpieza datos de prueba', false, String(err))
    }
    if (server) await new Promise((r) => server.close(r))
  }

  console.log('\n=== Resumen test helpdesk team access ===')
  for (const row of results) {
    console.log(`${row.ok ? '✅' : '❌'} ${row.label}${row.detail ? ` — ${row.detail}` : ''}`)
  }
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
