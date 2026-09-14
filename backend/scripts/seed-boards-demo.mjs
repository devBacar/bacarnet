/**
 * Sube un tablero de demo (index.html + app.js) bajo BOARDS_CONTAINER_FOLDER_ID.
 *
 *   npm run boards:seed-demo
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { getDrive } from '../lib/lib/google/driveClient.js'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadBackendEnv() {
  const envPath = resolve(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('***REMOVED***')) continue
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

const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Demo tablero</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main>
    <h1>Tablero de demo</h1>
    <p id="status">Cargando…</p>
  </main>
  <script src="./app.js"></script>
</body>
</html>`

const CSS = `body { font-family: system-ui, sans-serif; margin: 2rem; background: #f8fafc; color: #0f172a; }
main { max-width: 40rem; padding: 1.5rem; border: 1px solid #cbd5e1; border-radius: 12px; background: white; }`

const JS = `document.getElementById('status').textContent = 'JS ejecutado: ' + new Date().toLocaleString('es-AR');`

async function uploadChild(drive, parentId, name, mimeType, body) {
  const created = await drive.files.create({
    requestBody: { name, parents: [parentId], mimeType },
    media: { mimeType, body: Readable.from(Buffer.from(body, 'utf8')) },
    fields: 'id, name',
    supportsAllDrives: true,
  })
  return created.data
}

async function main() {
  loadBackendEnv()
  loadTestEnv()
  initAdmin()

  const containerId = process.env.BOARDS_CONTAINER_FOLDER_ID?.trim()
  if (!containerId) {
    throw new Error('Definí BOARDS_CONTAINER_FOLDER_ID en backend/.env')
  }

  const drive = await getDrive()
  const folderName = `Demo tablero ${new Date().toISOString().slice(0, 10)}`
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [containerId],
    },
    fields: 'id, name',
    supportsAllDrives: true,
  })

  const boardId = folder.data.id
  if (!boardId) throw new Error('No se creó la carpeta del tablero')

  await uploadChild(drive, boardId, 'index.html', 'text/html', HTML)
  await uploadChild(drive, boardId, 'styles.css', 'text/css', CSS)
  await uploadChild(drive, boardId, 'app.js', 'application/javascript', JS)

  console.log(`Tablero demo creado: ${folderName}`)
  console.log(`boardFolderId=${boardId}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
