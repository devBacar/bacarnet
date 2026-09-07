import { readFileSync } from 'node:fs'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

loadTestEnv()
initAdmin()
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
const approver = await getTestIdToken()
const db = getAdminDb()
const { uploadPendingFile, stagingObjectPath } = await import(
  pathToFileURL(resolve(ROOT, 'backend/lib/lib/google/pendingUploadsStorage.js')).href
)

const samples = [
  {
    label: 'DOCX-real',
    path: resolve(tmpdir(), 'demo.docx'),
    fileName: 'demo.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  {
    label: 'XLSX-real',
    path: resolve(tmpdir(), 'sample1.xlsx'),
    fileName: 'sample1.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
]

for (const sample of samples) {
  const buffer = readFileSync(sample.path)
  const ref = db.collection('approvalRequests').doc()
  const requestId = ref.id
  await uploadPendingFile(requestId, sample.fileName, sample.mimeType, buffer)
  await ref.set({
    kind: 'office_upload_request',
    status: 'pending',
    requesterUid: 'browser-test',
    requesterEmail: 'browser-test@bacarsa.com.ar',
    fileName: sample.fileName,
    mimeType: sample.mimeType,
    stagingObjectPath: stagingObjectPath(requestId, sample.fileName),
    parentFolderId: '1NeotsCiPgZaaL1NNTbjHGilltY-IIwq7',
    classification: 'USO_INTERNO',
    reason: 'real file embed test',
    governingAreaId: 'a36R9jwN4m47Ftn3wGCp',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  const res = await fetch(
    `https://bacarnet.web.app/api/approval-requests/${requestId}/staging-preview`,
    { headers: { Authorization: `Bearer ${approver.idToken}` } },
  )
  const body = await res.json()
  const embed = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(body.previewUrl)}`
  console.log(`${sample.label} embed=${embed}`)
}
