import { FieldValue, type DocumentReference } from 'firebase-admin/firestore'
import { adminDb } from '../../../lib/firebase/admin.js'
import type { SaldosDiariosCuentaDTO } from '../adapters/bank-provider.types.js'
import type { BancoNombre, Moneda } from '../domain/cuenta.types.js'

const SALDOS_DIARIOS_COLLECTION = 'finanzasSaldosDiarios'
const LOTE = 400

export type EstadoSaldoDiario = 'cerrado' | 'en_curso'

export interface SaldoDiarioLeido {
  cuentaId: string
  bancoNombre: string
  moneda: Moneda
  fecha: string
  estado: EstadoSaldoDiario
  saldoInicioCentavos: number | null
  saldoFinCentavos: number
  debitosCentavos: number | null
  creditosCentavos: number | null
}

interface SaldoDiarioWrite {
  cuentaId: string
  bancoNombre: BancoNombre
  moneda: Moneda
  fecha: string
  estado: EstadoSaldoDiario
  saldoInicioCentavos: number | null
  saldoFinCentavos: number
  debitosCentavos: number | null
  creditosCentavos: number | null
}

export function saldoDiarioDocId(cuentaId: string, fecha: string): string {
  return `${cuentaId}_${fecha}`
}

export function sumarDiasFechaId(fechaId: string, dias: number): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + dias))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function saldosCollection() {
  return adminDb().collection(SALDOS_DIARIOS_COLLECTION)
}

function fechasInclusivas(desde: string, hasta: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    return []
  }
  const fechas: string[] = []
  let cursor = desde
  while (cursor <= hasta && fechas.length < 61) {
    fechas.push(cursor)
    cursor = sumarDiasFechaId(cursor, 1)
  }
  return fechas
}

function writesDesdeProvider(cuentas: SaldosDiariosCuentaDTO[], hoy: string): SaldoDiarioWrite[] {
  const writes: SaldoDiarioWrite[] = []
  for (const cuenta of cuentas) {
    for (const dia of cuenta.dias) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia.fecha)) continue
      writes.push({
        cuentaId: cuenta.cuentaId,
        bancoNombre: cuenta.bancoNombre,
        moneda: cuenta.moneda,
        fecha: dia.fecha,
        estado: 'cerrado',
        saldoInicioCentavos: null,
        saldoFinCentavos: dia.saldoFinCentavos,
        debitosCentavos: dia.debitosCentavos,
        creditosCentavos: dia.creditosCentavos,
      })
    }
    if (cuenta.hoy && /^\d{4}-\d{2}-\d{2}$/.test(hoy)) {
      writes.push({
        cuentaId: cuenta.cuentaId,
        bancoNombre: cuenta.bancoNombre,
        moneda: cuenta.moneda,
        fecha: hoy,
        estado: 'en_curso',
        saldoInicioCentavos: cuenta.hoy.saldoInicioCentavos,
        saldoFinCentavos: cuenta.hoy.saldoActualCentavos,
        debitosCentavos: null,
        creditosCentavos: null,
      })
    }
  }
  return writes
}

async function leerRefs(refs: DocumentReference[]) {
  const snaps = []
  for (let offset = 0; offset < refs.length; offset += LOTE) {
    const parte = refs.slice(offset, offset + LOTE)
    snaps.push(...(await adminDb().getAll(...parte)))
  }
  return snaps
}

/**
 * Un día cerrado pisa al en curso del mismo día.
 * El en curso no vuelve a pisar un día que ya cerró.
 */
export async function guardarSaldosDiarios(
  cuentas: SaldosDiariosCuentaDTO[],
  hoy: string,
): Promise<number> {
  const byId = new Map<string, SaldoDiarioWrite>()
  for (const write of writesDesdeProvider(cuentas, hoy)) {
    const id = saldoDiarioDocId(write.cuentaId, write.fecha)
    const previo = byId.get(id)
    if (previo?.estado === 'cerrado' && write.estado === 'en_curso') continue
    byId.set(id, write)
  }
  const entries = [...byId.entries()]
  if (entries.length === 0) return 0

  const snaps = await leerRefs(entries.map(([id]) => saldosCollection().doc(id)))
  let guardados = 0

  for (let offset = 0; offset < entries.length; offset += LOTE) {
    const batch = adminDb().batch()
    let enBatch = 0
    const fin = Math.min(offset + LOTE, entries.length)
    for (let index = offset; index < fin; index++) {
      const [id, write] = entries[index]
      const snap = snaps[index]
      const estadoPrevio = snap?.exists ? snap.get('estado') : null
      if (estadoPrevio === 'cerrado' && write.estado === 'en_curso') continue
      batch.set(saldosCollection().doc(id), {
        cuentaId: write.cuentaId,
        bancoNombre: write.bancoNombre,
        moneda: write.moneda,
        fecha: write.fecha,
        estado: write.estado,
        saldoInicioCentavos: write.saldoInicioCentavos,
        saldoFinCentavos: write.saldoFinCentavos,
        debitosCentavos: write.debitosCentavos,
        creditosCentavos: write.creditosCentavos,
        actualizadoAt: FieldValue.serverTimestamp(),
      })
      enBatch += 1
    }
    if (enBatch > 0) {
      await batch.commit()
      guardados += enBatch
    }
  }

  return guardados
}

export async function listSaldosDiariosDeCuentas(input: {
  cuentaIds: string[]
  desde: string
  hasta: string
}): Promise<SaldoDiarioLeido[]> {
  const fechas = fechasInclusivas(input.desde, input.hasta)
  const refs: DocumentReference[] = []
  for (const cuentaId of input.cuentaIds) {
    for (const fecha of fechas) {
      refs.push(saldosCollection().doc(saldoDiarioDocId(cuentaId, fecha)))
    }
  }
  if (refs.length === 0) return []

  const snaps = await leerRefs(refs)
  const rows: SaldoDiarioLeido[] = []
  for (const snap of snaps) {
    if (!snap.exists) continue
    const data = snap.data() ?? {}
    if (data.estado !== 'cerrado' && data.estado !== 'en_curso') continue
    if (typeof data.saldoFinCentavos !== 'number') continue
    if (typeof data.cuentaId !== 'string' || typeof data.fecha !== 'string') continue
    rows.push({
      cuentaId: data.cuentaId,
      bancoNombre: typeof data.bancoNombre === 'string' ? data.bancoNombre : '',
      moneda: data.moneda === 'USD' ? 'USD' : 'ARS',
      fecha: data.fecha,
      estado: data.estado,
      saldoInicioCentavos: typeof data.saldoInicioCentavos === 'number' ? data.saldoInicioCentavos : null,
      saldoFinCentavos: data.saldoFinCentavos,
      debitosCentavos: typeof data.debitosCentavos === 'number' ? data.debitosCentavos : null,
      creditosCentavos: typeof data.creditosCentavos === 'number' ? data.creditosCentavos : null,
    })
  }
  return rows
}
