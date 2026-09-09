import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()
process.env.TEST_EMAIL = 'sistemas.ti@bacarsa.com.ar'

const { idToken } = await getTestIdToken()
const SUB = '1OlN_jhPwkkVhsf6gGgpbEWXVdFwTnECa'
const API = 'https://bacarnet.web.app'

const form = new FormData()
form.set(
  'file',
  new Blob([new Uint8Array([0x4d, 0x5a, ...Array(200).fill(0)])], {
    type: 'application/vnd.microsoft.portable-executable',
  }),
  'small-test.exe',
)
form.set('parentFolderId', SUB)
form.set('classification', 'USO_INTERNO')
form.set('reason', 'Test multipart exe prod')

const multipart = await fetch(`${API}/api/drive/files/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${idToken}` },
  body: form,
})
const multipartBody = await multipart.text()
console.log('multipart', multipart.status, multipartBody)

const prepare = await fetch(`${API}/api/drive/files/upload/prepare`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fileName: 'big-test.exe',
    mimeType: 'application/octet-stream',
    fileSize: 25 * 1024 * 1024,
    parentFolderId: SUB,
    classification: 'USO_INTERNO',
    reason: 'Test prepare staging',
  }),
})
console.log('prepare', prepare.status, await prepare.text())

try {
  const mp = JSON.parse(multipartBody)
  if (mp.id) {
    await fetch(`${API}/api/drive/files/${mp.id}/trash`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'cleanup probe' }),
    })
  }
} catch {
  // ignore
}
