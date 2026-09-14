/**
 * Tests aislados de las automatizaciones programadas.
 * Todos los datos son in-memory; no consulta ni modifica Firestore, Calendar o n8n reales.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-scheduled-automations.mjs
 */

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const { runScheduledReunionSync } = await import(
  '../lib/modules/helpdesk/scheduledReunionSync.js'
)
const { runScheduledReminder } = await import(
  '../lib/modules/helpdesk/scheduledReminder.js'
)

const updated = []
const syncSummary = await runScheduledReunionSync({
  listTickets: async () => [
    {
      id: 'ticket-activo',
      requesterEmail: 'jefe@bacarsa.com.ar',
      estadoIdx: 2,
    },
    {
      id: 'ticket-finalizado',
      requesterEmail: 'finalizado@bacarsa.com.ar',
      estadoIdx: 5,
    },
  ],
  listReuniones: async (ticketId) =>
    ticketId === 'ticket-activo'
      ? [
          {
            id: 'reunion-cambia',
            estado: 'pendiente',
            calendarEventId: 'event-test',
            calendarOrganizerEmail: 'admin@bacarsa.com.ar',
          },
          {
            id: 'reunion-sin-calendar',
            estado: 'pendiente',
            calendarEventId: null,
            calendarOrganizerEmail: null,
          },
        ]
      : [],
  sync: async (input) => {
    updated.push(`${input.ticketId}/${input.reunionId}`)
    return {
      estado: 'confirmada',
      previousEstado: 'pendiente',
      changed: true,
      requesterResponseStatus: 'accepted',
    }
  },
})

record(
  '4a sincronización programada',
  syncSummary.ticketsActivos === 1 &&
    syncSummary.revisadas === 1 &&
    syncSummary.cambiadas === 1 &&
    syncSummary.omitidasSinCalendar === 1 &&
    syncSummary.errores === 0 &&
    updated.length === 1,
  JSON.stringify(syncSummary),
)

const now = new Date('2026-09-14T12:00:00.000Z')
const posted = []
const reminderSummary = await runScheduledReminder({
  now,
  config: {
    managementCredential: 'test-only',
    apiBase: 'https://example.invalid',
    tableId: 'test-table',
    webhookUrl: 'https://example.invalid/webhook',
  },
  listRows: async () => [
    {
      id: 1,
      email: 'elegible@bacarsa.com.ar',
      nombre: 'Jefe Elegible',
      area: 'Sistemas',
      link: 'https://bacarnet.web.app/support?t=existing-token',
      enviado: true,
      respondido: false,
      fecha_envio: '2026-09-10T11:59:59.000Z',
    },
    {
      id: 2,
      email: 'reciente@bacarsa.com.ar',
      enviado: true,
      respondido: false,
      fecha_envio: '2026-09-12T12:00:00.000Z',
    },
    {
      id: 3,
      email: 'respondido@bacarsa.com.ar',
      enviado: true,
      respondido: true,
      fecha_envio: '2026-09-01T12:00:00.000Z',
    },
  ],
  postWebhook: async (row) => {
    posted.push(row.id)
    const { reminderWebhookBody } = await import('../lib/modules/helpdesk/scheduledReminder.js')
    const body = reminderWebhookBody(row)
    if (
      !body ||
      body.link !== 'https://bacarnet.web.app/support?t=existing-token' ||
      Object.keys(body).join(',') !== 'email,nombre,area,link'
    ) {
      throw new Error(`body inválido: ${JSON.stringify(body)}`)
    }
  },
})

record(
  '4b recordatorio programado',
  reminderSummary.consultadas === 3 &&
    reminderSummary.elegibles === 1 &&
    reminderSummary.enviadas === 1 &&
    reminderSummary.errores === 0 &&
    posted.length === 1 &&
    posted[0] === 1,
  JSON.stringify(reminderSummary),
)

const noWebhookSummary = await runScheduledReminder({
  now,
  config: {
    managementCredential: 'test-only',
    apiBase: 'https://example.invalid',
    tableId: 'test-table',
    webhookUrl: '',
  },
  listRows: async () => [
    {
      id: 4,
      enviado: true,
      respondido: false,
      fecha_envio: '2026-09-01T12:00:00.000Z',
    },
  ],
})
record(
  '4b webhook vacío es resiliente',
  noWebhookSummary.elegibles === 1 &&
    noWebhookSummary.omitidasSinWebhook === 1 &&
    noWebhookSummary.errores === 0,
  JSON.stringify(noWebhookSummary),
)

console.log(`\n${results.every((r) => r.ok) ? 'PASS' : 'FAIL'}: ${results.filter((r) => r.ok).length}/${results.length}`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
