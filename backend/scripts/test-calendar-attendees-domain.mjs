/**
 * Invitados de calendario: cualquier dominio. Correo: solo corporativo.
 */
import {
  assertCorporateEmailList,
  assertEmailList,
  listExternalAttendees,
} from '../lib/modules/assistant-actions/validateCorporateEmails.js'

let failed = 0

try {
  const mixed = assertEmailList(
    ['sistemas.ti@bacarsa.com.ar', 'francosarto11@gmail.com'],
    'Invitados',
  )
  if (mixed.length !== 2) throw new Error('assertEmailList mixed')
  const external = listExternalAttendees(mixed)
  if (external.length !== 1 || external[0] !== 'francosarto11@gmail.com') {
    throw new Error('listExternalAttendees')
  }
  console.log('✓ calendar attendees accept external domain')
} catch (err) {
  console.log('✗ calendar attendees:', err instanceof Error ? err.message : err)
  failed += 1
}

try {
  assertCorporateEmailList(['francosarto11@gmail.com'], 'Para', { required: true })
  console.log('✗ email should reject external')
  failed += 1
} catch {
  console.log('✓ email still rejects external domain')
}

console.log(failed === 0 ? '\nOK' : `\n${failed} fallo(s)`)
process.exit(failed === 0 ? 0 : 1)
