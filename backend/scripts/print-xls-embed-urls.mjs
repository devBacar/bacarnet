import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

loadTestEnv()
initAdmin()
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
const approver = await getTestIdToken()
const db = getAdminDb()
const { uploadPendingFile, stagingObjectPath } = await import(
  pathToFileURL(resolve(ROOT, 'backend/lib/lib/google/pendingUploadsStorage.js')).href
)

async function testFile(label, fileName, mimeType, buffer) {
  const ref = db.collection('approvalRequests').doc()
  const requestId = ref.id
  await uploadPendingFile(requestId, fileName, mimeType, buffer)
  await ref.set({
    kind: 'office_upload_request',
    status: 'pending',
    requesterUid: 'test',
    requesterEmail: 'test@bacarsa.com.ar',
    fileName,
    mimeType,
    stagingObjectPath: stagingObjectPath(requestId, fileName),
    parentFolderId: '1NeotsCiPgZaaL1NNTbjHGilltY-IIwq7',
    classification: 'USO_INTERNO',
    reason: 'xls embed test',
    governingAreaId: 'r7QVKsrSiqDWC8DrXCac',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  const res = await fetch(
    `https://bacarnet.web.app/api/approval-requests/${requestId}/staging-preview`,
    { headers: { Authorization: `Bearer ${approver.idToken}` } },
  )
  const body = await res.json()
  for (const mode of ['embed', 'view']) {
    const url =
      mode === 'embed'
        ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(body.previewUrl)}`
        : `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(body.previewUrl)}`
    console.log(`${label} ${mode}: ${url}`)
  }
}

const sampleXls = readFileSync(resolve(tmpdir(), 'sample1.xls'))
await testFile('sample1.xls', 'sample1.xls', 'application/vnd.ms-excel', sampleXls)

const { downloadPendingFile } = await import(
  pathToFileURL(resolve(ROOT, 'backend/lib/lib/google/pendingUploadsStorage.js')).href
)
const viajes = await downloadPendingFile('pending-uploads/mwzVgTf8l8g53ApU7x34/viajes.xls')
await testFile('viajes.xls', 'viajes.xls', 'application/vnd.ms-excel', viajes)
