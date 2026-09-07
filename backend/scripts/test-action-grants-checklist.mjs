/**
 * Checklist: actionGrants + migración managed/member areas.
 *
 *   FUNCTIONS_API_BASE=https://bacarnet.web.app node backend/scripts/test-action-grants-checklist.mjs
 */

import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getTestIdToken } from './get-test-token.mjs'

const BASE =
  process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'

const GRANTEE_EMAIL =
  process.env.GRANTEE_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'
const CHIEF_EMAIL =
  process.env.CHIEF_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'

const TARGET_AREA_ID =
  process.env.TARGET_AREA_ID?.trim() || 'r7QVKsrSiqDWC8DrXCac'
const TARGET_DRIVE_FOLDER_ID =
  process.env.TARGET_DRIVE_FOLDER_ID?.trim() || '188-zgNhMIfeUjAI8GracINlItBbFwoUb'

const REASON =
  'Checklist actionGrants prueba automatizada intranet Bacar septiembre 2026'
const GRANT_REASON =
  'Otorgamiento checklist actionGrants prueba automatizada intranet Bacar'
const REVOKE_REASON =
  'Revocacion checklist actionGrants prueba automatizada intranet Bacar'
const MANAGED_REASON =
  'Checklist migracion managed areas prueba automatizada intranet Bacar'

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function api(idToken, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // keep text
  }
  return { status: res.status, body: parsed }
}

async function latestAuditForUser(targetUid, action) {
  const q = await getAdminDb()
    .collection('auditLogs')
    .where('targetId', '==', targetUid)
    .where('action', '==', action)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get()
  return q.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

async function resolveGranteeUid(db) {
  const q = await db.collection('users').where('email', '==', GRANTEE_EMAIL).limit(1).get()
  if (q.empty) throw new Error(`No hay usuario ${GRANTEE_EMAIL}`)
  return q.docs[0].id
}

async function findOtherAreaFolder(adminToken) {
  const root = await api(adminToken, 'GET', '/api/drive/files?folderId=root')
  const folders = root.body?.files?.filter((f) => f.isFolder && f.id !== TARGET_DRIVE_FOLDER_ID) ?? []
  return folders[0] ?? null
}

async function main() {
  const db = getAdminDb()
  const granteeUid = await resolveGranteeUid(db)
  const granteeRef = db.collection('users').doc(granteeUid)
  const beforeSnap = await granteeRef.get()
  const beforeActionGrants = beforeSnap.get('actionGrants') ?? null
  const beforeManaged = beforeSnap.get('managedAreaIds') ?? []
  const beforeRole = beforeSnap.get('role') ?? null

  process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
  const admin = await getTestIdToken()

  process.env.TEST_EMAIL = GRANTEE_EMAIL
  const grantee = await getTestIdToken({ requireSuperAdmin: false })

  const results = []
  let areaFileId = null
  let otherFileId = null
  let otherAreaId = null

  console.log(`API: ${BASE}`)
  console.log(`super_admin: ${admin.email}`)
  console.log(`grantee: ${grantee.email} (${grantee.role})`)
  console.log(`target area: ${TARGET_AREA_ID}`)
  console.log('')

  try {
    // --- Checklist 1 prep: grant approval ---
    const grantRes = await api(admin.idToken, 'PATCH', `/api/users/${granteeUid}/action-grants`, {
      action: 'approval',
      areaId: TARGET_AREA_ID,
      operation: 'grant',
      reason: GRANT_REASON,
    })
    results.push(
      line(
        grantRes.status === 200 &&
          Array.isArray(grantRes.body?.actionGrants?.approval) &&
          grantRes.body.actionGrants.approval.includes(TARGET_AREA_ID),
        '1-setup  PATCH action-grants grant approval',
        `HTTP ${grantRes.status}`,
      ),
    )

    const created = await api(admin.idToken, 'POST', '/api/drive/files', {
      name: `Checklist actionGrants ${Date.now()}`,
      type: 'google_doc',
      parentFolderId: TARGET_DRIVE_FOLDER_ID,
      reason: REASON,
      classification: 'USO_INTERNO',
    })
    areaFileId = created.body?.id ?? null
    results.push(
      line(
        created.status === 201 && created.body?.governingAreaId === TARGET_AREA_ID,
        '1-setup  archivo en área objetivo',
        `HTTP ${created.status}; file=${areaFileId ?? 'null'}`,
      ),
    )

    // --- Checklist 1: approval 200, others 403 ---
    if (areaFileId) {
      const approve = await api(grantee.idToken, 'PATCH', `/api/drive/files/${areaFileId}/status`, {
        status: 'APROBADO',
        reason: REASON,
      })
      results.push(
        line(approve.status === 200, '1  approval en área grant → 200', `HTTP ${approve.status}`),
      )

      const classify = await api(
        grantee.idToken,
        'PATCH',
        `/api/drive/files/${areaFileId}/classification`,
        { classification: 'CONFIDENCIAL', reason: REASON },
      )
      results.push(
        line(
          classify.status === 403,
          '1  classification_change sin grant → 403',
          `HTTP ${classify.status}`,
        ),
      )

      const perms = await api(grantee.idToken, 'GET', `/api/drive/files/${areaFileId}/permissions`)
      results.push(
        line(
          perms.status === 403,
          '1  permission_grant sin grant → 403',
          `HTTP ${perms.status}`,
        ),
      )

      const copy = await api(
        grantee.idToken,
        'POST',
        `/api/drive/files/${areaFileId}/authorized-copy`,
        {
          recipientName: 'Tercero checklist',
          recipientEmail: 'destinatario.prueba.intranet@gmail.com',
          purpose: REASON,
          reason: REASON,
        },
      )
      results.push(
        line(
          copy.status === 403,
          '1  authorized_copy sin grant → 403',
          `HTTP ${copy.status}`,
        ),
      )
    }

    // --- Checklist 2: other area 403 ---
    const otherFolder = await findOtherAreaFolder(admin.idToken)
    if (otherFolder?.id) {
      const createdOther = await api(admin.idToken, 'POST', '/api/drive/files', {
        name: `Checklist otra area ${Date.now()}`,
        type: 'google_doc',
        parentFolderId: otherFolder.id,
        reason: REASON,
        classification: 'USO_INTERNO',
      })
      otherFileId = createdOther.body?.id ?? null
      otherAreaId = createdOther.body?.governingAreaId ?? null

      if (otherFileId && otherAreaId !== TARGET_AREA_ID) {
        const denyOther = await api(
          grantee.idToken,
          'PATCH',
          `/api/drive/files/${otherFileId}/status`,
          { status: 'APROBADO', reason: REASON },
        )
        results.push(
          line(
            denyOther.status === 403,
            '2  approval en otra área → 403',
            `HTTP ${denyOther.status}; area=${otherAreaId}`,
          ),
        )
      } else {
        results.push(line(false, '2  approval en otra área → 403', 'no se pudo crear archivo en otra área'))
      }
    } else {
      results.push(line(false, '2  approval en otra área → 403', 'sin carpeta alternativa en raíz'))
    }

    // --- Checklist 3: jefe de área sin regresión ---
    const chiefRef = db.collection('users').doc(
      (await db.collection('users').where('email', '==', CHIEF_EMAIL).limit(1).get()).docs[0]?.id ??
        granteeUid,
    )
    const chiefSnap = await chiefRef.get()
    const chiefBeforeRole = chiefSnap.get('role')
    const chiefBeforeAreas = Array.isArray(chiefSnap.get('managedAreaIds'))
      ? [...chiefSnap.get('managedAreaIds')]
      : []

    if (!chiefBeforeAreas.includes(TARGET_AREA_ID)) {
      await chiefRef.update({
        role: chiefBeforeRole === 'user' ? 'admin' : chiefBeforeRole,
        managedAreaIds: [...new Set([...chiefBeforeAreas, TARGET_AREA_ID])],
      })
    }

    process.env.TEST_EMAIL = CHIEF_EMAIL
    const chief = await getTestIdToken({ requireSuperAdmin: false })

    if (areaFileId) {
      const chiefApprove = await api(
        chief.idToken,
        'PATCH',
        `/api/drive/files/${areaFileId}/status`,
        { status: 'APROBADO', reason: REASON },
      )
      // puede ser 200 o 409 si ya aprobado en paso 1
      results.push(
        line(
          chiefApprove.status === 200 || chiefApprove.status === 409,
          '3  jefe approval',
          `HTTP ${chiefApprove.status}`,
        ),
      )

      const chiefClassify = await api(
        chief.idToken,
        'PATCH',
        `/api/drive/files/${areaFileId}/classification`,
        { classification: 'RESTRINGIDO', reason: REASON },
      )
      results.push(
        line(chiefClassify.status === 200, '3  jefe classification_change → 200', `HTTP ${chiefClassify.status}`),
      )

      const chiefPerms = await api(grantee.idToken, 'GET', `/api/drive/files/${areaFileId}/permissions`)
      // chief should use chief token
      const chiefPerms2 = await api(chief.idToken, 'GET', `/api/drive/files/${areaFileId}/permissions`)
      results.push(
        line(chiefPerms2.status === 200, '3  jefe permission_grant → 200', `HTTP ${chiefPerms2.status}`),
      )
      void chiefPerms

      const chiefCopy = await api(
        chief.idToken,
        'POST',
        `/api/drive/files/${areaFileId}/authorized-copy`,
        {
          recipientName: 'Tercero checklist jefe',
          recipientEmail: 'destinatario.prueba.intranet@gmail.com',
          purpose: REASON,
          reason: REASON,
        },
      )
      results.push(
        line(chiefCopy.status === 201, '3  jefe authorized_copy → 201', `HTTP ${chiefCopy.status}`),
      )
    }

    await chiefRef.update({ role: chiefBeforeRole, managedAreaIds: chiefBeforeAreas })

    // --- Checklist 4: revoke + audit ---
    const revokeRes = await api(admin.idToken, 'PATCH', `/api/users/${granteeUid}/action-grants`, {
      action: 'approval',
      areaId: TARGET_AREA_ID,
      operation: 'revoke',
      reason: REVOKE_REASON,
    })
    results.push(
      line(revokeRes.status === 200, '4  PATCH action-grants revoke', `HTTP ${revokeRes.status}`),
    )

    if (areaFileId) {
      const denyAfterRevoke = await api(
        grantee.idToken,
        'PATCH',
        `/api/drive/files/${areaFileId}/status`,
        { status: 'APROBADO', reason: REASON },
      )
      results.push(
        line(
          denyAfterRevoke.status === 403,
          '4  approval tras revoke → 403',
          `HTTP ${denyAfterRevoke.status}`,
        ),
      )
    }

    const auditLogs = await latestAuditForUser(granteeUid, 'action_grants_change')
    const grantLog = auditLogs.find(
      (log) =>
        log.metadata?.operation === 'grant' &&
        log.metadata?.governanceAction === 'approval' &&
        log.reason === GRANT_REASON,
    )
    const revokeLog = auditLogs.find(
      (log) =>
        log.metadata?.operation === 'revoke' &&
        log.metadata?.governanceAction === 'approval' &&
        log.reason === REVOKE_REASON,
    )
    results.push(
      line(
        Boolean(grantLog) &&
          Array.isArray(grantLog.metadata?.antes) &&
          Array.isArray(grantLog.metadata?.despues),
        '4  auditoría grant action_grants_change',
        grantLog ? `id=${grantLog.id}` : 'no encontrado',
      ),
    )
    results.push(
      line(
        Boolean(revokeLog) &&
          Array.isArray(revokeLog.metadata?.antes) &&
          Array.isArray(revokeLog.metadata?.despues),
        '4  auditoría revoke action_grants_change',
        revokeLog ? `id=${revokeLog.id}` : 'no encontrado',
      ),
    )

    // --- Checklist 5: managed-areas endpoint (mismo que UserManager) ---
    if (beforeRole === 'admin' || beforeRole === 'user') {
      const promoteRole = 'admin'
      if (beforeRole !== 'admin') {
        await granteeRef.update({ role: 'admin' })
      }
      const managedRes = await api(admin.idToken, 'PATCH', `/api/users/${granteeUid}/managed-areas`, {
        areaIds: [TARGET_AREA_ID],
        reason: MANAGED_REASON,
      })
      results.push(
        line(
          managedRes.status === 200 &&
            Array.isArray(managedRes.body?.managedAreaIds) &&
            managedRes.body.managedAreaIds.includes(TARGET_AREA_ID),
          '5  PATCH managed-areas (flujo UserManager)',
          `HTTP ${managedRes.status}`,
        ),
      )

      const managedAudit = (await latestAuditForUser(granteeUid, 'managed_areas_change'))[0]
      results.push(
        line(
          managedAudit?.reason === MANAGED_REASON,
          '5  auditoría managed_areas_change con motivo',
          managedAudit ? `reason ok` : 'sin log',
        ),
      )

      await api(admin.idToken, 'PATCH', `/api/users/${granteeUid}/managed-areas`, {
        areaIds: [],
        reason: MANAGED_REASON,
      })
      if (beforeRole !== 'admin') {
        await granteeRef.update({ role: beforeRole })
      }
    } else {
      results.push(line(true, '5  PATCH managed-areas (flujo UserManager)', 'omitido: grantee no es admin/user'))
    }
  } finally {
    const restore = {
      managedAreaIds: beforeManaged,
      role: beforeRole,
    }
    if (beforeActionGrants === null) {
      restore.actionGrants = FieldValue.delete()
    } else {
      restore.actionGrants = beforeActionGrants
    }
    await granteeRef.update(restore)
  }

  console.log('')
  console.log('--- Checklist actionGrants ---')
  const ok = results.length > 0 && results.every(Boolean)
  console.log(ok ? 'RESULTADO: OK' : 'RESULTADO: HAY FALLOS')
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
