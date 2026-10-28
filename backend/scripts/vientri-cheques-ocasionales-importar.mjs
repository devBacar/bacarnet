/**
 * Importa un CSV de CHQOCA (cheques ocasionales) a la colección vientriChequesOcasionales.
 * Parsea el campo OBS para extraer renovaciones y operaciones en USD.
 *
 * Requiere el backend compilado (npm run build en backend/).
 *
 * Emulador:
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:GCLOUD_PROJECT='bacar-web'
 *   node scripts/vientri-cheques-ocasionales-importar.mjs --archivo "C:\ruta\CHQOCA.csv"
 *   node scripts/vientri-cheques-ocasionales-importar.mjs --archivo "..." --simular
 *
 * Producción (usa ADMIN_SDK_KEY_PATH de .env.local). Pedir OK antes:
 *   node scripts/vientri-cheques-ocasionales-importar.mjs --archivo "..." --prod
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getApps, initializeApp } from 'firebase-admin/app'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const esProd = args.includes('--prod')
const simular = args.includes('--simular')
const iArchivo = args.indexOf('--archivo')
const archivo = iArchivo >= 0 ? args[iArchivo + 1] : undefined

if (!archivo) {
  console.error('Falta --archivo "<ruta al CSV de CHQOCA>"')
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
const { importarChequesOcasionales } = await import(lib('importar-cheques-ocasionales.js'))

const csv = readFileSync(archivo, 'utf-8')
const destino = esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`
console.log(`Destino: ${destino}`)
console.log(`Archivo: ${archivo}`)
console.log(simular ? 'Modo: simulación (no se escribe nada)' : 'Modo: escritura')

const inicio = Date.now()
const r = await importarChequesOcasionales({
  csv,
  origen: 'script',
  actor: 'script:cheques-ocasionales',
  simular,
})

console.log(r.ok ? 'OK' : 'ERROR')
console.log(r.mensaje)
console.log('Resumen:', JSON.stringify(r.resumen, null, 2))
if (r.conteo) console.log('Escrituras:', JSON.stringify(r.conteo, null, 2))
console.log(`Duración: ${Math.round((Date.now() - inicio) / 1000)} s`)
process.exit(r.ok ? 0 : 1)
