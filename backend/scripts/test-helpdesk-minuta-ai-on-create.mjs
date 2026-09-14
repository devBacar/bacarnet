/**
 * Pre-minuta IA al crear ticket: Gemini real, mock de fallo, PATCH generadoPorIA → false.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-minuta-ai-on-create.mjs
 */
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()
const db = getAdminDb()
const { idToken, email, uid } = await getTestIdToken()
const API_PORT = 8794
const API = `http://127.0.0.1:${API_PORT}`

const PROBLEMATICA = [
  'En Compras registramos pedidos en Excel y el área de Depósito no ve los cambios hasta el día siguiente.',
  'Se pierden tiempos en reclamos porque no hay trazabilidad del estado del pedido.',
  'Necesitamos un flujo único con avisos cuando hay demoras de proveedor.',
].join(' ')

let teamBootstrapId = null
const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).get()
const emails = new Set(teamSnap.docs.map((d) => String(d.get('email') || '').toLowerCase()))
if (!emails.has(email.toLowerCase())) {
  const ref = await db.collection('helpdeskTeam').add({
    uid,
    nombre: 'E2E minuta IA',
    email: email.toLowerCase(),
    rol: 'Analista',
    activo: true,
    primeraReunion: false,
    responsablePrincipal: false,
    createdAt: Timestamp.now(),
  })
  teamBootstrapId = ref.id
}

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const instance = app.listen(API_PORT, '127.0.0.1', (error) =>
    error ? reject(error) : resolvePromise(instance),
  )
})

const ticketRef = db.collection('helpdeskTickets').doc()
const reunionRef = ticketRef.collection('reuniones').doc()
const ticketId = ticketRef.id
const reunionId = reunionRef.id

async function cleanup() {
  const analisis = await ticketRef.collection('analisis').get()
  await Promise.all(analisis.docs.map((d) => d.ref.delete()))
  const reuniones = await ticketRef.collection('reuniones').get()
  await Promise.all(reuniones.docs.map((d) => d.ref.delete()))
  await ticketRef.delete().catch(() => {})
  if (teamBootstrapId) await db.collection('helpdeskTeam').doc(teamBootstrapId).delete().catch(() => {})
}

try {
  await ticketRef.set({
    token: 'test-minuta-ai',
    requesterUid: uid,
    requesterEmail: email,
    requesterNombre: 'Test Minuta IA',
    areaId: 'e2e-minuta-ai',
    areaNombre: 'Logística y Compras',
    problematica: PROBLEMATICA,
    urgencia: 'alta',
    estadoIdx: 1,
    asignadoATeamId: teamSnap.docs[0]?.id ?? null,
    createdAt: Timestamp.now(),
  })
  await reunionRef.set({
    tipo: 'Reunión inicial',
    fecha: '20/09/2026',
    hora: '11:00',
    conTeamId: teamSnap.docs[0]?.id ?? 'x',
    participantesTeamIds: [],
    estado: 'pendiente',
    createdAt: Timestamp.now(),
  })

  const { attachMinutaDiagnosticoDraftOnTicketCreate } = await import(
    '../lib/modules/helpdesk/generateMinutaDiagnosticoDraft.js'
  )

  process.env.HELPDESK_MINUTA_AI_MOCK_FAIL = '1'
  const failOk = await attachMinutaDiagnosticoDraftOnTicketCreate({
    ticketId,
    reunionId,
    problematica: PROBLEMATICA,
    areaNombre: 'Logística y Compras',
    urgencia: 'alta',
  })
  delete process.env.HELPDESK_MINUTA_AI_MOCK_FAIL
  const afterFail = (await reunionRef.get()).data()
  if (failOk || afterFail?.minutaDiagnostico) {
    throw new Error('FAIL: mock Gemini debía dejar minuta vacía')
  }
  console.log('PASS: ticket sin minuta cuando Gemini falla (mock)')

  const saved = await attachMinutaDiagnosticoDraftOnTicketCreate({
    ticketId,
    reunionId,
    problematica: PROBLEMATICA,
    areaNombre: 'Logística y Compras',
    urgencia: 'alta',
  })
  if (!saved) throw new Error('FAIL: no se guardó minuta con Gemini real')

  const reunionSnap = await reunionRef.get()
  const minuta = reunionSnap.data()?.minutaDiagnostico
  if (!minuta?.generadoPorIA) throw new Error('FAIL: generadoPorIA !== true')
  if (!minuta.objetivoSesion?.trim() || !minuta.alcance?.trim()) {
    throw new Error('FAIL: objetivoSesion o alcance vacíos')
  }
  if (!Array.isArray(minuta.procesosEvaluados) || minuta.procesosEvaluados.length < 1) {
    throw new Error('FAIL: procesosEvaluados vacío')
  }
  const p0 = minuta.procesosEvaluados[0]
  if (!p0.procesoEvaluado?.trim() || !p0.descripcionBreve?.trim()) {
    throw new Error('FAIL: proceso evaluado incompleto')
  }
  if (minuta.iniciativasPropuestas?.length) {
    throw new Error('FAIL: iniciativasPropuestas debía estar vacío')
  }

  console.log('PASS: minuta IA coherente')
  console.log(
    JSON.stringify(
      {
        generadoPorIA: minuta.generadoPorIA,
        objetivoSesion: minuta.objetivoSesion,
        alcance: minuta.alcance,
        procesosEvaluados: minuta.procesosEvaluados,
      },
      null,
      2,
    ),
  )

  const patchPayload = {
    minutaDiagnostico: {
      fecha: '20/09/2026',
      facilitador: 'Facilitador test',
      participantes: 'Jefe área, Sistemas',
      objetivoSesion: minuta.objetivoSesion,
      alcance: minuta.alcance,
      procesosEvaluados: minuta.procesosEvaluados.map((p) => ({
        ...p,
        problemasIdentificados: 'Demoras y falta de visibilidad',
        metricasActuales: 'Sin KPI formal',
      })),
      iniciativasPropuestas: [
        {
          nombre: 'Tablero de pedidos',
          beneficioEsperado: 'Visibilidad',
          recursosRequeridos: 'Sistemas + Compras',
          impactoEstimado: 'Alto',
          factibilidad: 'Media',
          costoEsfuerzo: 'Medio',
          urgencia: 'Crítico',
          veredicto: 'Viable',
        },
      ],
      proyectosAprobados: '',
      responsables: '',
      accionesInmediatas: '',
    },
  }

  const patchRes = await fetch(`${API}/api/helpdesk/tickets/${ticketId}/reuniones/${reunionId}/minuta`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patchPayload),
  })
  if (!patchRes.ok) {
    const errBody = await patchRes.text()
    throw new Error(`FAIL PATCH minuta: ${patchRes.status} ${errBody}`)
  }

  const afterEdit = (await reunionRef.get()).data()?.minutaDiagnostico
  if (afterEdit?.generadoPorIA !== false) {
    throw new Error(`FAIL: generadoPorIA debía ser false, got ${afterEdit?.generadoPorIA}`)
  }
  console.log('PASS: generadoPorIA → false tras guardar edición')
} finally {
  await cleanup()
  server.close()
  process.exit(0)
}
