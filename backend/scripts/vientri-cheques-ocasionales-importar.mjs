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
 * Nunca borra: agrega los cheques nuevos y, en los que ya estaban, solo actualiza pagado/estado/baja.
 * Solo entran los que vencen desde la ventana (12 meses atrás por defecto); se cambia con --desde AAAA-MM-DD.
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
const iDesde = args.indexOf('--desde')
const desdeArg = iDesde >= 0 ? args[iDesde + 1] : undefined

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

const lib = (p) => pathToFileURL(resolve(HERE, '../lib/modules/finanzas/vientri', p)).href
const { importarChequesOcasionales } = await import(lib('services/importar-cheques-ocasionales.js'))
const { MESES_VENTANA, restarMeses } = await import(lib('domain/ventana.js'))

if (desdeArg !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(desdeArg)) {
  console.error('--desde tiene que ser una fecha AAAA-MM-DD')
  process.exit(1)
}
const hoyAr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
const desde = desdeArg ?? restarMeses(hoyAr, MESES_VENTANA)

const csv = readFileSync(archivo, 'utf-8')
const destino = esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`
console.log(`Destino: ${destino}`)
console.log(`Archivo: ${archivo}`)
console.log(`Ventana desde: ${desde}`)
console.log(simular ? 'Modo: simulación (no se escribe nada)' : 'Modo: escritura')

const inicio = Date.now()
const r = await importarChequesOcasionales({
  csv,
  origen: 'script',
  actor: 'script:cheques-ocasionales',
  simular,
  desde,
})

console.log(r.ok ? 'OK' : 'ERROR')
console.log(r.mensaje)
console.log('Resumen:', JSON.stringify(r.resumen, null, 2))
if (r.conteo) console.log('Escrituras:', JSON.stringify(r.conteo, null, 2))
if (r.proveedoresSinCargar?.length) {
  console.log(`Proveedores sin cargar en Proveedores financieros (${r.proveedoresSinCargar.length}):`)
  for (const n of r.proveedoresSinCargar) console.log(`  - ${n}`)
}
console.log(`Duración: ${Math.round((Date.now() - inicio) / 1000)} s`)
process.exit(r.ok ? 0 : 1)
