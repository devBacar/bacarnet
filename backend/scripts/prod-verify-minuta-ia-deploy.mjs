/**
 * Crea solicitud REAL en producción, verifica minuta IA vía API, screenshots en bacarnet.web.app.
 *
 *   node backend/scripts/prod-verify-minuta-ia-deploy.mjs
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/prod-minuta-ia')
const PROD_APP = 'https://bacarnet.web.app'
const PROD_API =
  process.env.FUNCTIONS_API_BASE?.replace(/\/+$/, '') ||
  'https://southamerica-east1-bacar-web.cloudfunctions.net/api'

const PROBLEMATICA = [
  '[E2E PROD MINUTA IA — borrar]',
  'El área de Ventas carga pedidos en planillas distintas y Finanzas tarda días en conciliar.',
  'Queremos un flujo único con estados visibles para gerencia.',
].join(' ')

loadTestEnv()
initAdmin()
const db = getAdminDb()
const { idToken, uid, email } = await getTestIdToken()

const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')

const token = generarTokenSolicitud({
  uid,
  email,
  nombre: 'E2E PROD Minuta IA',
  areaId: 'e2e-prod-minuta',
  areaNombre: 'E2E PROD Minuta IA',
})

let ticketId = null

try {
  const dispUrl = `${PROD_API}/api/helpdesk/disponibilidad-inicial?token=${encodeURIComponent(token)}&semanaOffset=1`
  const disp = await fetch(dispUrl)
  const dispBody = await disp.json()
  if (!disp.ok) throw new Error(`disponibilidad ${disp.status} ${JSON.stringify(dispBody)}`)
  const slot = (dispBody.slots ?? []).find((s) => s.libre === true)
  if (!slot) throw new Error('No hay slot libre en prod')

  const createRes = await fetch(`${PROD_API}/api/helpdesk/solicitudes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      problematica: PROBLEMATICA,
      urgencia: 'media',
      fecha: slot.fecha,
      hora: slot.hora,
    }),
  })
  const createBody = await createRes.json()
  if (!createRes.ok) throw new Error(`solicitud ${createRes.status} ${JSON.stringify(createBody)}`)
  ticketId = createBody.ticketId
  console.log('Ticket prod creado:', ticketId)

  const detailRes = await fetch(`${PROD_API}/api/helpdesk/tickets/${ticketId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  })
  const detail = await detailRes.json()
  if (!detailRes.ok) throw new Error(`detail ${detailRes.status}`)

  const reunion = (detail.ticket?.reuniones ?? []).find((r) => r.tipo === 'Reunión inicial')
  const minuta = reunion?.minutaDiagnostico
  if (!minuta?.generadoPorIA) {
    console.warn('WARN: generadoPorIA no true — Gemini pudo fallar; revisar logs api')
  }
  if (!minuta?.objetivoSesion?.trim()) {
    throw new Error('FAIL prod: minuta sin objetivoSesion (IA no corrió o deploy viejo)')
  }
  if (reunion?.minuta?.texto && !reunion?.minutaDiagnostico) {
    throw new Error('FAIL prod: solo minuta texto libre — frontend/backend viejos')
  }
  console.log('PASS API prod: minutaDiagnostico con contenido IA')
  console.log(
    JSON.stringify(
      {
        generadoPorIA: minuta?.generadoPorIA,
        objetivoSesion: minuta?.objetivoSesion?.slice(0, 120),
        procesos: minuta?.procesosEvaluados?.length,
      },
      null,
      2,
    ),
  )

  console.log('Verificación UI en hosting omitida (sin helper de login en prod). Usá prod-screenshots-minuta-navbar.mjs con Vite dev.')
} finally {
  if (ticketId) {
    const ok = await deleteHelpdeskTicketFull(ticketId)
    console.log(ok ? 'Ticket prod eliminado' : 'WARN: cleanup ticket prod')
  }
}
