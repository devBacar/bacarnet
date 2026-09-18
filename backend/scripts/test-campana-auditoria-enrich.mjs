/**
 *   npm --prefix backend run build
 *   node backend/scripts/test-campana-auditoria-enrich.mjs
 */
import {
  enrichCampanaAuditoriaRow,
  pickCampanaTicketForRow,
} from '../lib/modules/helpdesk/campanaAuditoriaEnrich.js'

function assert(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) process.exitCode = 1
}

const envio = '2026-09-14T14:33:00.000Z'
const ticketAfter = {
  ticketId: 'abc',
  createdAtIso: '2026-09-14T16:41:56.877Z',
  areaNombre: 'RRHH',
}

assert(
  'Ticket posterior al envío se asocia',
  pickCampanaTicketForRow([ticketAfter], envio)?.ticketId === 'abc',
)

const enriched = enrichCampanaAuditoriaRow(
  {
    nombre: 'Marcela',
    area: 'RRHH',
    email: 'jefe.capitalhumano@bacarsa.com.ar',
    enviado: true,
    fecha_envio: envio,
    respondido: false,
    fecha_respuesta: null,
    link: null,
    respuesta_manual_detectada: false,
  },
  [ticketAfter],
)

assert('Formulario true aunque n8n respondido false', enriched.respondio_formulario === true)
assert('Cumple campaña por formulario', enriched.campana_cumplida === true)
assert('Correo false', enriched.respondio_correo === false)

const mailOnly = enrichCampanaAuditoriaRow(
  {
    nombre: 'Eduardo',
    area: 'Logística',
    email: 'eduardo@bacarsa.com.ar',
    enviado: true,
    fecha_envio: envio,
    respondido: false,
    fecha_respuesta: null,
    link: null,
    respuesta_manual_detectada: true,
  },
  [],
)

assert('Cumple campaña solo por mail', mailOnly.campana_cumplida === true)

if (!process.exitCode) console.log('\nPASS')
