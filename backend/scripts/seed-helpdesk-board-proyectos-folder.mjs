/**
 * Crea carpeta placeholder "Desarrollo · Proyectos" bajo BOARDS_CONTAINER_FOLDER_ID.
 *   node backend/scripts/seed-helpdesk-board-proyectos-folder.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDrive } from '../lib/lib/google/driveClient.js'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FOLDER_NAME = 'Desarrollo · Proyectos'

function loadBackendEnv() {
  for (const p of [resolve(ROOT, 'backend/.env.local'), resolve(ROOT, 'backend/.env')]) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

loadBackendEnv()
loadTestEnv()
initAdmin()

const containerId = process.env.BOARDS_CONTAINER_FOLDER_ID?.trim()
if (!containerId) {
  throw new Error('Definí BOARDS_CONTAINER_FOLDER_ID en backend/.env.local')
}

const drive = await getDrive()
const listed = await drive.files.list({
  q: `'${containerId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${FOLDER_NAME.replace(/'/g, "\\'")}' and trashed = false`,
  fields: 'files(id, name)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  pageSize: 5,
})

let folderId = listed.data.files?.[0]?.id
if (!folderId) {
  const created = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [containerId],
    },
    fields: 'id, name',
    supportsAllDrives: true,
  })
  folderId = created.data.id
}

if (!folderId) throw new Error('No se pudo crear/obtener la carpeta')

console.log(`boardFolderId=${folderId}`)
console.log(`Agregá a backend/.env.local y .env.local (Vite):`)
console.log(`HELPDESK_BOARD_PROYECTOS_FOLDER_ID=${folderId}`)
console.log(`VITE_HELPDESK_BOARD_PROYECTOS_FOLDER_ID=${folderId}`)
