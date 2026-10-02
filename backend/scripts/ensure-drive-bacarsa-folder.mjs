/**
 * Crea carpeta "bacarsa" bajo DRIVE_ID si no existe (estructura opcional / pruebas).
 * La UI usa "bacarsa" solo como etiqueta de la raíz; no es obligatoria para listar.
 *
 *   node backend/scripts/ensure-drive-bacarsa-folder.mjs
 */

import { getDrive } from '../lib/lib/google/driveClient.js'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const FOLDER_NAME = 'bacarsa'

loadTestEnv()
initAdmin()

const driveId = process.env.DRIVE_ID?.trim()
if (!driveId) {
  throw new Error('Definí DRIVE_ID en backend/.env.local')
}

const drive = await getDrive()
const listed = await drive.files.list({
  q: `'${driveId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${FOLDER_NAME}' and trashed = false`,
  fields: 'files(id, name, webViewLink)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  pageSize: 5,
})

const existing = listed.data.files?.[0]
if (existing?.id) {
  console.log(`Carpeta ya existía: ${FOLDER_NAME} → ${existing.id}`)
  if (existing.webViewLink) console.log(existing.webViewLink)
} else {
  const created = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [driveId],
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  })
  const folderId = created.data.id
  console.log(`Carpeta creada: ${FOLDER_NAME} → ${folderId}`)
  if (created.data.webViewLink) console.log(created.data.webViewLink)
}
