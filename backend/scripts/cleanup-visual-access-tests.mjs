/**
 * Limpia rastros de pruebas visuales Fase 2 en prod.
 *
 *   node backend/scripts/cleanup-visual-access-tests.mjs           ***REMOVED*** dry-run
 *   node backend/scripts/cleanup-visual-access-tests.mjs --apply   ***REMOVED*** ejecutar
 */

import { getAuth } from 'firebase-admin/auth'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const APPLY = process.argv.includes('--apply')
const API = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'

const VISUAL_REQUESTER_EMAIL = 'visual.requester@bacarsa.com.ar'
const TI_EMAIL = 'implementaciones.ti@bacarsa.com.ar'

const FILE_NAME_PATTERNS = [
  /^Visual approve \d+$/,
  /^Visual reject \d+$/,
  /^Access req f2 \d+$/,
  /^Access reject f2 \d+$/,
]

const APPROVAL_REASON_SNIPPETS = [
  'Probe acceso visual fase 2',
  'Chequeo visual Fase 2',
  'prueba visual de solicitud de acceso',
  'Harness: solicitud de acceso fase 2',
  'Harness reject fase 2',
  'Aprobado en chequeo visual Fase 2',
  'Rechazado en chequeo visual Fase 2',
]

function matchesFileName(name) {
  return typeof name === 'string' && FILE_NAME_PATTERNS.some((re) => re.test(name.trim()))
}

function log(action, detail) {
  console.log(`${APPLY ? 'APPLY' : 'DRY'}  ${action} — ${detail}`)
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

async function deleteSubcollection(docRef, subName) {
  const snap = await docRef.collection(subName).get()
  if (snap.empty) return 0
  let deleted = 0
  for (const doc of snap.docs) {
    log('delete', `${docRef.path}/${subName}/${doc.id}`)
    if (APPLY) await doc.ref.delete()
    deleted++
  }
  return deleted
}

async function findUserByEmail(email) {
  const db = getAdminDb()
  const q = await db.collection('users').where('email', '==', email).limit(1).get()
  return q.empty ? null : q.docs[0]
}

async function collectTestFileIds(db) {
  const ids = new Set()

  const approvalSnap = await db.collection('approvalRequests').get()
  for (const doc of approvalSnap.docs) {
    const data = doc.data()
    const fileId = typeof data.fileId === 'string' ? data.fileId : null
    const fileName = typeof data.fileName === 'string' ? data.fileName : ''
    const reason = typeof data.reason === 'string' ? data.reason : ''
    const requesterEmail =
      typeof data.requesterEmail === 'string' ? data.requesterEmail.trim().toLowerCase() : ''
    const testHarness = data.testHarness === true

    if (
      fileId &&
      (matchesFileName(fileName) ||
        testHarness ||
        requesterEmail === VISUAL_REQUESTER_EMAIL ||
        APPROVAL_REASON_SNIPPETS.some((s) => reason.includes(s)))
    ) {
      ids.add(fileId)
    }
  }

  const driveSnap = await db.collection('driveFiles').get()
  for (const doc of driveSnap.docs) {
    const name = doc.get('name')
    if (matchesFileName(name)) ids.add(doc.id)
  }

  return [...ids]
}

async function trashFiles(adminToken, fileIds) {
  let trashed = 0
  for (const fileId of fileIds) {
    const res = await api(adminToken, 'POST', `/api/drive/files/${fileId}/trash`, {
      reason: 'Limpieza tras pruebas visuales Fase 2',
    })
    if (res.status === 200 || res.status === 409) {
      log('trash file', `${fileId} (${res.status})`)
      if (APPLY) trashed++
    } else {
      log('trash file FAIL', `${fileId} → ${res.status} ${JSON.stringify(res.body)}`)
    }
  }
  return trashed
}

async function deleteApprovalRequests(db, fileIds) {
  const fileIdSet = new Set(fileIds)
  const snap = await db.collection('approvalRequests').get()
  let deleted = 0
  for (const doc of snap.docs) {
    const data = doc.data()
    const fileId = data.fileId
    const fileName = data.fileName
    const reason = data.reason ?? ''
    const requesterEmail = (data.requesterEmail ?? '').trim().toLowerCase()
    const testHarness = data.testHarness === true

    const isTest =
      (fileId && fileIdSet.has(fileId)) ||
      matchesFileName(fileName) ||
      testHarness ||
      requesterEmail === VISUAL_REQUESTER_EMAIL ||
      APPROVAL_REASON_SNIPPETS.some((s) => String(reason).includes(s))

    if (!isTest) continue
    log('delete approvalRequest', `${doc.id} (${fileName ?? fileId ?? '?'})`)
    if (APPLY) await doc.ref.delete()
    deleted++
  }
  return deleted
}

async function cleanupVisualRequester(db, auth) {
  let deleted = 0
  const firestoreDoc = await findUserByEmail(VISUAL_REQUESTER_EMAIL)
  let authUid = null
  try {
    authUid = (await auth.getUserByEmail(VISUAL_REQUESTER_EMAIL)).uid
  } catch {
    // no auth user
  }

  const uid = firestoreDoc?.id ?? authUid
  if (!uid) {
    log('skip user', `${VISUAL_REQUESTER_EMAIL} (no existe)`)
    return 0
  }

  const userRef = db.collection('users').doc(uid)
  deleted += await deleteSubcollection(userRef, 'notifications')

  if (firestoreDoc) {
    log('delete users doc', `${uid} (${VISUAL_REQUESTER_EMAIL})`)
    if (APPLY) await userRef.delete()
    deleted++
  }

  if (authUid) {
    log('delete auth user', `${authUid} (${VISUAL_REQUESTER_EMAIL})`)
    if (APPLY) await auth.deleteUser(authUid)
    deleted++
  }

  return deleted
}

async function cleanupTiVisualProfile(db) {
  const doc = await findUserByEmail(TI_EMAIL)
  if (!doc) {
    log('skip ti profile', 'no users doc')
    return 0
  }
  const note = doc.get('note')
  if (note !== 'Perfil creado para chequeo visual Fase 2 solicitud acceso') {
    log('skip ti profile', `note distinta: ${String(note)}`)
    return 0
  }
  log('delete ti users doc', `${doc.id} (perfil visual temporal)`)
  if (APPLY) {
    await deleteSubcollection(doc.ref, 'notifications')
    await doc.ref.delete()
  }
  return 1
}

async function cleanupStaleNotifications(db) {
  const emails = [VISUAL_REQUESTER_EMAIL, TI_EMAIL, 'admin@bacarsa.com.ar', 'implementaciones.it@bacarsa.com.ar']
  const titleSnippets = ['Visual approve', 'Visual reject', 'Access req f2', 'Access reject f2', 'Visual Requester']
  let deleted = 0

  for (const email of emails) {
    const userDoc = await findUserByEmail(email)
    if (!userDoc) continue
    const notifs = await userDoc.ref.collection('notifications').get()
    for (const n of notifs.docs) {
      const title = String(n.get('title') ?? '')
      const body = String(n.get('body') ?? '')
      const payload = JSON.stringify(n.data())
      const hit =
        titleSnippets.some((s) => title.includes(s) || body.includes(s) || payload.includes(s))
      if (!hit) continue
      log('delete notification', `${email} → ${n.id} (${title.slice(0, 60)})`)
      if (APPLY) await n.ref.delete()
      deleted++
    }
  }
  return deleted
}

async function main() {
  const db = getAdminDb()
  const auth = getAuth()

  console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

  process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
  const admin = await getTestIdToken()

  const fileIds = await collectTestFileIds(db)
  console.log(`Archivos de prueba detectados: ${fileIds.length}`)
  for (const id of fileIds) console.log(`  - ${id}`)

  const trashed = await trashFiles(admin.idToken, fileIds)
  const approvals = await deleteApprovalRequests(db, fileIds)
  const visualUser = await cleanupVisualRequester(db, auth)
  const tiProfile = await cleanupTiVisualProfile(db)
  const notifs = await cleanupStaleNotifications(db)

  console.log('\n=== RESUMEN ===')
  console.log(`Archivos a papelera: ${trashed}`)
  console.log(`approvalRequests eliminados: ${approvals}`)
  console.log(`Operaciones visual.requester: ${visualUser}`)
  console.log(`Perfil ti visual eliminado: ${tiProfile}`)
  console.log(`Notificaciones stale eliminadas: ${notifs}`)

  if (!APPLY) {
    console.log('\nDry-run completo. Para ejecutar: --apply')
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
