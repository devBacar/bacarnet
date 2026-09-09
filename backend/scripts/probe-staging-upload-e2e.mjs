/** E2E staging upload: prepare → PUT GCS → complete → trash */
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()
process.env.TEST_EMAIL = 'sistemas.ti@bacarsa.com.ar'

const { idToken } = await getTestIdToken()
const SUB = '1OlN_jhPwkkVhsf6gGgpbEWXVdFwTnECa'
const API = 'https://bacarnet.web.app'
const size = 500_000
const buffer = new Uint8Array(size)
buffer[0] = 0x4d
buffer[1] = 0x5a

const prepare = await fetch(`${API}/api/drive/files/upload/prepare`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fileName: `staging-e2e-${Date.now()}.exe`,
    mimeType: 'application/octet-stream',
    fileSize: size,
    parentFolderId: SUB,
    classification: 'USO_INTERNO',
    reason: 'E2E staging upload probe',
  }),
})
const prep = await prepare.json()
console.log('prepare', prepare.status, prep.error ?? 'OK')

const put = await fetch(prep.signedUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: buffer,
})
console.log('PUT GCS', put.status)

const complete = await fetch(`${API}/api/drive/files/upload/complete`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uploadId: prep.uploadId,
    objectPath: prep.objectPath,
    fileName: prep.objectPath.split('/').pop(),
    mimeType: 'application/octet-stream',
    parentFolderId: SUB,
    classification: 'USO_INTERNO',
    reason: 'E2E staging upload probe',
  }),
})
const done = await complete.json()
console.log('complete', complete.status, done.error ?? done.id)

if (done.id) {
  await fetch(`${API}/api/drive/files/${done.id}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'cleanup e2e' }),
  })
}

process.exit(prepare.ok && put.ok && complete.ok ? 0 : 1)
