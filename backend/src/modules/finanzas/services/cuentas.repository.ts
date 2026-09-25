import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../lib/firebase/admin.js'
import type { CuentaDocument } from '../domain/cuenta.types.js'

const CUENTAS_COLLECTION = 'cuentas'
const SNAPSHOTS_SUB = 'saldosSnapshots'

export function cuentasCollection() {
  return adminDb().collection(CUENTAS_COLLECTION)
}

export async function listCuentaDocuments(): Promise<
  Array<{ id: string; data: CuentaDocument }>
> {
  const snap = await cuentasCollection().get()
  return snap.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as CuentaDocument,
  }))
}

export async function getCuentaDocument(
  cuentaId: string,
): Promise<{ id: string; data: CuentaDocument } | null> {
  const snap = await cuentasCollection().doc(cuentaId).get()
  if (!snap.exists) return null
  return { id: snap.id, data: snap.data() as CuentaDocument }
}

export async function upsertCuentaFromSync(input: {
  cuentaId: string
  payload: Omit<CuentaDocument, 'createdAt' | 'updatedAt'>
  snapshotDateId: string
  saldoCierreCentavos: number
  actorUid: string
}): Promise<void> {
  const ref = cuentasCollection().doc(input.cuentaId)
  const snapRef = ref.collection(SNAPSHOTS_SUB).doc(input.snapshotDateId)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const [existing, snapExisting] = await Promise.all([tx.get(ref), tx.get(snapRef)])

    const baseAudit = existing.exists
      ? { createdAt: existing.get('createdAt'), createdBy: existing.get('createdBy') }
      : { createdAt: now, createdBy: input.actorUid }

    const snapAudit = snapExisting.exists
      ? { createdAt: snapExisting.get('createdAt'), createdBy: snapExisting.get('createdBy') }
      : { createdAt: now, createdBy: input.actorUid }

    tx.set(
      ref,
      {
        ...input.payload,
        ...baseAudit,
        updatedAt: now,
      },
      { merge: true },
    )

    tx.set(snapRef, {
      saldoCierreCentavos: input.saldoCierreCentavos,
      ...snapAudit,
      updatedAt: now,
    })
  })
}

export function dateIdInArgentina(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${d}`
}

export function toTimestampOrNull(value: Date | null): Timestamp | null {
  if (!value) return null
  return Timestamp.fromDate(value)
}
