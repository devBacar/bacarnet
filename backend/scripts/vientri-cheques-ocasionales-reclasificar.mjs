/**
 * Recalcula la clasificación de los cheques ocasionales que YA están guardados en
 * `vientriChequesOcasionales`, con las reglas nuevas, usando solo lo que ya tienen (no hace falta el CSV):
 *   - todos son proveedor financiero (esProveedorFinanciero / tipoProveedor)
 *   - proveedorFinancieroId se engancha por nombre contra la colección `proveedoresFinancieros`
 *   - `revisar` suma "Proveedor no cargado..." y "Sin datos de operación financiera..." donde corresponda
 *
 * Por defecto SIMULA: no escribe nada, muestra cuántos cambian y la lista de proveedores sin cargar.
 * Con --aplicar escribe (solo esos cuatro campos; no toca montos, estados ni vínculos bancarios).
 *
 * Requiere el backend compilado (npm run build en backend/).
 *
 * Emulador:
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:GCLOUD_PROJECT='bacar-web'
 *   node scripts/vientri-cheques-ocasionales-reclasificar.mjs
 *   node scripts/vientri-cheques-ocasionales-reclasificar.mjs --aplicar
 *
 * Producción (usa ADMIN_SDK_KEY_PATH de .env.local). Simular primero y pedir OK antes de --aplicar:
 *   node scripts/vientri-cheques-ocasionales-reclasificar.mjs --prod
 *   node scripts/vientri-cheques-ocasionales-reclasificar.mjs --prod --aplicar
 *
 * Después de aplicar, reconstruir los "completos" (POST /api/finanzas/cheques-ocasionales/completos/recalcular)
 * o esperar a la próxima importación, porque copian estos campos.
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const esProd = args.includes('--prod')
const aplicar = args.includes('--aplicar')

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

const lib = (p) => pathToFileURL(resolve(HERE, '../lib', p)).href
const { adminDb } = await import(lib('lib/firebase/admin.js'))
const { mapaProveedoresFinancieros } = await import(lib('modules/finanzas/agenda/services/proveedores-financieros.repository.js'))
const { reclasificarDoc, REVISAR_PROVEEDOR_NO_CARGADO, REVISAR_SIN_DATOS_FINANCIEROS } = await import(
  lib('modules/finanzas/vientri/domain/clasificar-ocasional.js')
)

const COLECCION = 'vientriChequesOcasionales'
const destino = esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`
console.log(`Destino: ${destino}`)
console.log(aplicar ? 'Modo: ESCRITURA' : 'Modo: simulación (no se escribe nada)')

const proveedores = await mapaProveedoresFinancieros()
const snap = await adminDb().collection(COLECCION).get()

const cambios = []
const sinCargar = new Map()
let eraNoFinanciero = 0
let conAvisoProveedor = 0
let conAvisoSinDatos = 0

for (const s of snap.docs) {
  const antes = s.data()
  if (antes.baja === true) continue
  const despues = reclasificarDoc(antes, proveedores)
  if (antes.esProveedorFinanciero !== true) eraNoFinanciero++
  if (despues.revisar.includes(REVISAR_PROVEEDOR_NO_CARGADO)) {
    conAvisoProveedor++
    if (!sinCargar.has(despues.beneficiarioNormalizado)) sinCargar.set(despues.beneficiarioNormalizado, despues.beneficiario)
  }
  if (despues.revisar.includes(REVISAR_SIN_DATOS_FINANCIEROS)) conAvisoSinDatos++

  const distinto =
    antes.esProveedorFinanciero !== despues.esProveedorFinanciero
    || (antes.tipoProveedor ?? null) !== despues.tipoProveedor
    || (antes.proveedorFinancieroId ?? null) !== despues.proveedorFinancieroId
    || JSON.stringify(antes.revisar ?? []) !== JSON.stringify(despues.revisar)
  if (distinto) {
    cambios.push({
      id: s.id,
      datos: {
        esProveedorFinanciero: despues.esProveedorFinanciero,
        tipoProveedor: despues.tipoProveedor,
        proveedorFinancieroId: despues.proveedorFinancieroId,
        revisar: despues.revisar,
      },
    })
  }
}

console.log(`Cheques leídos: ${snap.size} (los dados de baja se saltean)`)
console.log(`Proveedores cargados en la colección: ${proveedores.size}`)
console.log(`Cheques que hoy NO figuran como financieros y pasarían a serlo: ${eraNoFinanciero}`)
console.log(`Con aviso "proveedor no cargado": ${conAvisoProveedor}`)
console.log(`Con aviso "sin datos de operación financiera": ${conAvisoSinDatos}`)
console.log(`Docs que cambian: ${cambios.length}`)
console.log(`\nProveedores sin cargar (${sinCargar.size}):`)
for (const nombre of [...sinCargar.values()].sort()) console.log(`  - ${nombre}`)

if (!aplicar) {
  console.log('\nSimulación terminada: no se escribió nada. Para aplicar, volvé a correr con --aplicar.')
  process.exit(0)
}

for (let i = 0; i < cambios.length; i += 400) {
  const batch = adminDb().batch()
  for (const c of cambios.slice(i, i + 400)) {
    batch.set(
      adminDb().collection(COLECCION).doc(c.id),
      { ...c.datos, actualizadoAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
  }
  await batch.commit()
}
console.log(`\nListo: ${cambios.length} docs actualizados.`)
console.log('Falta reconstruir los completos (POST /completos/recalcular) o esperar la próxima importación.')
process.exit(0)
