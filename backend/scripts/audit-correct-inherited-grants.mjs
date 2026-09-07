/**
 * Revisa permission_grant históricos vs Drive (inherited) y opcionalmente escribe audit_correction.
 *
 *   node backend/scripts/audit-correct-inherited-grants.mjs              ***REMOVED*** dry-run (default)
 *   node backend/scripts/audit-correct-inherited-grants.mjs --apply      ***REMOVED*** escribe correcciones
 */

import { FieldValue } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { getAdminDb, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const APPLY = process.argv.includes('--apply')

export const CORRECTION_REASON =
  'Corrección: la entrada referenciada registró un otorgamiento de permiso que en realidad correspondía a acceso heredado preexistente en Drive, sin otorgamiento puntual nuevo.'

const CORRECTION_ACTOR = {
  userId: 'audit-correction-batch',
  userEmail: 'sistema.intranet@bacarsa.com.ar',
}

function isInherited(details) {
  return (details ?? []).some((row) => row?.inherited === true)
}

function inheritedFrom(details) {
  for (const row of details ?? []) {
    if (row?.inherited === true && typeof row.inheritedFrom === 'string' && row.inheritedFrom.length > 0) {
      return row.inheritedFrom
    }
  }
  return null
}

async function loadDrive() {
  const { getDrive } = await import('../lib/lib/google/driveClient.js')
  return getDrive()
}

async function verifyGrantAudit(drive, doc) {
  const data = doc.data()
  const metadata = data.metadata ?? {}
  const fileId = data.targetId
  const permissionId = typeof metadata.permissionId === 'string' ? metadata.permissionId : null
  const granteeEmail =
    typeof metadata.granteeEmail === 'string' ? metadata.granteeEmail.trim().toLowerCase() : null
  const shareType = typeof metadata.type === 'string' ? metadata.type : 'user'

  if (shareType !== 'user' || !granteeEmail) {
    return {
      auditId: doc.id,
      verdict: 'skip_non_user',
      detail: shareType === 'domain' ? 'grant de dominio' : 'sin granteeEmail',
      fileId,
      granteeEmail,
      permissionId,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      targetName: data.targetName,
    }
  }

  if (!fileId || !permissionId) {
    return {
      auditId: doc.id,
      verdict: 'indeterminate',
      detail: 'falta fileId o permissionId en metadata',
      fileId,
      granteeEmail,
      permissionId,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      targetName: data.targetName,
    }
  }

  try {
    const perm = await drive.permissions.get({
      fileId,
      permissionId,
      supportsAllDrives: true,
      fields: 'id, type, role, emailAddress, permissionDetails',
    })
    const inherited = isInherited(perm.data.permissionDetails)
    return {
      auditId: doc.id,
      verdict: inherited ? 'false_positive' : 'real_grant',
      detail: inherited
        ? `inherited desde ${inheritedFrom(perm.data.permissionDetails) ?? '?'}`
        : `permiso directo (${perm.data.role ?? '?'})`,
      fileId,
      granteeEmail,
      permissionId,
      inheritedFrom: inheritedFrom(perm.data.permissionDetails),
      driveRole: perm.data.role ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      targetName: data.targetName,
      originalReason: data.reason ?? null,
    }
  } catch (err) {
    const status = err?.response?.status ?? err?.code
    if (status === 404) {
      return {
        auditId: doc.id,
        verdict: 'indeterminate',
        detail: 'permissionId ya no existe en Drive (revocado o archivo eliminado)',
        fileId,
        granteeEmail,
        permissionId,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        targetName: data.targetName,
      }
    }
    return {
      auditId: doc.id,
      verdict: 'error',
      detail: err instanceof Error ? err.message : String(err),
      fileId,
      granteeEmail,
      permissionId,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      targetName: data.targetName,
    }
  }
}

async function correctionDocId(correctsAuditLogId) {
  return `corr_${createHash('sha256').update(correctsAuditLogId).digest('hex').slice(0, 32)}`
}

async function correctionExists(db, correctsAuditLogId) {
  const id = await correctionDocId(correctsAuditLogId)
  const snap = await db.collection('auditLogs').doc(id).get()
  return snap.exists ? id : null
}

async function writeCorrection(db, originalDoc, verification) {
  const original = originalDoc.data()
  const id = await correctionDocId(originalDoc.id)
  await db.collection('auditLogs').doc(id).set({
    userId: CORRECTION_ACTOR.userId,
    userEmail: CORRECTION_ACTOR.userEmail,
    action: 'audit_correction',
    targetType: original.targetType ?? 'file',
    targetId: original.targetId,
    targetName: original.targetName ?? '',
    parentFolderId: original.parentFolderId ?? null,
    mimeType: original.mimeType ?? null,
    reason: CORRECTION_REASON,
    metadata: {
      correctsAuditLogId: originalDoc.id,
      originalAction: 'permission_grant',
      originalCreatedAt: verification.createdAt,
      granteeEmail: verification.granteeEmail,
      permissionId: verification.permissionId,
      inheritedFrom: verification.inheritedFrom ?? null,
      driveRoleAtVerification: verification.driveRole ?? null,
      verificationDetail: verification.detail,
      correctionBatch: 'inherited-grant-audit-2026-09',
    },
    createdAt: FieldValue.serverTimestamp(),
  })
}

function printReport(results) {
  const groups = {
    false_positive: [],
    real_grant: [],
    skip_non_user: [],
    indeterminate: [],
    error: [],
  }
  for (const row of results) {
    groups[row.verdict]?.push(row)
  }

  console.log('\n=== RESUMEN ===')
  console.log(`Total permission_grant revisados: ${results.length}`)
  console.log(`Falsos positivos (heredado confirmado): ${groups.false_positive.length}`)
  console.log(`Grants reales (permiso directo): ${groups.real_grant.length}`)
  console.log(`Omitidos (dominio / sin email): ${groups.skip_non_user.length}`)
  console.log(`Indeterminados: ${groups.indeterminate.length}`)
  console.log(`Errores: ${groups.error.length}`)

  console.log('\n=== FALSOS POSITIVOS ===')
  for (const row of groups.false_positive) {
    console.log(
      `- ${row.auditId} | ${row.createdAt ?? '?'} | ${row.granteeEmail} | ${row.targetName} | ${row.detail}`,
    )
  }

  console.log('\n=== GRANTS REALES ===')
  for (const row of groups.real_grant) {
    console.log(
      `- ${row.auditId} | ${row.createdAt ?? '?'} | ${row.granteeEmail} | ${row.targetName} | ${row.detail}`,
    )
  }

  if (groups.skip_non_user.length) {
    console.log('\n=== OMITIDOS ===')
    for (const row of groups.skip_non_user) {
      console.log(`- ${row.auditId} | ${row.detail}`)
    }
  }

  if (groups.indeterminate.length) {
    console.log('\n=== INDETERMINADOS (sin corrección) ===')
    for (const row of groups.indeterminate) {
      console.log(
        `- ${row.auditId} | ${row.granteeEmail ?? '?'} | ${row.targetName ?? '?'} | ${row.detail}`,
      )
    }
  }

  if (groups.error.length) {
    console.log('\n=== ERRORES ===')
    for (const row of groups.error) {
      console.log(`- ${row.auditId} | ${row.detail}`)
    }
  }

  console.log('\n=== TEXTO EXACTO audit_correction.reason ===')
  console.log(CORRECTION_REASON)
  console.log('\n=== TEXTO metadata (por entrada) ===')
  console.log(
    'correctsAuditLogId: <id original>, originalAction: permission_grant, verificationDetail: <detalle Drive>, correctionBatch: inherited-grant-audit-2026-09',
  )

  return groups
}

async function main() {
  const db = getAdminDb()
  const drive = await loadDrive()

  const snap = await db.collection('auditLogs').where('action', '==', 'permission_grant').get()
  const docs = [...snap.docs].sort((a, b) => {
    const ta = a.get('createdAt')?.toMillis?.() ?? 0
    const tb = b.get('createdAt')?.toMillis?.() ?? 0
    return ta - tb
  })

  console.log(`Modo: ${APPLY ? 'APPLY (escribir correcciones)' : 'DRY-RUN (solo informe)'}`)
  console.log(`Entradas permission_grant encontradas: ${docs.length}`)

  const results = []
  for (const doc of docs) {
    results.push(await verifyGrantAudit(drive, doc))
  }

  const groups = printReport(results)

  if (!APPLY) {
    console.log('\nDry-run completo. Para escribir correcciones: --apply')
    return
  }

  let written = 0
  let skippedExisting = 0
  for (const row of groups.false_positive) {
    const originalDoc = docs.find((doc) => doc.id === row.auditId)
    if (!originalDoc) continue
    if (await correctionExists(db, row.auditId)) {
      skippedExisting++
      continue
    }
    await writeCorrection(db, originalDoc, row)
    written++
  }

  console.log(`\nCorrecciones escritas: ${written}`)
  console.log(`Ya existían: ${skippedExisting}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
