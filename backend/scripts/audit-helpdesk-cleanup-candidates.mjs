/** Lista candidatos de prueba antes de borrarlos. No modifica datos. */
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()
const db = getAdminDb()
const snapshot = await db.collection('helpdeskTickets').get()

for (const doc of snapshot.docs) {
  const ticket = doc.data()
  const area = String(ticket.areaNombre ?? '')
  const requester = String(ticket.requesterNombre ?? '')
  const requesterEmail = String(ticket.requesterEmail ?? '').trim().toLowerCase()
  const createdAt = ticket.createdAt?.toDate?.()
  const createdIso = createdAt?.toISOString() ?? ''
  const candidate =
    area === 'E2E Layout Probe' ||
    area === 'E2E Sticky Header' ||
    area === 'N8N Outbound Test' ||
    requester.toLowerCase().includes('mauro') ||
    requesterEmail === 'admin@bacarsa.com.ar' ||
    (createdIso.startsWith('2026-09-11') && area.toLowerCase().includes('sistemas'))
  if (!candidate) continue

  const reunionesSnapshot = await doc.ref.collection('reuniones').get()
  const notasSnapshot = await doc.ref.collection('notas').get()
  console.log(
    JSON.stringify(
      {
        id: doc.id,
        area,
        requester,
        requesterEmail,
        problematica: ticket.problematica,
        urgencia: ticket.urgencia,
        estadoIdx: ticket.estadoIdx,
        createdAt: createdIso || null,
        reuniones: reunionesSnapshot.docs.map((reunionDoc) => {
          const reunion = reunionDoc.data()
          return {
            id: reunionDoc.id,
            tipo: reunion.tipo,
            fecha: reunion.fecha,
            hora: reunion.hora,
            estado: reunion.estado,
            calendarEventId: reunion.calendarEventId ?? null,
            calendarOrganizerEmail: reunion.calendarOrganizerEmail ?? null,
          }
        }),
        notas: notasSnapshot.size,
      },
      null,
      2,
    ),
  )
}
