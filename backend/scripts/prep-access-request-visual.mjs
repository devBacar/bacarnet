/**
 * Prepara archivos y contraseñas temporales para chequeo visual Fase 2.
 *   node backend/scripts/prep-access-request-visual.mjs
 */

import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const BASE = process.env.INTRANET_BASE?.trim() || 'https://bacarnet.web.app'
const TEST_DRIVE_FOLDER =
  process.env.ACCESS_TEST_DRIVE_FOLDER?.trim() || '1xSy-TSp4EFeqYJ2n772X46Pj5WM42WZ5'
const REQUESTER_EMAIL =
  process.env.ACCESS_VISUAL_REQUESTER_EMAIL?.trim() || 'implementaciones.ti@bacarsa.com.ar'
const APPROVER_EMAIL =
  process.env.ACCESS_VISUAL_APPROVER_EMAIL?.trim() || 'admin@bacarsa.com.ar'

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

async function setTemporaryPassword(email) {
  const db = getAdminDb()
  const q = await db.collection('users').where('email', '==', email).limit(1).get()
  if (q.empty) throw new Error(`Usuario ${email} no encontrado`)
  const uid = q.docs[0].id
  const tempPassword = generateEphemeralPassword()
  await getAuth().updateUser(uid, { password: tempPassword })
  return { uid, tempPassword }
}

async function ensureVisualRequester(email) {
  const db = getAdminDb()
  const auth = getAuth()
  const normalized = email.trim().toLowerCase()
  const record = await auth.getUserByEmail(normalized)
  const uid = record.uid

  const userRef = db.collection('users').doc(uid)
  const snap = await userRef.get()
  if (!snap.exists) {
    await userRef.set({
      email: normalized,
      displayName: record.displayName ?? normalized,
      role: 'user',
      memberAreaIds: [],
      managedAreaIds: [],
      permissions: { view_directory: true, view_drive: true },
      createdAt: new Date().toISOString(),
      note: 'Perfil creado para chequeo visual Fase 2 solicitud acceso',
    })
  }

  return uid
}

async function main() {
  process.env.TEST_EMAIL = APPROVER_EMAIL
  const approver = await getTestIdToken()
  const approverCreds = await setTemporaryPassword(APPROVER_EMAIL)

  process.env.TEST_EMAIL = REQUESTER_EMAIL
  await ensureVisualRequester(REQUESTER_EMAIL)
  const requester = await getTestIdToken({ requireSuperAdmin: false })
  const requesterCreds = await setTemporaryPassword(REQUESTER_EMAIL)

  const ts = Date.now()
  const approveFile = await api(approver.idToken, 'POST', '/api/drive/files', {
    name: `Visual approve ${ts}`,
    type: 'google_doc',
    parentFolderId: TEST_DRIVE_FOLDER,
    reason: 'Archivo para chequeo visual solicitud acceso — aprobar',
    classification: 'USO_INTERNO',
  })
  const rejectFile = await api(approver.idToken, 'POST', '/api/drive/files', {
    name: `Visual reject ${ts}`,
    type: 'google_doc',
    parentFolderId: TEST_DRIVE_FOLDER,
    reason: 'Archivo para chequeo visual solicitud acceso — rechazar',
    classification: 'USO_INTERNO',
  })

  if (approveFile.status !== 201 || rejectFile.status !== 201) {
    console.error('Error creando archivos:', { approveFile, rejectFile })
    process.exit(1)
  }

  let probeCreateStatus = null
  if (process.argv.includes('--probe')) {
    const probe = await api(requester.idToken, 'POST', '/api/approval-requests/access', {
      fileId: approveFile.body.id,
      reason: 'Probe acceso visual fase 2',
    })
    probeCreateStatus = probe.status
  }

  console.log(
    JSON.stringify(
      {
        base: BASE,
        requesterEmail: REQUESTER_EMAIL,
        requesterPassword: requesterCreds.tempPassword,
        requesterUid: requester.uid,
        approverEmail: APPROVER_EMAIL,
        approverPassword: approverCreds.tempPassword,
        approverUid: approver.uid,
        approveFileId: approveFile.body.id,
        approveFileName: approveFile.body.name,
        rejectFileId: rejectFile.body.id,
        rejectFileName: rejectFile.body.name,
        probeCreateStatus,
        requestReason: 'Necesito revisar este documento para la prueba visual de solicitud de acceso',
        rejectReason: 'Segunda solicitud visual para probar rechazo desde campanita',
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
