import { FieldValue } from 'firebase-admin/firestore'
import { minimalDocxBuffer } from './minimal-docx.mjs'
import { minimalXlsxBuffer } from './minimal-xlsx.mjs'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { dirname, resolve } from 'node:path'
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

async function one(label, fileName, mimeType, buffer) {
  const ref = db.collection('approvalRequests').doc()
  const requestId = ref.id
  await uploadPendingFile(requestId, fileName, mimeType, buffer)
  await ref.set({
    kind: 'office_upload_request',
    status: 'pending',
    requesterUid: 'browser-test',
    requesterEmail: 'browser-test@bacarsa.com.ar',
    fileName,
    mimeType,
    stagingObjectPath: stagingObjectPath(requestId, fileName),
    parentFolderId: '1NeotsCiPgZaaL1NNTbjHGilltY-IIwq7',
    classification: 'USO_INTERNO',
    reason: 'browser embed test',
    governingAreaId: 'a36R9jwN4m47Ftn3wGCp',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  const res = await fetch(
    `https://intranet-bacar.web.app/api/approval-requests/${requestId}/staging-preview`,
    { headers: { Authorization: `Bearer ${approver.idToken}` } },
  )
  const body = await res.json()
  const content = await fetch(body.previewUrl)
  const embed = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(body.previewUrl)}`
  console.log(`${label} preview HTTP ${content.status}`)
  console.log(`${label} embed=${embed}`)
}

await one('DOCX', 'browser-docx.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', minimalDocxBuffer())
await one('XLSX', 'browser-xlsx.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', minimalXlsxBuffer())
