/**
 * Importa una carpeta de exportación de Vientri (CSV de SIS5) a las colecciones vientri* de Bacarnet.
 * Solo escribe en colecciones propias de la integración: no toca cheques, agenda ni movimientos.
 *
 * Requiere el backend compilado (npm run build en esta carpeta).
 *
 * Emulador:
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:GCLOUD_PROJECT='bacar-web'
 *   node scripts/vientri-importar.mjs --carpeta "D:\inventario_vientri\exportaciones\vientri_20261016_1700"
 *   node scripts/vientri-importar.mjs --carpeta "..." --simular
 *
 * Producción (usa ADMIN_SDK_KEY_PATH de .env.local). Pedir OK antes:
 *   node scripts/vientri-importar.mjs --carpeta "..." --prod
 *
 * --simular  procesa y cuenta, sin escribir.
 * --forzar   saltea el freno de "trae muchos menos cheques que los que ya hay".
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getApps, initializeApp } from 'firebase-admin/app'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const esProd = args.includes('--prod')
const simular = args.includes('--simular')
const forzar = args.includes('--forzar')
const iCarpeta = args.indexOf('--carpeta')
const carpeta = iCarpeta >= 0 ? args[iCarpeta + 1] : undefined

if (!carpeta) {
  console.error('Falta --carpeta "<ruta a vientri_AAAAMMDD_HHMM>"')
  process.exit(1)
}
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

const lib = (p) => pathToFileURL(resolve(HERE, '../lib/modules/finanzas/vientri/services', p)).href
const { importarVientri } = await import(lib('importar-vientri.js'))
const { lectorCarpetaLocal } = await import(lib('leer-carpeta-local.js'))

const destino = esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`
console.log(`Destino: ${destino}`)
console.log(`Carpeta: ${carpeta}`)
console.log(simular ? 'Modo: simulación (no se escribe nada)' : 'Modo: escritura')

const inicio = Date.now()
const r = await importarVientri({
  leer: lectorCarpetaLocal(carpeta),
  carpeta,
  origen: 'script',
  actor: 'script:vientri-importar',
  simular,
  forzar,
})
console.log(r.ok ? 'OK' : 'NO SE IMPORTÓ')
console.log(r.mensaje)
if (r.fechaDatos) console.log(`Datos de Vientri al: ${r.fechaDatos}`)
if (r.resumen) console.log('Resumen:', JSON.stringify(r.resumen, null, 2))
if (r.conteos) console.log('Escrituras:', JSON.stringify(r.conteos, null, 2))
console.log(`Duración: ${Math.round((Date.now() - inicio) / 1000)} s`)
process.exit(r.ok ? 0 : 1)
