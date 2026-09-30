/**
 * Completa contraparteNombre / contraparteCuit / contraparteOrigen en movimientosBancarios.
 *
 * Idempotente: se puede correr más de una vez.
 * `--simular` arma el mismo reporte sin escribir.
 *
 * Requiere el backend compilado (npm run build en esta carpeta).
 *
 * Emulador:
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:GCLOUD_PROJECT='bacar-web'
 *   node scripts/completar-contrapartes.mjs
 *   node scripts/completar-contrapartes.mjs --simular
 *
 * Producción (usa ADMIN_SDK_KEY_PATH de .env.local):
 *   node scripts/completar-contrapartes.mjs --prod
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getApps, initializeApp } from 'firebase-admin/app'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const esProd = process.argv.includes('--prod')
const simular = process.argv.includes('--simular')

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

const { enriquecerContrapartes } = await import(
  pathToFileURL(resolve(HERE, '../lib/modules/finanzas/contraparte/services/enriquecer-contrapartes.js')).href
)

const resultado = await enriquecerContrapartes({ simular })
const destino = esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`
console.log(`Destino: ${destino}`)
console.log(simular ? 'Modo: simulación (no se escribe nada)' : 'Modo: escritura')
console.log(`Movimientos revisados: ${resultado.revisados}`)
console.log(`Movimientos actualizados: ${resultado.actualizados}`)
console.log(`Sin contraparte: ${resultado.sinContraparte}`)
console.log(`Fichas de directorio: ${resultado.directorioActualizados}`)
const porOrigen = Object.entries(resultado.porOrigen)
if (porOrigen.length === 0) {
  console.log('Por origen: (ninguno)')
} else {
  for (const [origen, cantidad] of porOrigen) console.log(`  ${origen}: ${cantidad}`)
}
