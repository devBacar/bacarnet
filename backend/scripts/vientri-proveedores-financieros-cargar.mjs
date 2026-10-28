/**
 * Carga única de los nombres del circuito financiero en la colección proveedoresFinancieros.
 * Idempotente: si el nombre normalizado ya existe, lo saltea. Nunca borra ni modifica documentos.
 *
 * Requiere el backend compilado (npm run build en backend/).
 *
 * Emulador:
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:GCLOUD_PROJECT='bacar-web'
 *   node scripts/vientri-proveedores-financieros-cargar.mjs --simular
 *   node scripts/vientri-proveedores-financieros-cargar.mjs
 *
 * Producción (usa ADMIN_SDK_KEY_PATH de .env.local). Pedir OK antes:
 *   node scripts/vientri-proveedores-financieros-cargar.mjs --prod --simular
 *   node scripts/vientri-proveedores-financieros-cargar.mjs --prod
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getApps, initializeApp } from 'firebase-admin/app'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const esProd = args.includes('--prod')
const simular = args.includes('--simular')

// Nombres del circuito financiero (cada variante/alias es una entrada propia).
// NO incluir GAITAN FACUNDO NICOLAS ni BARRERA IVAN ARIEL: son placeholders de comprobante, no beneficiarios.
const NOMBRES = [
  'MANA',
  'OP MANA',
  'BRACHE',
  'BRACHETA',
  'BRACHETTA',
  'POVO',
  'LIO',
  'LIONEL',
  'DAVALOS',
  'DAVALOS II',
  'P OLMOS',
  'OLMOS',
  'MARCELO P OLMOS',
  'CAVAZZA',
  'DURAN',
  'MAHUM DIEGO',
  'DIEGO MAHUM',
  'HNA CLAUDIA',
  'HERMANA CLAUDIA',
  'CONTA I',
  'CONTA II',
  'CONTA III',
  'CONTA IV',
  'JALIN',
  'JALIL',
  'GONZALEZ FABIAN',
  'CUÑADO S',
  'CARLOS REARTES',
  'FABREGA GABRIELA',
  'GABRIELA BANCOR',
  'GRUAS TRANSPORTE',
  'IB',
  'BARRERA IVAN',
  'JUNCOS',
  'CHITARRINI',
  'JUANEDA',
]

if (!esProd && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Sin FIRESTORE_EMULATOR_HOST. Para producción pasá --prod explícitamente.')
  process.exit(1)
}
if (esProd && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Hay FIRESTORE_EMULATOR_HOST definido: quitalo antes de correr contra producción.')
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

const lib = (p) => pathToFileURL(resolve(HERE, '../lib/modules/finanzas/agenda', p)).href
const repo = await import(lib('services/proveedores-financieros.repository.js'))
const { normalizarNombre } = await import(lib('domain/normalizar-nombre.js'))

const destino = esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`
console.log(`Destino: ${destino}`)
console.log(simular ? 'Modo: simulación (no se escribe nada)' : 'Modo: escritura')

const existentes = await repo.nombresNormalizadosProveedoresFinancieros()
const vistos = new Set()
let creados = 0
let yaExistian = 0

for (const nombre of NOMBRES) {
  const norm = normalizarNombre(nombre)
  if (vistos.has(norm)) continue
  vistos.add(norm)
  if (existentes.has(norm)) {
    yaExistian += 1
    console.log(`= ya existe: ${nombre}`)
    continue
  }
  if (!simular) await repo.crearProveedorFinancieroDoc(nombre, 'script:proveedores-financieros')
  creados += 1
  console.log(`+ ${simular ? 'crearía' : 'creado'}: ${nombre}`)
}

console.log(`Resumen: ${creados} ${simular ? 'a crear' : 'creados'}, ${yaExistian} ya existían, ${vistos.size} en total`)
process.exit(0)
