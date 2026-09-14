/**
 * Verifica PATCH minutaDiagnostico (sin Playwright).
 * node backend/scripts/test-minuta-diagnostico-api.mjs
 */
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()
const db = getAdminDb()
const { idToken, email, uid } = await getTestIdToken()
const API_PORT = 8795
const API = `http://127.0.0.1:${API_PORT}`

let bootstrap = null
const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).get()
const emails = new Set(teamSnap.docs.map((d) => String(d.get('email') || '').toLowerCase()))
if (!emails.has(email.toLowerCase())) {
  bootstrap = await db.collection('helpdeskTeam').add({
    uid,
    nombre: 'E2E API minuta',
    email: email.toLowerCase(),
    rol: 'Analista',
    activo: true,
    primeraReunion: false,
    responsablePrincipal: false,
    createdAt: Timestamp.now(),
  })
}

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const instance = app.listen(API_PORT, '127.0.0.1', (error) =>
    error ? reject(error) : resolvePromise(instance),
  )
})

const ticketRef = db.collection('helpdeskTickets').doc()
const reunionRef = ticketRef.collection('reuniones').doc()
await ticketRef.set({
  token: 'api-test-minuta-diag',
  requesterUid: uid,
  requesterEmail: email,
  requesterNombre: 'Test API',
  areaId: 'a',
  areaNombre: 'Area API',
  problematica: 'p',
  urgencia: 'baja',
  estadoIdx: 1,
  asignadoATeamId: null,
  createdAt: Timestamp.now(),
})
await reunionRef.set({
  tipo: 'Reunión inicial',
  fecha: '18/09/2026',
  hora: '10:00',
  conTeamId: 'x',
  participantesTeamIds: [],
  estado: 'confirmada',
  createdAt: Timestamp.now(),
})

const payload = {
  minutaDiagnostico: {
    fecha: '18/09/2026',
    facilitador: 'Facilitador API',
    participantes: 'A, B',
    objetivoSesion: 'Objetivo',
    alcance: 'Alcance',
    procesosEvaluados: [
      {
        procesoEvaluado: 'Proceso 1',
        descripcionBreve: 'd1',
        problemasIdentificados: 'p1',
        metricasActuales: 'm1',
      },
      {
        procesoEvaluado: 'Proceso 2',
        descripcionBreve: 'd2',
        problemasIdentificados: 'p2',
        metricasActuales: 'm2',
      },
    ],
    iniciativasPropuestas: [
      {
        nombre: 'Iniciativa 1',
        beneficioEsperado: 'b1',
        recursosRequeridos: 'r1',
        impactoEstimado: 'Medio',
        factibilidad: 'Media',
        costoEsfuerzo: 'Medio',
        urgencia: 'Deseable',
        veredicto: 'Viable',
      },
      {
        nombre: 'Iniciativa 2',
        beneficioEsperado: 'b2',
        recursosRequeridos: 'r2',
        impactoEstimado: 'Alto',
        factibilidad: 'Alta',
        costoEsfuerzo: 'Bajo',
        urgencia: 'Crítico',
        veredicto: 'No viable',
      },
    ],
    proyectosAprobados: 'Proy',
    responsables: 'Resp',
    accionesInmediatas: 'Acc',
  },
}

try {
  const patchRes = await fetch(
    `${API}/api/helpdesk/tickets/${ticketRef.id}/reuniones/${reunionRef.id}/minuta`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )
  const patchBody = await patchRes.text()
  if (!patchRes.ok) {
    console.error('PATCH falló', patchRes.status, patchBody)
    process.exit(1)
  }

  const detailRes = await fetch(`${API}/api/helpdesk/tickets/${ticketRef.id}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  })
  const detailJson = await detailRes.json()
  const reunion = detailJson.ticket?.reuniones?.find((r) => r.id === reunionRef.id)
  const ok =
    reunion?.minutaDiagnostico?.procesosEvaluados?.length === 2 &&
    reunion?.minutaDiagnostico?.iniciativasPropuestas?.length === 2
  console.log(ok ? 'PASS: minutaDiagnostico persistida' : 'FAIL: estructura incompleta', reunion?.minutaDiagnostico)
  process.exit(ok ? 0 : 1)
} finally {
  await db.recursiveDelete(ticketRef)
  if (bootstrap) await bootstrap.delete().catch(() => {})
  await new Promise((r) => server.close(r))
}
