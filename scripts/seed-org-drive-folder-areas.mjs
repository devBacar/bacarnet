/**
 * Renombra carpetas Drive, crea las 4 nuevas de organigrama y mapea driveFolderAreas.
 * Empareja por nombre con los stubs Firestore del --apply de restructure-org-areas.
 *
 *   node scripts/seed-org-drive-folder-areas.mjs           ***REMOVED*** dry-run
 *   node scripts/seed-org-drive-folder-areas.mjs --apply   ***REMOVED*** Drive + Firestore
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = !process.argv.includes('--apply')
const COLLECTION = 'driveFolderAreas'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

const RENAMES = [
  {
    driveId: '1-wPj5kXNCUlP00iZtKO7IbakA1P3uIOo',
    fromNames: ['UIF'],
    toName: 'Área de Cumplimiento',
    governingAreaId: 'OWWnpfsRRx0XQ6FCqlOa',
  },
  {
    driveId: '1DimigcRCk_qMVO5zbWGN5V0cz6dWSBrU',
    fromNames: ['Gerencia'],
    toName: 'Comisión Ejecutiva',
    governingAreaId: 'MM25DIlzctON9kegb4MF',
  },
]

const NEW_AREAS = [
  { name: 'Directorio', governingAreaId: '2Jueblk2pqvj3ZzRZjY0' },
  { name: 'Finanzas', governingAreaId: '9n6jjLVorZyUiHQXOfoa' },
  { name: 'Otros Proyectos', governingAreaId: 'PKivDaMM1LVw2IbGNGMW' },
  {
    name: 'Servicio Tercerizado de Tesorería',
    governingAreaId: 'E9FkGvAQ8yYUC1vXg6BG',
  },
]

function loadEnv() {
  for (const rel of ['backend/.env', 'backend/.env.local', '.env.local']) {
    const envPath = resolve(ROOT, rel)
    if (!existsSync(envPath)) continue
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
}

function initAdmin() {
  if (getApps().length > 0) return
  loadEnv()
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credPath) {
    const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    })
    return
  }
  initializeApp({ credential: applicationDefault() })
}

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

async function listTopLevelFolders(drive, driveId, shared) {
  const folders = []
  let pageToken
  do {
    const result = await drive.files.list({
      q: `'${driveId}' in parents and trashed = false and mimeType = '${FOLDER_MIME}'`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 100,
      pageToken,
      orderBy: 'name',
      ...shared,
    })
    for (const file of result.data.files ?? []) {
      if (file.id && file.name) folders.push({ id: file.id, name: file.name })
    }
    pageToken = result.data.nextPageToken ?? undefined
  } while (pageToken)
  return folders
}

async function upsertDriveFolderAreas(db, mappings) {
  for (const row of mappings) {
    console.log(`  MAP  "${row.name}"  Drive [${row.driveId}]  →  ${row.governingAreaId}`)
    if (dryRun) continue
    await db.collection(COLLECTION).doc(row.driveId).set({
      governingAreaId: row.governingAreaId,
      name: row.name,
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
}

async function main() {
  initAdmin()
  loadEnv()
  const db = getFirestore()

  const { getDrive } = await import(
    pathToFileURL(resolve(ROOT, 'backend/lib/lib/google/driveClient.js')).href
  )
  const { getSharedDriveQuery, getSharedDriveRootId } = await import(
    pathToFileURL(resolve(ROOT, 'backend/lib/lib/google/sharedDrive.js')).href
  )

  const driveId = getSharedDriveRootId()
  const drive = await getDrive()
  const shared = getSharedDriveQuery()

  const driveMeta = await drive.drives.get({ driveId })
  console.log(
    dryRun
      ? '=== DRY-RUN: Drive + driveFolderAreas (sin escrituras) ==='
      : '=== APPLY: Drive + driveFolderAreas ===',
  )
  console.log(`Unidad compartida: "${driveMeta.data.name}" [${driveId}]\n`)

  let folders = await listTopLevelFolders(drive, driveId, shared)
  const mappings = []

  console.log('=== 1. Renombrar carpetas existentes ===')
  for (const row of RENAMES) {
    const found = folders.find((f) => f.id === row.driveId)
    if (!found) {
      console.log(`ERROR  no se encontró Drive [${row.driveId}] para renombrar a "${row.toName}"`)
      continue
    }
    if (normalizeName(found.name) === normalizeName(row.toName)) {
      console.log(`SKIP   "${found.name}" [${found.id}]  (ya renombrada)`)
    } else if (!row.fromNames.some((n) => normalizeName(n) === normalizeName(found.name))) {
      console.log(
        `WARN   "${found.name}" [${found.id}]  → "${row.toName}"  (nombre actual no es ${row.fromNames.join('/')})`,
      )
    } else {
      console.log(`RENAME "${found.name}" [${found.id}]  →  "${row.toName}"`)
      if (!dryRun) {
        await drive.files.update({
          fileId: found.id,
          supportsAllDrives: true,
          requestBody: { name: row.toName },
        })
        found.name = row.toName
      }
    }
    mappings.push({
      driveId: row.driveId,
      name: row.toName,
      governingAreaId: row.governingAreaId,
    })
  }

  if (!dryRun) {
    folders = await listTopLevelFolders(drive, driveId, shared)
  }

  const byNorm = new Map()
  for (const folder of folders) {
    const key = normalizeName(folder.name)
    const list = byNorm.get(key) ?? []
    list.push(folder)
    byNorm.set(key, list)
  }

  console.log('')
  console.log('=== 2. Crear carpetas nuevas (si faltan) ===')
  for (const area of NEW_AREAS) {
    const matches = byNorm.get(normalizeName(area.name)) ?? []
    let driveFolderId = matches.length === 1 ? matches[0].id : null

    if (matches.length > 1) {
      console.log(`ERROR  "${area.name}"  ambigua en Drive: ${matches.map((m) => m.id).join(', ')}`)
      continue
    }

    if (driveFolderId) {
      console.log(`REUTILIZA "${area.name}" [${driveFolderId}]`)
    } else {
      console.log(`CREA     "${area.name}"  en raíz de BACARSA`)
      if (!dryRun) {
        const created = await drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: area.name,
            mimeType: FOLDER_MIME,
            parents: [driveId],
          },
          fields: 'id, name',
        })
        driveFolderId = created.data.id ?? null
        if (!driveFolderId) throw new Error(`Drive no devolvió id para "${area.name}"`)
        console.log(`         id=${driveFolderId}`)
        folders.push({ id: driveFolderId, name: area.name })
        byNorm.set(normalizeName(area.name), [{ id: driveFolderId, name: area.name }])
      } else {
        driveFolderId = `(nuevo-al-aplicar:${area.name})`
      }
    }

    if (typeof driveFolderId === 'string' && !driveFolderId.startsWith('(')) {
      mappings.push({
        driveId: driveFolderId,
        name: area.name,
        governingAreaId: area.governingAreaId,
      })
    }
  }

  console.log('')
  console.log('=== 3. driveFolderAreas ===')
  await upsertDriveFolderAreas(db, mappings)

  console.log('')
  console.log(
    dryRun
      ? `Dry-run listo (${mappings.length} mapeos). Para aplicar: node scripts/seed-org-drive-folder-areas.mjs --apply`
      : `Listo. ${mappings.length} documentos en ${COLLECTION}.`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
