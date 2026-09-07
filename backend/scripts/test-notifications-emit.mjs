/**
 * Verifica planificación/emisión de tipos 6/7 (y 3) sin depender de multi-jefe en prod.
 *
 *   node backend/scripts/test-notifications-emit.mjs
 */

import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const { planNotificationsFromAudit } = await import('../lib/modules/notifications/emitFromAudit.js')

function docId(dedupeKey) {
  return createHash('sha256').update(dedupeKey).digest('hex').slice(0, 40)
}

async function writePlans(plans) {
  for (const plan of plans) {
    const id = docId(plan.dedupeKey)
    await getAdminDb()
      .collection('users')
      .doc(plan.recipientUid)
      .collection('notifications')
      .doc(id)
      .set({
        type: plan.type,
        category: plan.category,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        actor: plan.actor,
        title: plan.title,
        body: plan.body,
        deepLink: plan.deepLink,
        context: plan.context,
        dedupeKey: plan.dedupeKey,
        testHarness: true,
      })
  }
}

async function main() {
  const recipientUid = process.argv[2]?.trim()
  if (!recipientUid) {
    console.error('Uso: node backend/scripts/test-notifications-emit.mjs <recipientUid>')
    process.exit(1)
  }

  const actorUid = 'test-actor-uid'
  const areaId = process.env.TARGET_AREA_ID?.trim() || 'r7QVKsrSiqDWC8DrXCac'

  const classificationPlans = await planNotificationsFromAudit({
    userId: actorUid,
    userEmail: 'actor@test.local',
    action: 'classification_change',
    targetType: 'file',
    targetId: 'test-file-id',
    targetName: 'Doc prueba emit',
    parentFolderId: 'test-parent',
    mimeType: 'application/vnd.google-apps.document',
    reason: 'test',
    metadata: { governingAreaId: areaId, classification: 'CONFIDENCIAL' },
  })

  const deletePlans = await planNotificationsFromAudit({
    userId: actorUid,
    userEmail: 'actor@test.local',
    action: 'delete',
    targetType: 'file',
    targetId: 'test-file-id-2',
    targetName: 'Doc eliminado prueba',
    parentFolderId: 'test-parent',
    mimeType: 'application/vnd.google-apps.document',
    reason: 'test',
    metadata: { governingAreaId: areaId },
  })

  const copyPlans = await planNotificationsFromAudit({
    userId: actorUid,
    userEmail: 'actor@test.local',
    action: 'authorized_copy',
    targetType: 'file',
    targetId: 'test-file-id-3',
    targetName: 'Doc origen copia',
    parentFolderId: 'test-parent',
    mimeType: 'application/vnd.google-apps.document',
    reason: 'test',
    metadata: { governingAreaId: areaId },
  })

  const targetPlans = [
    ...classificationPlans.filter((p) => p.recipientUid === recipientUid),
    ...deletePlans.filter((p) => p.recipientUid === recipientUid),
    ...copyPlans.filter((p) => p.recipientUid === recipientUid),
  ]

  if (targetPlans.length === 0) {
    console.error(
      `Ningún plan para uid=${recipientUid}. ¿Es jefe del área ${areaId}?`,
    )
    process.exit(1)
  }

  await writePlans(targetPlans)
  console.log(`Escritas ${targetPlans.length} notificaciones de harness para ${recipientUid}`)
  for (const plan of targetPlans) {
    console.log(` - ${plan.type}: ${plan.title}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
