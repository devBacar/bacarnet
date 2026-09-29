import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../lib/firebase/admin.js'
import type {
  CuentaDocument,
  OrigenSaldo,
  PosicionCierreDocument,
} from '../domain/cuenta.types.js'
import { MANUAL_USD_CUENTA_DEFS } from '../domain/manual-usd.defaults.js'

const CUENTAS_COLLECTION = 'cuentas'
const SNAPSHOTS_SUB = 'saldosSnapshots'
const POSICION_CIERRES_COLLECTION = 'finanzasPosicionCierres'

export function cuentasCollection() {
  return adminDb().collection(CUENTAS_COLLECTION)
}

export async function listCuentaDocuments(): Promise<
  Array<{ id: string; data: CuentaDocument }>
> {
  const snap = await cuentasCollection().get()
  return snap.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() as CuentaDocument,
    }))
    .filter(({ data }) => (data.tipo as string) !== 'CA')
}

export async function getCuentaDocument(
  cuentaId: string,
): Promise<{ id: string; data: CuentaDocument } | null> {
  const snap = await cuentasCollection().doc(cuentaId).get()
  if (!snap.exists) return null
  const data = snap.data() as CuentaDocument
  if ((data.tipo as string) === 'CA') return null
  return { id: snap.id, data }
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
        origenSaldo: 'interbanking' satisfies OrigenSaldo,
        saldoActualizadoManualmenteEl: null,
        saldoActualizadoManualmentePor: null,
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

export async function ensureManualUsdAccounts(actorUid: string): Promise<void> {
  const now = FieldValue.serverTimestamp()

  for (const def of MANUAL_USD_CUENTA_DEFS) {
    const ref = cuentasCollection().doc(def.cuentaId)
    await adminDb().runTransaction(async (tx) => {
      const existing = await tx.get(ref)
      if (existing.exists) {
        const origen = existing.get('origenSaldo') as OrigenSaldo | undefined
        if (origen === 'interbanking') return
        if (origen === 'manual') return
        tx.set(
          ref,
          {
            origenSaldo: 'manual',
            updatedAt: now,
          },
          { merge: true },
        )
        return
      }

      tx.set(ref, {
        bancoNombre: def.bancoNombre,
        bancoCodigoInterbanking: def.bancoCodigoInterbanking,
        tipo: 'USD',
        moneda: 'USD',
        origenSaldo: 'manual',
        saldoActualCentavos: 0,
        descubiertoCentavos: null,
        descubiertoVigenteDesde: null,
        saldoActualizadoManualmenteEl: null,
        saldoActualizadoManualmentePor: null,
        createdAt: now,
        updatedAt: now,
        createdBy: actorUid,
      })
    })
  }
}

export async function deleteLegacyCaCuentas(): Promise<number> {
  const snap = await cuentasCollection().get()
  const batch = adminDb().batch()
  let count = 0
  for (const doc of snap.docs) {
    const tipo = doc.get('tipo')
    if (tipo === 'CA') {
      batch.delete(doc.ref)
      count += 1
    }
  }
  if (count > 0) await batch.commit()
  return count
}

/** Deja USD manuales en 0 sin auditoría (estado «nunca cargadas»). */
export async function resetManualUsdAccountsNeverLoaded(): Promise<void> {
  for (const def of MANUAL_USD_CUENTA_DEFS) {
    const ref = cuentasCollection().doc(def.cuentaId)
    await ref.update({
      saldoActualCentavos: 0,
      origenSaldo: 'manual',
      saldoActualizadoManualmenteEl: FieldValue.delete(),
      saldoActualizadoManualmentePor: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
}

export async function updateManualSaldo(input: {
  cuentaId: string
  saldoActualCentavos: number
  actorUid: string
  actorEmail: string
}): Promise<void> {
  const ref = cuentasCollection().doc(input.cuentaId)
  const now = FieldValue.serverTimestamp()
  const manualAt = Timestamp.now()

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Cuenta no encontrada')
    const data = snap.data() as CuentaDocument
    if ((data.tipo as string) === 'CA') throw new Error('Cuenta no válida')
    if (data.origenSaldo === 'interbanking') {
      throw new Error('Esta cuenta se actualiza por Interbanking; no admite saldo manual')
    }
    const origen: OrigenSaldo = data.origenSaldo ?? (data.tipo === 'USD' ? 'manual' : 'interbanking')
    if (origen !== 'manual') {
      throw new Error('Solo las cuentas con saldo manual pueden editarse acá')
    }

    tx.set(
      ref,
      {
        saldoActualCentavos: input.saldoActualCentavos,
        saldoActualizadoManualmenteEl: manualAt,
        saldoActualizadoManualmentePor: input.actorEmail,
        origenSaldo: 'manual',
        updatedAt: now,
      },
      { merge: true },
    )
  })
}

export async function savePosicionCierreDocument(input: {
  fechaId: string
  data: Omit<PosicionCierreDocument, 'createdAt' | 'updatedAt' | 'createdBy'>
  actorUid: string
}): Promise<void> {
  const ref = adminDb().collection(POSICION_CIERRES_COLLECTION).doc(input.fechaId)
  const now = FieldValue.serverTimestamp()
  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    tx.set(ref, {
      ...input.data,
      createdAt: existing.exists ? existing.get('createdAt') : now,
      createdBy: existing.exists ? existing.get('createdBy') : input.actorUid,
      updatedAt: now,
    })
  })
}

export async function getPosicionCierreDocument(
  fechaId: string,
): Promise<{ id: string; data: PosicionCierreDocument } | null> {
  const snap = await adminDb().collection(POSICION_CIERRES_COLLECTION).doc(fechaId).get()
  if (!snap.exists) return null
  return { id: snap.id, data: snap.data() as PosicionCierreDocument }
}

/** Último cierre estrictamente anterior a `fechaId` (el viernes, si el día previo es fin de semana). */
export async function getPosicionCierreAnterior(
  fechaId: string,
): Promise<{ id: string; data: PosicionCierreDocument } | null> {
  const snap = await adminDb()
    .collection(POSICION_CIERRES_COLLECTION)
    .where('fechaId', '<', fechaId)
    .orderBy('fechaId', 'desc')
    .limit(1)
    .get()
  const doc = snap.docs[0]
  if (!doc) return null
  return { id: doc.id, data: doc.data() as PosicionCierreDocument }
}

export async function listPosicionCierreDocuments(
  limit = 31,
): Promise<Array<{ id: string; data: PosicionCierreDocument }>> {
  const snap = await adminDb()
    .collection(POSICION_CIERRES_COLLECTION)
    .orderBy('fechaId', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as PosicionCierreDocument,
  }))
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
