/**
 * Compara permissions.list de un archivo vs la Unidad compartida.
 *   node backend/scripts/probe-rag-permissions-inherited.mjs [fileId]
 */

import { getDrive } from '../lib/lib/google/driveClient.js'
import { loadTestEnv } from './get-test-token.mjs'
import { isInheritedPermission } from '../lib/modules/drive/driveUserPermission.js'
import { collectDriveFileAcl } from '../lib/modules/rag/collectReaders.js'

loadTestEnv()

const fileId =
  process.argv[2]?.trim() || '11wsnXEQbrTYsK3pLDs_oazKSsp1koShC' // ASR Driver Guide
const driveId = process.env.DRIVE_ID?.trim()
if (!driveId) throw new Error('Falta DRIVE_ID')

const drive = await getDrive()
const meta = await drive.files.get({
  fileId,
  supportsAllDrives: true,
  fields: 'id, name, driveId, parents',
})
console.log('Archivo:', meta.data.name, meta.data.id)
console.log('driveId:', meta.data.driveId)

function summarizeListed(label, listed) {
  const users = []
  for (const p of listed.data.permissions ?? []) {
    if (p.type !== 'user' || !p.emailAddress) continue
    users.push({
      email: p.emailAddress.trim().toLowerCase(),
      role: p.role,
      inherited: isInheritedPermission(p.permissionDetails),
    })
  }
  users.sort((a, b) => a.email.localeCompare(b.email, 'es'))
  console.log(`\n=== ${label} (${users.length} usuarios) ===`)
  for (const u of users) {
    console.log(`  ${u.inherited ? 'inherited' : 'direct   '} · ${u.role?.padEnd(14)} · ${u.email}`)
  }
  const targets = ['sistemas.ti@bacarsa.com.ar', 'implementaciones.it@bacarsa.com.ar']
  for (const email of targets) {
    const hit = users.find((u) => u.email === email)
    console.log(`  → ${email}: ${hit ? `SÍ (${hit.inherited ? 'heredado' : 'directo'})` : 'NO'}`)
  }
}

const fileListed = await drive.permissions.list({
  fileId,
  supportsAllDrives: true,
  fields: 'permissions(id, type, role, emailAddress, permissionDetails)',
  pageSize: 100,
})
summarizeListed(`permissions.list archivo ${fileId}`, fileListed)

const driveListed = await drive.permissions.list({
  fileId: driveId,
  supportsAllDrives: true,
  fields: 'permissions(id, type, role, emailAddress, permissionDetails)',
  pageSize: 100,
})
summarizeListed(`permissions.list unidad ${driveId}`, driveListed)

const acl = await collectDriveFileAcl(drive, fileId)
console.log('\n=== collectDriveFileAcl (indexador actual) ===')
console.log('allowedReaders:', acl.allowedReaders.join(', ') || '(vacío)')
console.log('domainAccess:', acl.domainAccess)
