/**
 * Prueba de envío de correo con Markdown → HTML (executeEmailSend).
 *
 *   node backend/scripts/probe-email-html-send.mjs
 *   node backend/scripts/probe-email-html-send.mjs sistemas.ti@bacarsa.com.ar
 */

import { loadTestEnv } from './get-test-token.mjs'
import { executeEmailSend } from '../lib/modules/assistant-actions/executeEmailSend.js'
import { markdownToEmailHtml } from '../lib/modules/assistant-actions/markdownToEmailHtml.js'

loadTestEnv()

const FROM = (
  process.env.DWD_PROBE_SUBJECT ?? 'implementaciones.it@bacarsa.com.ar'
).trim().toLowerCase()
const TO = (process.argv[2] ?? 'sistemas.ti@bacarsa.com.ar').trim().toLowerCase()

const subject = 'PRUEBA — Correo HTML con formato'
const body = [
  'Hola,',
  '',
  'Este es un **correo de prueba** con formato Markdown convertido a HTML.',
  '',
  'Lista de verificación:',
  '- Negrita visible',
  '- _Cursiva visible_',
  '- Viñetas reales',
  '',
  'Saludos.',
].join('\n')

console.log('=== Probe email HTML send ===')
console.log('From:', FROM)
console.log('To:', TO)
console.log('Subject:', subject)

const sent = await executeEmailSend({
  impersonateAs: FROM,
  payload: {
    to: [TO],
    cc: [],
    subject,
    body,
  },
})

console.log('\nEMAIL_SEND_OK')
console.log('messageId:', sent.messageId)
console.log('threadId:', sent.threadId)

const html = markdownToEmailHtml(body)
const hasStrong = html.includes('<strong>') || html.includes('<b>')
const hasList = html.includes('<ul>') || html.includes('<li>')
const hasRawMarkdown = html.includes('**') || html.includes('_Cursiva')

console.log('\nVerificación HTML generado:')
console.log('  HTML con negrita:', hasStrong ? 'OK' : 'FAIL')
console.log('  HTML con lista:', hasList ? 'OK' : 'FAIL')
console.log('  Sin markdown crudo:', !hasRawMarkdown ? 'OK' : 'FAIL')

if (!hasStrong || !hasList || hasRawMarkdown) {
  process.exit(1)
}
