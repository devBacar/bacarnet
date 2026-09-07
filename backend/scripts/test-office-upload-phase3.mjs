/**
 * Fase 3 — subida Office con aprobación (staging GCS + notificación actionable tipo 9).
 *
 *   npm run test:office-upload:phase3
 */

import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'
import { minimalDocxBuffer } from './minimal-docx.mjs'

loadTestEnv()

const API = process.env.FUNCTIONS_API_BASE?.trim() || 'https://intranet-bacar.web.app'
const TEST_DRIVE_FOLDER =
  process.env.OFFICE_TEST_DRIVE_FOLDER?.trim() || '1NeotsCiPgZaaL1NNTbjHGilltY-IIwq7'
const REQUESTER_EMAIL = process.env.OFFICE_TEST_REQUESTER_EMAIL?.trim() || null
const APPROVER_EMAIL = process.env.OFFICE_TEST_APPROVER_EMAIL?.trim() || 'admin@bacarsa.com.ar'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function apiJson(idToken, method, path, body) {
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

async function apiOfficeUpload(idToken, { fileName, buffer, parentFolderId, reason }) {
  const form = new FormData()
  form.set('file', new Blob([buffer], { type: DOCX_MIME }), fileName)
  form.set('parentFolderId', parentFolderId)
  form.set('classification', 'USO_INTERNO')
  form.set('reason', reason)

  const res = await fetch(`${API}/api/approval-requests/office-upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: form,
  })
  const text = await res.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // texto
  }
  return { status: res.status, body: parsed }
}

async function waitForNotification(uid, type, timeoutMs = 25_000) {
  const db = getAdminDb()
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get()
    const match = snap.docs.find((doc) => doc.get('type') === type && doc.get('read') === false)
    if (match) return { id: match.id, data: match.data() }
    await new Promise((resolve) => setTimeout(resolve, 900))
  }
  return null
}

async function main() {
  process.env.TEST_EMAIL = APPROVER_EMAIL
  const approver = await getTestIdToken()
  const approverUid = approver.uid

  if (REQUESTER_EMAIL) process.env.TEST_EMAIL = REQUESTER_EMAIL
  else delete process.env.TEST_EMAIL
  const requester = await getTestIdToken({ requireSuperAdmin: false })

  console.log(`API: ${API}`)
  console.log(`Aprobador: ${APPROVER_EMAIL}`)
  console.log(`Solicitante: ${requester.email}`)

  const results = []
  const docxBuffer = minimalDocxBuffer()
  const approveFileName = `Office f3 approve ${Date.now()}.docx`
  const rejectFileName = `Office f3 reject ${Date.now()}.docx`

  const directBlocked = await fetch(`${API}/api/drive/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${requester.idToken}` },
    body: (() => {
      const form = new FormData()
      form.set('file', new Blob([docxBuffer], { type: DOCX_MIME }), approveFileName)
      form.set('parentFolderId', TEST_DRIVE_FOLDER)
      form.set('classification', 'USO_INTERNO')
      form.set('reason', 'Intento upload directo Office fase 3')
      return form
    })(),
  })
  const directBody = await directBlocked.json().catch(() => ({}))
  results.push(
    line(
      directBlocked.status === 409 && directBody.code === 'office_requires_approval',
      'upload directo Office → 409 office_requires_approval',
      String(directBlocked.status),
    ),
  )

  const created = await apiOfficeUpload(requester.idToken, {
    fileName: approveFileName,
    buffer: docxBuffer,
    parentFolderId: TEST_DRIVE_FOLDER,
    reason: 'Solicitud de subida Office fase 3 para probar approve',
  })
  const requestId = created.body?.id
  results.push(line(created.status === 201 && requestId, 'POST office-upload 201', requestId ?? ''))

  const chiefNotif = await waitForNotification(approverUid, 'office_upload_request')
  results.push(
    line(Boolean(chiefNotif), 'tipo 9 office_upload_request actionable', chiefNotif?.data?.category ?? ''),
  )

  let approvedFileId = null
  if (requestId) {
    const approve = await apiJson(approver.idToken, 'POST', `/api/approval-requests/${requestId}/approve`, {
      reason: 'Aprobado en prueba automatizada fase 3',
    })
    approvedFileId = approve.body?.fileId ?? null
    results.push(line(approve.status === 200 && approvedFileId, 'POST approve 200', String(approve.status)))

    const approvedNotif = await waitForNotification(requester.uid, 'office_upload_approved')
    results.push(
      line(Boolean(approvedNotif), 'requester office_upload_approved', approvedNotif?.data?.title ?? ''),
    )
  }

  const rejectCreated = await apiOfficeUpload(requester.idToken, {
    fileName: rejectFileName,
    buffer: docxBuffer,
    parentFolderId: TEST_DRIVE_FOLDER,
    reason: 'Solicitud de subida Office fase 3 para probar reject',
  })
  const rejectRequestId = rejectCreated.body?.id
  results.push(line(rejectCreated.status === 201 && rejectRequestId, 'POST office-upload reject flow 201'))

  if (rejectRequestId) {
    const reject = await apiJson(approver.idToken, 'POST', `/api/approval-requests/${rejectRequestId}/reject`, {
      reason: 'Rechazado en prueba automatizada fase 3',
    })
    results.push(line(reject.status === 200, 'POST reject 200'))

    const rejectedNotif = await waitForNotification(requester.uid, 'office_upload_rejected')
    results.push(line(Boolean(rejectedNotif), 'requester office_upload_rejected', rejectedNotif?.data?.title ?? ''))
  }

  if (approvedFileId) {
    await apiJson(approver.idToken, 'POST', `/api/drive/files/${approvedFileId}/trash`, {
      reason: 'Limpieza archivo prueba fase 3',
    })
  }

  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} checks OK`)
  if (passed !== results.length) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
