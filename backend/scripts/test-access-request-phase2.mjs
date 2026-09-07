/**
 * Fase 2 — solicitud de acceso (approvalRequests + notificación actionable tipo 8).
 *
 * Prod: todos los @bacarsa suelen tener acceso heredado a la Unidad compartida;
 * el flujo HTTP de creación devuelve 409 en ese caso (esperado). El approve/reject
 * se prueba con una solicitud sembrada vía Admin SDK (harness).
 *
 *   node backend/scripts/test-access-request-phase2.mjs
 */

import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API = process.env.FUNCTIONS_API_BASE?.trim() || 'https://intranet-bacar.web.app'
const TEST_DRIVE_FOLDER =
  process.env.ACCESS_TEST_DRIVE_FOLDER?.trim() || '1NeotsCiPgZaaL1NNTbjHGilltY-IIwq7'
const REQUESTER_EMAIL =
  process.env.ACCESS_TEST_REQUESTER_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'
const APPROVER_EMAIL = process.env.ACCESS_TEST_APPROVER_EMAIL?.trim() || 'admin@bacarsa.com.ar'

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function api(idToken, method, path, body) {
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

async function seedAccessRequestHarness(input) {
  const db = getAdminDb()
  const docRef = db.collection('approvalRequests').doc()
  const now = FieldValue.serverTimestamp()
  const record = {
    kind: 'access_request',
    status: 'pending',
    requesterUid: input.requesterUid,
    requesterEmail: input.requesterEmail,
    requesterDisplayName: input.requesterDisplayName,
    fileId: input.fileId,
    fileName: input.fileName,
    parentFolderId: input.parentFolderId,
    mimeType: input.mimeType,
    governingAreaId: input.governingAreaId,
    governingAreaName: input.governingAreaName,
    reason: input.reason,
    role: 'reader',
    createdAt: now,
    updatedAt: now,
    testHarness: true,
  }
  await docRef.set(record)

  const { emitAccessRequestCreatedBestEffort } = await import(
    '../lib/modules/notifications/emitAccessRequest.js'
  )
  await emitAccessRequestCreatedBestEffort(
    {
      id: docRef.id,
      ...record,
      createdAt: null,
      updatedAt: null,
    },
    {
      uid: input.requesterUid,
      email: input.requesterEmail,
      displayName: input.requesterDisplayName ?? input.requesterEmail,
    },
  )
  return docRef.id
}

async function main() {
  process.env.TEST_EMAIL = APPROVER_EMAIL
  const approver = await getTestIdToken()
  const approverUid = approver.uid

  process.env.TEST_EMAIL = REQUESTER_EMAIL
  const requester = await getTestIdToken({ requireSuperAdmin: false })

  console.log(`API: ${API}`)
  console.log(`Aprobador: ${APPROVER_EMAIL}`)
  console.log(`Solicitante: ${REQUESTER_EMAIL}`)

  const results = []
  let fileId = null

  const created = await api(approver.idToken, 'POST', '/api/drive/files', {
    name: `Access req f2 ${Date.now()}`,
    type: 'google_doc',
    parentFolderId: TEST_DRIVE_FOLDER,
    reason: 'Archivo para prueba solicitud acceso fase 2',
    classification: 'USO_INTERNO',
  })
  fileId = created.body?.id
  results.push(line(created.status === 201 && fileId, 'setup create file 201', fileId ?? ''))

  if (fileId) {
    const blocked = await api(requester.idToken, 'POST', '/api/approval-requests/access', {
      fileId,
      reason: 'Intento cuando ya hay acceso heredado',
    })
    results.push(
      line(blocked.status === 409, 'POST access con acceso previo → 409', String(blocked.status)),
    )

    const requestId = await seedAccessRequestHarness({
      requesterUid: requester.uid,
      requesterEmail: requester.email,
      requesterDisplayName: requester.email,
      fileId,
      fileName: created.body?.name ?? 'Archivo prueba',
      parentFolderId: TEST_DRIVE_FOLDER,
      mimeType: 'application/vnd.google-apps.document',
      governingAreaId: created.body?.governingAreaId ?? null,
      governingAreaName: null,
      reason: 'Harness: solicitud de acceso fase 2 para probar approve/reject',
    })
    results.push(line(Boolean(requestId), 'harness seed approvalRequest', requestId ?? ''))

    const chiefNotif = await waitForNotification(approverUid, 'access_request')
    results.push(
      line(Boolean(chiefNotif), 'tipo 8 access_request actionable', chiefNotif?.data?.category ?? ''),
    )

    if (requestId) {
      const approve = await api(approver.idToken, 'POST', `/api/approval-requests/${requestId}/approve`, {
        reason: 'Aprobado en prueba automatizada fase 2',
      })
      results.push(line(approve.status === 200, 'POST approve 200', String(approve.status)))

      const approvedNotif = await waitForNotification(requester.uid, 'access_request_approved')
      results.push(line(Boolean(approvedNotif), 'requester access_request_approved', approvedNotif?.data?.title ?? ''))
    }

    const rejectFile = await api(approver.idToken, 'POST', '/api/drive/files', {
      name: `Access reject f2 ${Date.now()}`,
      type: 'google_doc',
      parentFolderId: TEST_DRIVE_FOLDER,
      reason: 'Archivo para prueba reject fase 2',
      classification: 'USO_INTERNO',
    })
    const rejectFileId = rejectFile.body?.id
    if (rejectFileId) {
      const rejectRequestId = await seedAccessRequestHarness({
        requesterUid: requester.uid,
        requesterEmail: requester.email,
        requesterDisplayName: requester.email,
        fileId: rejectFileId,
        fileName: rejectFile.body?.name ?? 'Reject prueba',
        parentFolderId: TEST_DRIVE_FOLDER,
        mimeType: 'application/vnd.google-apps.document',
        governingAreaId: rejectFile.body?.governingAreaId ?? null,
        governingAreaName: null,
        reason: 'Harness reject fase 2',
      })
      const reject = await api(approver.idToken, 'POST', `/api/approval-requests/${rejectRequestId}/reject`, {
        reason: 'Rechazado en prueba automatizada fase 2',
      })
      results.push(line(reject.status === 200, 'POST reject 200'))
      const rejectedNotif = await waitForNotification(requester.uid, 'access_request_rejected')
      results.push(line(Boolean(rejectedNotif), 'requester access_request_rejected', rejectedNotif?.data?.title ?? ''))
      await api(approver.idToken, 'POST', `/api/drive/files/${rejectFileId}/trash`, {
        reason: 'Limpieza reject file fase 2',
      })
    }

    await api(approver.idToken, 'POST', `/api/drive/files/${fileId}/trash`, {
      reason: 'Limpieza archivo prueba fase 2',
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
