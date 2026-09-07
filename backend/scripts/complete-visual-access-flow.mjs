/**
 * Completa flujo visual Fase 2 vía API (ti + admin) y verifica acceso/notificaciones.
 */
import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const API = 'https://intranet-bacar.web.app'

const approveFileId = process.argv[2] || '1ajOGvgJdZeKiuyQZXQvYnz7qajWSnq4A6e763p16thQ'
const rejectFileId = process.argv[3] || '1B8NY50_dsNB12cLffpzy2RUW6YlcHW3IDXnxDjrAABM'

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // keep
  }
  return { status: res.status, body: parsed }
}

process.env.TEST_EMAIL = 'implementaciones.ti@bacarsa.com.ar'
const requester = await getTestIdToken({ requireSuperAdmin: false })
process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
const admin = await getTestIdToken()

const createApprove = await api(requester.idToken, 'POST', '/api/approval-requests/access', {
  fileId: approveFileId,
  reason: 'Chequeo visual Fase 2 — solicitud para aprobar',
})
console.log('create approve', createApprove.status, createApprove.body?.id ?? createApprove.body)

const approveId =
  createApprove.body?.id ??
  (
    await getAdminDb()
      .collection('approvalRequests')
      .where('fileId', '==', approveFileId)
      .where('requesterUid', '==', requester.uid)
      .where('status', '==', 'pending')
      .limit(1)
      .get()
  ).docs[0]?.id

if (approveId) {
  const approved = await api(admin.idToken, 'POST', `/api/approval-requests/${approveId}/approve`, {
    reason: 'Aprobado en chequeo visual Fase 2',
  })
  console.log('approve', approved.status, approved.body)
}

const fileGet = await api(requester.idToken, 'GET', `/api/drive/files/${approveFileId}`)
console.log('requester file access', fileGet.status, fileGet.body?.name ?? fileGet.body)

const createReject = await api(requester.idToken, 'POST', '/api/approval-requests/access', {
  fileId: rejectFileId,
  reason: 'Chequeo visual Fase 2 — solicitud para rechazar',
})
console.log('create reject', createReject.status, createReject.body?.id ?? createReject.body)

const rejectId =
  createReject.body?.id ??
  (
    await getAdminDb()
      .collection('approvalRequests')
      .where('fileId', '==', rejectFileId)
      .where('requesterUid', '==', requester.uid)
      .where('status', '==', 'pending')
      .limit(1)
      .get()
  ).docs[0]?.id

if (rejectId) {
  const rejected = await api(admin.idToken, 'POST', `/api/approval-requests/${rejectId}/reject`, {
    reason: 'Rechazado en chequeo visual Fase 2',
  })
  console.log('reject', rejected.status, rejected.body)
}

const db = getAdminDb()
const notifs = await db
  .collection('users')
  .doc(requester.uid)
  .collection('notifications')
  .orderBy('createdAt', 'desc')
  .limit(5)
  .get()
for (const n of notifs.docs) {
  console.log('notif', n.get('type'), '|', n.get('title'), '| read=', n.get('read'))
}
