/**
 * Limpia archivos/carpetas de prueba en las carpetas madre de cada área (driveFolderAreas).
 *
 *   node backend/scripts/cleanup-area-test-files.mjs              ***REMOVED*** dry-run
 *   node backend/scripts/cleanup-area-test-files.mjs --apply       ***REMOVED*** enviar a papelera
 *   node backend/scripts/cleanup-area-test-files.mjs --list-all    ***REMOVED*** incluye ítems que NO se tocan
 */

import { getDrive } from '../lib/lib/google/driveClient.js'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const APPLY = process.argv.includes('--apply')
const LIST_ALL = process.argv.includes('--list-all')
const API = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const TRASH_REASON = 'Limpieza de archivos de prueba antes de carga real de datos'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** Mismo mapa que scripts/seed-drive-folder-areas.mjs */
const AREA_FOLDERS = [
  { name: 'Administracion', driveId: '1Oz7iuBvjoOMsEArHAhADeNK7CMGNemhY' },
  { name: 'Comercial', driveId: '1-TSL3f20lI5HlqmgN_LVGVYYwznhlUyd' },
  { name: 'Compras', driveId: '1dzq22AX5t9SM72plMcXvhgrYKOzAoq1z' },
  { name: 'Gerencia', driveId: '1DimigcRCk_qMVO5zbWGN5V0cz6dWSBrU' },
  { name: 'Tableros Gerencia', driveId: '1RpkClQ5CduQeGdwgFR0PxW9lPz2mbZ40', skipUnlessDemo: true },
  { name: 'Guardia', driveId: '1RPrzCvf1JEHEtVSK5F7ZcZbDByrFI60Y' },
  { name: 'Mantenimiento', driveId: '1-66uogZax3S8ZgtDVasqZkn9_PwFo6UI' },
  { name: 'Marketing', driveId: '16rAF6Fl95YUa8YDhCIk-zQjvu_kz_U4j' },
  { name: 'Monitoreo', driveId: '19vzvby3dd8QOZ8dZfLfmGqzSCubDzDSy' },
  { name: 'Operaciones', driveId: '1NeotsCiPgZaaL1NNTbjHGilltY-IIwq7' },
  { name: 'RRHH', driveId: '1mI2NTTlhnwT4cm34QkaApGgNSsJOhWjp' },
  { name: 'Seguridad Privada', driveId: '1-wRlmFjn-geLasdZDZS5gR-wW39N8d9M' },
  { name: 'Sistemas', driveId: '188-zgNhMIfeUjAI8GracINlItBbFwoUb' },
  { name: 'Tesoreria', driveId: '1vQN2S2Au3rab0eTFXVVnqXn7KJaO8sod' },
  { name: 'UIF', driveId: '1-wPj5kXNCUlP00iZtKO7IbakA1P3uIOo' },
]

const TEST_NAME_PREFIXES = [
  'Visual approve ',
  'Visual reject ',
  'Access req f2 ',
  'Access reject f2 ',
  'E2E politica de datos ',
  'UI D-F borrador ',
  'preview-test-',
  'Prueba ',
  'Prueba-',
  'Archivo para prueba',
  'Archivo prueba',
  'Reject prueba',
  'Doc prueba',
  'Privada prueba',
  'Demo tablero ',
  'Salvaguarda super_admin',
  'Checklist ',
  'Notif f1 ',
  'Dbg acc ',
]

const TEST_NAME_PATTERNS = [
  /^Visual (approve|reject) \d+$/,
  /^Access (req|reject) f2 \d+$/,
  /^E2E politica de datos \d+$/,
  /^UI D-F borrador \d+$/,
  /^preview-test-.+\.(docx|xlsx)$/i,
  /^Prueba-installer-\d+\.exe$/i,
  /^Prueba .+ — copia para Tercero/i,
  /^Prueba estado borrador \d+$/,
  /^Prueba trash doc \d+$/,
  /^Prueba propietario \d+$/,
  /^Prueba aprobaci[oó]n [áa]rea \d+/i,
  /^Prueba filtro permisos \d+$/,
  /^Prueba gobernanza [áa]rea \d+/i,
  /^Prueba fan-out [áa]rea \d+$/i,
  /^Prueba fan-out otra [áa]rea \d+$/i,
  /^Prueba otra [áa]rea \d+$/i,
  /^Prueba clasificacion (default|restringido) \d+$/i,
  /^Prueba permisos (USO_INTERNO|RESTRINGIDO|CONFIDENCIAL) \d+$/i,
  /^Prueba acceso puntual \d+$/,
  /^Prueba deny copy \d+$/,
  /^Archivo para prueba/i,
  /^Archivo prueba/i,
  /^Reject prueba/i,
  /^Doc prueba/i,
  /^Privada prueba/i,
  /^Demo tablero /,
  /^Salvaguarda super_admin/,
  /^Checklist/i,
  /^Notif f1 \d+$/,
  /^Dbg acc \d+$/,
]

const TEST_FOLDER_PATTERNS = [
  /^_pruebas$/i,
  /^pruebas?$/i,
  /^Prueba$/,
  /^Prueba /,
  /^Demo tablero /,
]

const TEST_REQUESTER_EMAILS = new Set([
  'visual.requester@bacarsa.com.ar',
  'implementaciones.ti@bacarsa.com.ar',
])

const APPROVAL_REASON_SNIPPETS = [
  'prueba automatizada',
  'prueba visual',
  'Harness',
  'Chequeo visual',
  'Probe acceso visual',
  'E2E:',
  'Limpieza archivo prueba',
  'Limpieza prueba',
  'Limpieza tras prueba',
]

function log(action, detail) {
  console.log(`${APPLY ? 'APPLY' : 'DRY'}  ${action} — ${detail}`)
}

function matchesTestName(name) {
  if (typeof name !== 'string') return false
  const trimmed = name.trim()
  if (trimmed === 'Prueba') return true
  if (TEST_NAME_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return true
  return TEST_NAME_PATTERNS.some((re) => re.test(trimmed))
}

function matchesTestFolder(name) {
  if (typeof name !== 'string') return false
  const trimmed = name.trim()
  if (trimmed === 'Prueba') return true
  return TEST_FOLDER_PATTERNS.some((re) => re.test(trimmed))
}

async function api(idToken, method, path, body) {
  const init = { method, headers: { Authorization: `Bearer ${idToken}` } }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${API}${path}`, init)
  const text = await res.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // texto
  }
  return { status: res.status, body: parsed }
}

async function listChildren(drive, parentId) {
  const files = []
  let pageToken
  do {
    const listed = await drive.files.list({
      q: `'${parentId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      orderBy: 'name_natural',
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    files.push(...(listed.data.files ?? []))
    pageToken = listed.data.nextPageToken ?? undefined
  } while (pageToken)
  return files.filter((f) => f.id && f.name)
}

async function collectFromFolder(drive, folderId, areaName, depth = 0) {
  const children = await listChildren(drive, folderId)
  const toTrash = []
  const toKeep = []

  for (const item of children) {
    const isFolder = item.mimeType === FOLDER_MIME
    const testByName = isFolder ? matchesTestFolder(item.name) : matchesTestName(item.name)

    if (testByName) {
      toTrash.push({ ...item, areaName, depth, reason: 'nombre' })
      if (isFolder) {
        const nested = await collectFromFolder(drive, item.id, areaName, depth + 1)
        toTrash.push(...nested.toTrash)
        toKeep.push(...nested.toKeep)
      }
      continue
    }

    if (isFolder && /^_pruebas$/i.test(item.name.trim())) {
      toTrash.push({ ...item, areaName, depth, reason: 'carpeta _pruebas' })
      const nested = await collectFromFolder(drive, item.id, areaName, depth + 1)
      toTrash.push(...nested.toTrash)
      continue
    }

    if (depth === 0) {
      toKeep.push({ ...item, areaName, depth })
    } else {
      toKeep.push({ ...item, areaName, depth })
    }
  }

  return { toTrash, toKeep }
}

async function collectFirestoreTestIds(db) {
  const ids = new Set()
  const names = new Map()

  const driveSnap = await db.collection('driveFiles').get()
  for (const doc of driveSnap.docs) {
    const name = doc.get('name')
    if (matchesTestName(name)) {
      ids.add(doc.id)
      names.set(doc.id, name)
    }
  }

  const approvalSnap = await db.collection('approvalRequests').get()
  for (const doc of approvalSnap.docs) {
    const data = doc.data()
    const fileId = typeof data.fileId === 'string' ? data.fileId : null
    const fileName = typeof data.fileName === 'string' ? data.fileName : ''
    const reason = typeof data.reason === 'string' ? data.reason : ''
    const requesterEmail =
      typeof data.requesterEmail === 'string' ? data.requesterEmail.trim().toLowerCase() : ''
    const testHarness = data.testHarness === true

    const isTest =
      matchesTestName(fileName) ||
      testHarness ||
      TEST_REQUESTER_EMAILS.has(requesterEmail) ||
      APPROVAL_REASON_SNIPPETS.some((s) => reason.includes(s))

    if (fileId && isTest) {
      ids.add(fileId)
      names.set(fileId, fileName || nameFromId(names, fileId))
    }
  }

  return { ids, names }
}

function nameFromId(names, id) {
  return names.get(id) ?? id
}

async function resolveFirestoreItems(drive, db, firestoreIds, namesById) {
  const resolved = []
  for (const fileId of firestoreIds) {
    try {
      const meta = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, trashed, parents',
        supportsAllDrives: true,
      })
      if (meta.data.trashed) continue
      resolved.push({
        id: fileId,
        name: meta.data.name ?? namesById.get(fileId) ?? fileId,
        mimeType: meta.data.mimeType,
        areaName: '(Firestore)',
        depth: 0,
        reason: 'sidecar/metadata prueba',
      })
    } catch {
      // archivo ya no existe en Drive
    }
  }
  return resolved
}

async function trashFiles(adminToken, items) {
  let trashed = 0
  const seen = new Set()
  const sorted = [...items].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))

  for (const item of sorted) {
    if (seen.has(item.id)) continue
    seen.add(item.id)

    const res = await api(adminToken, 'POST', `/api/drive/files/${item.id}/trash`, {
      reason: TRASH_REASON,
    })
    if (res.status === 200 || res.status === 409) {
      log('trash', `${item.areaName} / ${item.name} (${item.id}) [${item.reason}]`)
      if (APPLY) trashed++
    } else {
      log('trash FAIL', `${item.name} (${item.id}) → ${res.status} ${JSON.stringify(res.body)}`)
    }
  }
  return trashed
}

async function cleanupSidecars(db, fileIds) {
  const idSet = new Set(fileIds)
  let deletedApprovals = 0
  let deletedDriveFiles = 0

  const approvalSnap = await db.collection('approvalRequests').get()
  for (const doc of approvalSnap.docs) {
    const data = doc.data()
    const fileId = data.fileId
    const fileName = data.fileName ?? ''
    const reason = data.reason ?? ''
    const requesterEmail = (data.requesterEmail ?? '').trim().toLowerCase()
    const testHarness = data.testHarness === true

    const isTest =
      (fileId && idSet.has(fileId)) ||
      matchesTestName(fileName) ||
      testHarness ||
      TEST_REQUESTER_EMAILS.has(requesterEmail) ||
      APPROVAL_REASON_SNIPPETS.some((s) => String(reason).includes(s))

    if (!isTest) continue
    log('delete approvalRequest', `${doc.id} (${fileName || fileId || '?'})`)
    if (APPLY) await doc.ref.delete()
    deletedApprovals++
  }

  for (const fileId of fileIds) {
    const ref = db.collection('driveFiles').doc(fileId)
    const snap = await ref.get()
    if (!snap.exists) continue
    log('delete driveFiles', `${fileId} (${snap.get('name') ?? '?'})`)
    if (APPLY) await ref.delete()
    deletedDriveFiles++
  }

  return { deletedApprovals, deletedDriveFiles }
}

async function main() {
  const drive = await getDrive()
  const db = getAdminDb()
  const { idToken, email } = await getTestIdToken()

  console.log(`Modo: ${APPLY ? 'APPLY (papelera)' : 'DRY-RUN'}`)
  console.log(`API: ${API}`)
  console.log(`Operador: ${email}`)
  console.log('')

  const allToTrash = []
  const allToKeep = []

  for (const area of AREA_FOLDERS) {
    const children = await listChildren(drive, area.driveId)
    console.log(`--- ${area.name} (${area.driveId}) — ${children.length} ítem(s) en raíz ---`)

    for (const item of children) {
      const isFolder = item.mimeType === FOLDER_MIME
      const isDemoOnlyArea = area.skipUnlessDemo === true

      if (isDemoOnlyArea) {
        if (matchesTestName(item.name) || matchesTestFolder(item.name)) {
          allToTrash.push({ ...item, areaName: area.name, depth: 0, reason: 'demo/test en Tableros' })
          if (isFolder) {
            const nested = await collectFromFolder(drive, item.id, area.name, 1)
            allToTrash.push(...nested.toTrash)
            allToKeep.push(...nested.toKeep)
          }
        } else {
          allToKeep.push({ ...item, areaName: area.name, depth: 0 })
          if (LIST_ALL) {
            console.log(`  KEEP  ${item.name}`)
          }
        }
        continue
      }

      const testByName = isFolder ? matchesTestFolder(item.name) : matchesTestName(item.name)
      if (testByName || /^_pruebas$/i.test(item.name?.trim() ?? '')) {
        allToTrash.push({
          ...item,
          areaName: area.name,
          depth: 0,
          reason: testByName ? 'nombre' : 'carpeta _pruebas',
        })
        if (isFolder) {
          const nested = await collectFromFolder(drive, item.id, area.name, 1)
          allToTrash.push(...nested.toTrash)
        }
      } else {
        allToKeep.push({ ...item, areaName: area.name, depth: 0 })
        if (LIST_ALL) {
          console.log(`  KEEP  ${item.name}`)
        }
      }
    }
  }

  const { ids: firestoreIds, names: namesById } = await collectFirestoreTestIds(db)
  const fromFirestore = await resolveFirestoreItems(drive, db, firestoreIds, namesById)

  const byId = new Map()
  for (const item of [...allToTrash, ...fromFirestore]) {
    byId.set(item.id, item)
  }
  const uniqueTrash = [...byId.values()]

  console.log('')
  console.log('=== Resumen ===')
  console.log(`Áreas escaneadas: ${AREA_FOLDERS.length}`)
  console.log(`Ítems a papelera (por nombre en raíz de área): ${allToTrash.length}`)
  console.log(`Ítems extra vía Firestore: ${fromFirestore.length}`)
  console.log(`Total único a papelera: ${uniqueTrash.length}`)
  console.log(`Ítems conservados en raíz de área: ${allToKeep.length}`)
  console.log('')

  if (uniqueTrash.length === 0) {
    console.log('No se encontraron archivos de prueba para eliminar.')
    if (allToKeep.length > 0 && !LIST_ALL) {
      console.log('Ejecutá con --list-all para ver qué queda en las carpetas madre.')
    }
    return
  }

  console.log('--- Detalle (papelera) ---')
  for (const item of uniqueTrash.sort((a, b) =>
    `${a.areaName}:${a.name}`.localeCompare(`${b.areaName}:${b.name}`),
  )) {
    console.log(`  ${item.areaName}  ${item.name}  (${item.id})  [${item.reason}]`)
  }

  if (!APPLY) {
    console.log('')
    console.log('Dry-run listo. Para ejecutar: node backend/scripts/cleanup-area-test-files.mjs --apply')
    return
  }

  const trashed = await trashFiles(idToken, uniqueTrash)
  const fileIds = uniqueTrash.map((i) => i.id)
  const sidecars = await cleanupSidecars(db, fileIds)

  console.log('')
  console.log(`Papelera: ${trashed} ítem(s)`)
  console.log(`approvalRequests eliminados: ${sidecars.deletedApprovals}`)
  console.log(`driveFiles eliminados: ${sidecars.deletedDriveFiles}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
