/**
 * Diagnóstico upload instalador (Sistemas vs raíz).
 *   node backend/scripts/probe-installer-upload.mjs
 */
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const SISTEMAS_DRIVE = '188-zgNhMIfeUjAI8GracINlItBbFwoUb'
const API = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'

process.env.TEST_EMAIL = 'sistemas.ti@bacarsa.com.ar'
const { idToken } = await getTestIdToken()
const db = getAdminDb()

const mapping = await db.collection('driveFolderAreas').doc(SISTEMAS_DRIVE).get()
console.log('driveFolderAreas/Sistemas:', mapping.exists ? mapping.data() : '(no existe)')

async function tryUpload(parentFolderId, label) {
  const form = new FormData()
  const buf = new Uint8Array([0x4d, 0x5a, ...Array(64).fill(0)])
  form.set('file', new Blob([buf], { type: 'application/octet-stream' }), `probe-${Date.now()}.exe`)
  form.set('parentFolderId', parentFolderId)
  form.set('classification', 'USO_INTERNO')
  form.set('reason', 'Diagnóstico upload instalador intranet')

  const res = await fetch(`${API}/api/drive/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  console.log(`\n${label}`)
  console.log('  parent:', parentFolderId)
  console.log('  status:', res.status)
  console.log('  body:', JSON.stringify(body))

  if (body.id) {
    await fetch(`${API}/api/drive/files/${body.id}/trash`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Limpieza probe instalador' }),
    })
  }
}

// Raíz compartida (debe fallar para instaladores)
const rootRes = await fetch(`${API}/api/drive/files?folderId=root`, {
  headers: { Authorization: `Bearer ${idToken}` },
})
const rootJson = await rootRes.json().catch(() => ({}))
const rootId = rootJson?.parentId ?? 'root'

await tryUpload(SISTEMAS_DRIVE, 'Dentro de carpeta Sistemas (debe 201)')
await tryUpload(rootId, 'En raíz Drive (debe 403 installer_area_restricted)')
