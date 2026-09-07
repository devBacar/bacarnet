/**
 * Instaladores (.exe/.msi/.dmg/.pkg): upload directo en Sistemas, rechazo fuera.
 *
 *   npm run test:drive:installer
 */

import { createHash } from 'node:crypto'
import { getAdminDb, getTestIdToken } from './get-test-token.mjs'
import { getDrive } from '../lib/lib/google/driveClient.js'

const SISTEMAS_DRIVE = '188-zgNhMIfeUjAI8GracINlItBbFwoUb'
const SISTEMAS_AREA = 'r7QVKsrSiqDWC8DrXCac'
const COMPRAS_DRIVE = '1dzq22AX5t9SM72plMcXvhgrYKOzAoq1z'

function apiBase() {
  return (
    process.env.FUNCTIONS_API_BASE?.trim() ||
    'http://127.0.0.1:5001/bacar-web/southamerica-east1/api'
  )
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function buildFakeExeBuffer() {
  const prefix = Buffer.from('MZFAKE-INSTALLER-TEST-')
  const suffix = Buffer.alloc(128, 0xab)
  return Buffer.concat([prefix, suffix])
}

async function uploadInstaller(token, { parentFolderId, name, buffer, mimeType }) {
  const form = new FormData()
  form.set('file', new Blob([buffer], { type: mimeType }), name)
  form.set('parentFolderId', parentFolderId)
  form.set('classification', 'CONFIDENCIAL')
  form.set('reason', 'Prueba de subida de instalador en intranet')

  const res = await fetch(`${apiBase()}/api/drive/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function downloadDriveFile(fileId) {
  const drive = await getDrive()
  const meta = await drive.files.get({
    fileId,
    supportsAllDrives: true,
    fields: 'id, size, md5Checksum',
  })
  const content = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  const buffer = Buffer.from(content.data)
  return { meta: meta.data, buffer }
}

async function trashFile(token, fileId) {
  await fetch(`${apiBase()}/api/drive/files/${fileId}/trash`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
}

async function main() {
  process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
  const user = await getTestIdToken()
  const buffer = buildFakeExeBuffer()
  const hash = sha256(buffer)
  const name = `Prueba-installer-${Date.now()}.exe`

  const okUpload = await uploadInstaller(user.idToken, {
    parentFolderId: SISTEMAS_DRIVE,
    name,
    buffer,
    mimeType: 'application/octet-stream',
  })

  const okId = okUpload.body?.id
  let downloadOk = false
  let downloadHash = null
  if (okId) {
    const downloaded = await downloadDriveFile(okId)
    downloadHash = sha256(downloaded.buffer)
    downloadOk =
      downloaded.buffer.length === buffer.length &&
      downloadHash === hash &&
      String(downloaded.meta.size ?? downloaded.buffer.length) === String(buffer.length)
    await trashFile(user.idToken, okId)
  }

  const rejectUpload = await uploadInstaller(user.idToken, {
    parentFolderId: COMPRAS_DRIVE,
    name: `Rechazo-${Date.now()}.exe`,
    buffer,
    mimeType: 'application/octet-stream',
  })

  const rejectOctetWithoutExt = await uploadInstaller(user.idToken, {
    parentFolderId: SISTEMAS_DRIVE,
    name: `Binario-generico-${Date.now()}.bin`,
    buffer,
    mimeType: 'application/octet-stream',
  })

  const sidecar = okId ? await getAdminDb().collection('driveFiles').doc(okId).get() : null

  const checks = [
    ['upload Sistemas 201', okUpload.status === 201],
    ['área Sistemas', okUpload.body?.governingAreaId === SISTEMAS_AREA],
    ['sidecar presente', Boolean(sidecar?.exists)],
    ['descarga íntegra', downloadOk],
    ['rechazo fuera Sistemas 403', rejectUpload.status === 403],
    [
      'rechazo .bin octet-stream',
      rejectOctetWithoutExt.status === 403,
    ],
  ]

  for (const [label, ok] of checks) console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`)
  if (!downloadOk) {
    console.log(`hash local=${hash} descargado=${downloadHash}`)
  }
  if (rejectUpload.status !== 403) {
    console.log('reject body', JSON.stringify(rejectUpload.body))
  }

  process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
