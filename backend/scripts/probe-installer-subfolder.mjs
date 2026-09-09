/**
 * Prueba upload instalador en subcarpeta de Sistemas.
 *   node backend/scripts/probe-installer-subfolder.mjs
 */
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { getDrive } from '../lib/lib/google/driveClient.js'

loadTestEnv()
initAdmin()

const SISTEMAS_DRIVE = '188-zgNhMIfeUjAI8GracINlItBbFwoUb'
const API = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

process.env.TEST_EMAIL = 'sistemas.ti@bacarsa.com.ar'
const { idToken } = await getTestIdToken()
const drive = await getDrive()

const listed = await drive.files.list({
  q: `'${SISTEMAS_DRIVE}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
  fields: 'files(id, name)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  pageSize: 50,
})
const folders = listed.data.files ?? []
console.log('Subcarpetas directas en Sistemas:')
for (const f of folders) console.log(' -', f.name, f.id)

let target = folders.find((f) => f.name?.toLowerCase() === 'instaladores')
if (!target?.id) {
  console.log('\nNo existe "instaladores"; creando carpeta de prueba...')
  const created = await drive.files.create({
    requestBody: {
      name: 'instaladores',
      mimeType: FOLDER_MIME,
      parents: [SISTEMAS_DRIVE],
    },
    fields: 'id, name',
    supportsAllDrives: true,
  })
  target = created.data
}

const subId = target.id
console.log('\nProbando subcarpeta:', target.name, subId)

const meta = await drive.files.get({
  fileId: subId,
  fields: 'id, name, parents',
  supportsAllDrives: true,
})
console.log('parents:', meta.data.parents)

const parentMeta = meta.data.parents?.[0]
  ? await drive.files.get({
      fileId: meta.data.parents[0],
      fields: 'id, name, parents',
      supportsAllDrives: true,
    })
  : null
if (parentMeta) {
  console.log('parent folder:', parentMeta.data.name, parentMeta.data.id)
  console.log('parent is Sistemas root:', parentMeta.data.id === SISTEMAS_DRIVE)
}

const form = new FormData()
const buf = new Uint8Array([0x4d, 0x5a, ...Array(64).fill(0)])
form.set('file', new Blob([buf], { type: 'application/octet-stream' }), `probe-sub-${Date.now()}.exe`)
form.set('parentFolderId', subId)
form.set('classification', 'USO_INTERNO')
form.set('reason', 'Diagnóstico upload instalador en subcarpeta Sistemas/instaladores')

const res = await fetch(`${API}/api/drive/files/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${idToken}` },
  body: form,
})
const body = await res.json().catch(() => ({}))
console.log('\nupload status:', res.status)
console.log('body:', JSON.stringify(body, null, 2))

if (body.id) {
  await fetch(`${API}/api/drive/files/${body.id}/trash`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason: 'Limpieza probe subcarpeta' }),
  })
}
