/**
 * Da de baja (lógica) las copias viejas de cheques ocasionales que quedaron guardadas dos veces.
 *
 * Una copia vieja es un doc de vientriChequesOcasionales con el número de cheque como id (sin prefijo `oca-`)
 * y sin estado, que repite el número de otro doc activo con estado (el `oca-<vientri_id>` de la importación
 * normal). Solo se da de baja si ambos coinciden en importe, emisión, vencimiento y beneficiario; si algún par
 * difiere, o hay más de una copia buena, no se toca y se informa.
 *
 * Por defecto SOLO SIMULA. Nunca borra: marca `baja: true` y `bajaMotivo`. Para revertir, `baja: false`.
 *
 * No necesita el backend compilado: solo firebase-admin.
 *
 * Emulador:
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:GCLOUD_PROJECT='bacar-web'
 *   node scripts/vientri-cheques-ocasionales-duplicados-baja.mjs
 *   node scripts/vientri-cheques-ocasionales-duplicados-baja.mjs --aplicar
 *
 * Producción (usa ADMIN_SDK_KEY_PATH de .env.local). Pedir OK antes de --aplicar:
 *   node scripts/vientri-cheques-ocasionales-duplicados-baja.mjs --prod
 *   node scripts/vientri-cheques-ocasionales-duplicados-baja.mjs --prod --aplicar
 *
 * Después de aplicar, reconstruir los "completos" y el seguimiento:
 *   POST /api/finanzas/cheques-ocasionales/completos/recalcular
 *   POST /api/finanzas/cheques-ocasionales/seguimiento/recalcular
 */

import { getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const args = process.argv.slice(2)
const esProd = args.includes('--prod')
const aplicar = args.includes('--aplicar')
const COLECCION = 'vientriChequesOcasionales'
const MOTIVO = 'duplicado-legacy-sin-estado'

if (!esProd && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Sin FIRESTORE_EMULATOR_HOST. Para producción pasá --prod explícitamente.')
  process.exit(1)
}
if (esProd && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Hay FIRESTORE_EMULATOR_HOST definido: quitálo antes de correr contra producción.')
  process.exit(1)
}

if (esProd) {
  initAdmin()
} else {
  loadTestEnv()
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT?.trim() || 'bacar-web' })
  }
}

const db = getFirestore()
console.log(`Destino: ${esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`}`)
console.log(aplicar ? 'Modo: escritura (baja lógica)' : 'Modo: simulación (no se escribe nada)')

const snap = await db.collection(COLECCION).get()
const docs = snap.docs.map((s) => ({ id: s.id, ...s.data() })).filter((d) => !d.baja)

const porNumero = new Map()
for (const d of docs) {
  if (!porNumero.has(d.numeroCheque)) porNumero.set(d.numeroCheque, [])
  porNumero.get(d.numeroCheque).push(d)
}

const mismoCheque = (a, b) =>
  a.montoCentavos === b.montoCentavos
  && a.fechaEmision === b.fechaEmision
  && a.fechaVencimiento === b.fechaVencimiento
  && a.beneficiarioNormalizado === b.beneficiarioNormalizado

const aBaja = []
const sinResolver = []
let repetidos = 0
for (const [numero, grupo] of porNumero) {
  if (grupo.length < 2) continue
  repetidos++
  const viejas = grupo.filter((d) => d.estadoCodigo == null && !d.id.startsWith('oca-'))
  const buenas = grupo.filter((d) => d.estadoCodigo != null)
  if (viejas.length === 0 || buenas.length !== 1 || !viejas.every((v) => mismoCheque(v, buenas[0]))) {
    sinResolver.push({ numero, docs: grupo.map((d) => ({ id: d.id, estadoCodigo: d.estadoCodigo ?? null })) })
    continue
  }
  aBaja.push(...viejas)
}

const porBenef = {}
for (const d of aBaja) porBenef[d.beneficiario] = (porBenef[d.beneficiario] ?? 0) + 1
console.log(`Documentos activos: ${docs.length} | números repetidos: ${repetidos}`)
console.log(`A dar de baja: ${aBaja.length}`)
console.log('Por beneficiario:', JSON.stringify(porBenef))
console.log(`Sin resolver (no se tocan): ${sinResolver.length}`)
for (const s of sinResolver.slice(0, 20)) console.log(`  ${s.numero} ${JSON.stringify(s.docs)}`)

if (!aplicar) {
  console.log('SIMULACIÓN: no se escribió nada. Agregá --aplicar para dar de baja.')
  process.exit(0)
}

for (let i = 0; i < aBaja.length; i += 400) {
  const batch = db.batch()
  for (const d of aBaja.slice(i, i + 400)) {
    batch.set(
      db.collection(COLECCION).doc(d.id),
      { baja: true, bajaMotivo: MOTIVO, bajaAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
  }
  await batch.commit()
}
console.log(`Baja aplicada a ${aBaja.length} documentos.`)
process.exit(0)
