/**
 * Crea la carpeta "Combustible" bajo BOARDS_CONTAINER_FOLDER_ID, para que el tablero de Combustible
 * aparezca listado en /tableros.
 *
 * OJO: BOARDS_CONTAINER_FOLDER_ID vale distinto en cada .env (producción vs. entorno de pruebas del
 * emulador). Sin --prod, carga backend/.env.local (pruebas); con --prod, carga backend/.env.bacar-web
 * (producción) con prioridad. No mezclar: si el .env equivocado define la variable primero, la
 * carpeta termina creada en el contenedor de Drive equivocado (pasó una vez, hay que evitarlo).
 *
 *   node backend/scripts/seed-combustible-board-folder.mjs          (pruebas/emulador)
 *   node backend/scripts/seed-combustible-board-folder.mjs --prod   (producción, pedir OK antes)
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDrive } from '../lib/lib/google/driveClient.js'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FOLDER_NAME = 'Combustible'
const esProd = process.argv.includes('--prod')

function loadBackendEnv() {
  const archivos = esProd
    ? [resolve(ROOT, 'backend/.env.bacar-web'), resolve(ROOT, 'backend/.env')]
    : [resolve(ROOT, 'backend/.env.local'), resolve(ROOT, 'backend/.env')]
  for (const p of archivos) {
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

console.log(`Modo: ${esProd ? 'PRODUCCIÓN' : 'pruebas/emulador'} · BOARDS_CONTAINER_FOLDER_ID=${process.env.BOARDS_CONTAINER_FOLDER_ID}`)

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
console.log(`Agregá a backend/.env.bacar-web (y backend/.env.local para probar local):`)
console.log(`COMBUSTIBLE_BOARD_FOLDER_ID=${folderId}`)
