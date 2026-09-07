import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

loadTestEnv()
initAdmin()
const db = getAdminDb()
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const snap = await db.collection('approvalRequests').orderBy('createdAt', 'desc').limit(40).get()
const matches = snap.docs.filter((doc) => String(doc.get('fileName') ?? '').toLowerCase().includes('viajes'))
console.log(`matches: ${matches.length}`)
for (const doc of matches) {
  console.log({
    id: doc.id,
    fileName: doc.get('fileName'),
    mimeType: doc.get('mimeType'),
    status: doc.get('status'),
    staging: doc.get('stagingObjectPath'),
    requester: doc.get('requesterEmail'),
  })
}

if (matches[0]) {
  const doc = matches[0]
  process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
  const approver = await getTestIdToken()
  const res = await fetch(
    `https://bacarnet.web.app/api/approval-requests/${doc.id}/staging-preview`,
    { headers: { Authorization: `Bearer ${approver.idToken}` } },
  )
  const body = await res.json()
  console.log('preview status', res.status)
  const redacted =
    typeof body.previewUrl === 'string'
      ? body.previewUrl.replace(/([?&]t=)[^&]+/, '$1[REDACTED]')
      : body.previewUrl
  console.log('previewUrl', redacted)
  const content = await fetch(body.previewUrl)
  const buf = Buffer.from(await content.arrayBuffer())
  console.log('content', content.status, content.headers.get('content-type'), buf.length, 'bytes')
  console.log('magic', buf.subarray(0, 8).toString('hex'))
  const { downloadPendingFile } = await import(
    pathToFileURL(resolve(ROOT, 'backend/lib/lib/google/pendingUploadsStorage.js')).href
  )
  const staging = await downloadPendingFile(doc.get('stagingObjectPath'))
  console.log('staging magic', staging.subarray(0, 8).toString('hex'))
}
