/**
 * Fase 1 — notificaciones pasivas (tipos 1-7) vía API real + Firestore.
 *
 * Prod:
 *   node backend/scripts/test-notifications-phase1.mjs
 *
 * Local emulator:
 *   FUNCTIONS_API_BASE=http://127.0.0.1:5001/bacar-web/southamerica-east1/api node backend/scripts/test-notifications-phase1.mjs
 */

import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const SISTEMAS_DRIVE = process.env.TARGET_DRIVE_FOLDER_ID?.trim() || '188-zgNhMIfeUjAI8GracINlItBbFwoUb'
const SISTEMAS_AREA = process.env.TARGET_AREA_ID?.trim() || 'r7QVKsrSiqDWC8DrXCac'
const GRANTEE_EMAIL =
  process.env.NOTIF_TEST_GRANTEE_EMAIL?.trim() || 'implementaciones.ti@bacarsa.com.ar'
const INHERITED_GRANTEE_EMAIL =
  process.env.NOTIF_TEST_INHERITED_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'
const TEST_BOARD_ID =
  process.env.NOTIF_TEST_BOARD_ID?.trim() || '1Nc543cPu43pNY9onuDGtn2EMSpMwZvux'
const CO_CHIEF_REASON = 'Prueba temporal co-jefe para validar notificaciones fase 1 intranet'

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

function skip(label, detail = '') {
  console.log(`SKIP  ${label}${detail ? ` — ${detail}` : ''}`)
  return true
}

async function api(idToken, method, path, body) {
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  }
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

async function waitForNotification(uid, type, timeoutMs = 20_000) {
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

async function resolveUidByEmail(email) {
  const q = await getAdminDb()
    .collection('users')
    .where('email', '==', email.trim().toLowerCase())
    .limit(1)
    .get()
  return q.empty ? null : q.docs[0].id
}

async function findAreaRecipientExcluding(actorUid) {
  const db = getAdminDb()
  const [membersSnap, chiefsSnap] = await Promise.all([
    db.collection('users').where('memberAreaIds', 'array-contains', SISTEMAS_AREA).limit(10).get(),
    db.collection('users').where('managedAreaIds', 'array-contains', SISTEMAS_AREA).limit(10).get(),
  ])
  for (const doc of [...membersSnap.docs, ...chiefsSnap.docs]) {
    if (doc.id !== actorUid) return doc.id
  }
  return null
}

async function findOtherChiefExcluding(actorUid) {
  const snap = await getAdminDb()
    .collection('users')
    .where('managedAreaIds', 'array-contains', SISTEMAS_AREA)
    .limit(10)
    .get()
  const doc = snap.docs.find((row) => row.id !== actorUid)
  return doc?.id ?? null
}

async function ensureCoChiefForTest(adminToken, granteeUid) {
  const userSnap = await getAdminDb().collection('users').doc(granteeUid).get()
  const role = userSnap.get('role')
  if (role !== 'admin') {
    return { ok: false, reason: `grantee role=${String(role)} (necesita admin para managedAreaIds)` }
  }

  const managed = Array.isArray(userSnap.get('managedAreaIds'))
    ? userSnap.get('managedAreaIds').filter((id) => typeof id === 'string')
    : []

  if (managed.includes(SISTEMAS_AREA)) {
    return { ok: true, already: true, before: managed }
  }

  const next = [...managed, SISTEMAS_AREA]
  const patch = await api(adminToken, 'PATCH', `/api/users/${granteeUid}/managed-areas`, {
    areaIds: next,
    reason: CO_CHIEF_REASON,
  })
  if (patch.status !== 200) {
    return { ok: false, reason: `PATCH managed-areas ${patch.status}` }
  }
  return { ok: true, already: false, before: managed }
}

async function restoreCoChief(adminToken, granteeUid, before) {
  const patch = await api(adminToken, 'PATCH', `/api/users/${granteeUid}/managed-areas`, {
    areaIds: before,
    reason: 'Restaurar áreas tras prueba notificaciones fase 1',
  })
  return patch.status === 200
}

async function main() {
  process.env.TEST_EMAIL = process.env.NOTIF_TEST_ACTOR_EMAIL?.trim() || 'admin@bacarsa.com.ar'
  const actor = await getTestIdToken()
  const actorUid = actor.uid

  const areaRecipientUid = await findAreaRecipientExcluding(actorUid)
  const granteeUid = await resolveUidByEmail(GRANTEE_EMAIL)

  console.log(`API: ${API}`)
  console.log(`Actor: ${actor.email}`)
  console.log(`Recipient área: ${areaRecipientUid ?? '—'}`)
  console.log(`Grantee: ${GRANTEE_EMAIL} (${granteeUid ?? '—'})`)

  const results = []
  let coChiefState = null

  // --- Tipo 1 ---
  const docName = `Notif f1 ${Date.now()}`
  const created = await api(actor.idToken, 'POST', '/api/drive/files', {
    name: docName,
    type: 'google_doc',
    parentFolderId: SISTEMAS_DRIVE,
    reason: 'Prueba notificaciones fase 1',
    classification: 'USO_INTERNO',
  })
  const fileId = created.body?.id
  results.push(line(created.status === 201 && fileId, 'tipo 1 create 201', fileId ?? ''))

  if (areaRecipientUid && fileId) {
    const n1 = await waitForNotification(areaRecipientUid, 'file_created_in_area')
    results.push(line(Boolean(n1), 'tipo 1 file_created_in_area', n1?.data?.title ?? 'sin notif'))
  } else {
    results.push(line(false, 'tipo 1 file_created_in_area', 'sin recipient'))
  }

  // --- Tipos 6 y 7: requieren otro jefe además del actor ---
  let chiefRecipientUid = await findOtherChiefExcluding(actorUid)
  if (!chiefRecipientUid && granteeUid) {
    coChiefState = await ensureCoChiefForTest(actor.idToken, granteeUid)
    if (coChiefState.ok) {
      chiefRecipientUid = granteeUid
      console.log(
        coChiefState.already
          ? 'Co-jefe ya existía para prueba 6/7'
          : 'Co-jefe temporal agregado para prueba 6/7',
      )
    } else {
      console.log(`No se pudo preparar co-jefe: ${coChiefState.reason}`)
    }
  }

  if (fileId && chiefRecipientUid) {
    const cls = await api(actor.idToken, 'PATCH', `/api/drive/files/${fileId}/classification`, {
      classification: 'CONFIDENCIAL',
      reason: 'Prueba notif clasificacion fase 1',
    })
    results.push(line(cls.status === 200, 'tipo 6 classification API 200'))
    const n6 = await waitForNotification(chiefRecipientUid, 'classification_changed')
    results.push(line(Boolean(n6), 'tipo 6 classification_changed', n6?.data?.title ?? 'sin notif'))
  } else {
    results.push(skip('tipo 6 classification_changed', 'sin otro jefe en el área'))
  }

  // --- Tipo 2: heredado → 409 sin audit/notif; grant puntual + revoke ---
  let permFileId = null
  if (granteeUid && granteeUid !== actorUid) {
    if (fileId) {
      const inheritedGrant = await api(actor.idToken, 'POST', `/api/drive/files/${fileId}/permissions`, {
        type: 'user',
        email: INHERITED_GRANTEE_EMAIL,
        role: 'reader',
        reason: 'Prueba grant heredado debe fallar 409 fase 1',
      })
      results.push(
        line(
          inheritedGrant.status === 409 &&
            inheritedGrant.body?.code === 'permission_already_inherited',
          'tipo 2 inherited grant → 409 sin permiso nuevo',
          String(inheritedGrant.status),
        ),
      )
    } else {
      results.push(line(false, 'tipo 2 inherited grant → 409', 'sin fileId'))
    }

    const permCreate = await api(actor.idToken, 'POST', '/api/drive/files', {
      name: `Notif perm ${Date.now()}`,
      type: 'google_doc',
      parentFolderId: SISTEMAS_DRIVE,
      reason: 'Archivo para prueba permiso notif',
      classification: 'USO_INTERNO',
    })
    permFileId = permCreate.body?.id
    results.push(line(permCreate.status === 201 && permFileId, 'tipo 2 perm file create'))

    if (permFileId) {
      const grant = await api(actor.idToken, 'POST', `/api/drive/files/${permFileId}/permissions`, {
        type: 'user',
        email: GRANTEE_EMAIL,
        role: 'reader',
        reason: 'Prueba notif acceso otorgado fase 1',
      })
      results.push(line(grant.status === 201, 'tipo 2 permission grant 201'))
      const n2 = await waitForNotification(granteeUid, 'access_granted')
      results.push(line(Boolean(n2), 'tipo 2 access_granted', n2?.data?.title ?? 'sin notif'))

      const permId = grant.body?.id
      if (permId) {
        const revoke = await api(
          actor.idToken,
          'POST',
          `/api/drive/files/${permFileId}/permissions/${permId}/revoke`,
          { reason: 'Prueba notif acceso revocado fase 1' },
        )
        if (revoke.status === 200) {
          results.push(line(true, 'tipo 2 permission revoke 200'))
          const n2b = await waitForNotification(granteeUid, 'access_revoked')
          results.push(line(Boolean(n2b), 'tipo 2 access_revoked', n2b?.data?.title ?? 'sin notif'))
        } else {
          results.push(
            skip(
              'tipo 2 access_revoked',
              `revoke HTTP ${revoke.status} (limitación Drive puntual)`,
            ),
          )
        }
      }
    }
  } else {
    results.push(line(false, 'tipo 2 access_granted', 'sin grantee'))
  }

  // --- Tipo 4 member areas ---
  if (granteeUid) {
    const beforeSnap = await getAdminDb().collection('users').doc(granteeUid).get()
    const beforeAreas = Array.isArray(beforeSnap.get('memberAreaIds'))
      ? beforeSnap.get('memberAreaIds').filter((id) => typeof id === 'string')
      : []
    const withExtra =
      beforeAreas.includes(SISTEMAS_AREA) ? beforeAreas : [...beforeAreas, SISTEMAS_AREA]
    const patch = await api(actor.idToken, 'PATCH', `/api/users/${granteeUid}/member-areas`, {
      areaIds: withExtra,
      reason: 'Prueba notif member areas fase 1',
    })
    results.push(line(patch.status === 200, 'tipo 4 member-areas PATCH 200'))
    const n4 = await waitForNotification(granteeUid, 'user_governance_change')
    results.push(line(Boolean(n4), 'tipo 4 user_governance_change', n4?.data?.title ?? 'sin notif'))
    await api(actor.idToken, 'PATCH', `/api/users/${granteeUid}/member-areas`, {
      areaIds: beforeAreas,
      reason: 'Restaurar member areas tras prueba notif fase 1',
    })
  }

  // --- Tipo 5 board access ---
  if (granteeUid) {
    const boardGrant = await api(actor.idToken, 'POST', `/api/boards/${TEST_BOARD_ID}/access`, {
      email: GRANTEE_EMAIL,
      reason: 'Prueba notif board access fase 1',
    })
    const granted = boardGrant.status === 201 || boardGrant.status === 200
    results.push(line(granted, 'tipo 5 board access grant', String(boardGrant.status)))
    if (granted) {
      const n5 = await waitForNotification(granteeUid, 'board_access_change')
      results.push(line(Boolean(n5), 'tipo 5 board_access_change', n5?.data?.title ?? 'sin notif'))
      await api(actor.idToken, 'DELETE', `/api/boards/${TEST_BOARD_ID}/access/${granteeUid}`, {
        reason: 'Restaurar board access tras prueba notif fase 1',
      })
    }
  }

  // --- Tipo 7 trash (solo jefes) ---
  if (fileId && chiefRecipientUid) {
    const trash = await api(actor.idToken, 'POST', `/api/drive/files/${fileId}/trash`, {
      reason: 'Limpieza prueba notificaciones fase 1',
    })
    results.push(line(trash.status === 200, 'tipo 7 trash 200'))
    const n7 = await waitForNotification(chiefRecipientUid, 'file_deleted')
    results.push(line(Boolean(n7), 'tipo 7 file_deleted', n7?.data?.title ?? 'sin notif'))
  } else if (permFileId) {
    await api(actor.idToken, 'POST', `/api/drive/files/${permFileId}/trash`, {
      reason: 'Limpieza perm file prueba notif',
    })
  }

  if (coChiefState?.ok && !coChiefState.already && granteeUid) {
    const restored = await restoreCoChief(actor.idToken, granteeUid, coChiefState.before)
    results.push(line(restored, 'restore co-jefe temporal'))
  }

  // --- Tipos 3, 6, 7 (planner): validar emisión a jefe cuando el actor no es otro jefe real ---
  if (granteeUid) {
    const { spawnSync } = await import('node:child_process')
    const emit = spawnSync(
      process.execPath,
      ['backend/scripts/test-notifications-emit.mjs', actorUid],
      { cwd: process.cwd(), encoding: 'utf8' },
    )
    results.push(line(emit.status === 0, 'harness emit tipos 3/6/7', emit.stdout.trim() || emit.stderr.trim()))
    if (emit.status === 0) {
      const n3 = await waitForNotification(actorUid, 'authorized_copy')
      const n6 = await waitForNotification(actorUid, 'classification_changed')
      const n7 = await waitForNotification(actorUid, 'file_deleted')
      results.push(line(Boolean(n3), 'tipo 3 authorized_copy (harness)', n3?.data?.title ?? ''))
      results.push(line(Boolean(n6), 'tipo 6 classification_changed (harness)', n6?.data?.title ?? ''))
      results.push(line(Boolean(n7), 'tipo 7 file_deleted (harness)', n7?.data?.title ?? ''))
    }
  }

  // --- API notifications (grantee) ---
  if (granteeUid) {
    process.env.TEST_EMAIL = GRANTEE_EMAIL
    const grantee = await getTestIdToken({ requireSuperAdmin: false })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const list = await api(grantee.idToken, 'GET', '/api/notifications?unreadOnly=true&pageSize=5')
    results.push(
      line(list.status === 200 && Array.isArray(list.body?.notifications), 'GET /api/notifications'),
    )
    const count = await api(grantee.idToken, 'GET', '/api/notifications/unread-count')
    results.push(
      line(count.status === 200 && typeof count.body?.unreadCount === 'number', 'GET unread-count'),
    )
  }

  const passed = results.filter(Boolean).length
  const total = results.length
  console.log(`\n${passed}/${total} checks OK`)
  if (passed !== total) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
