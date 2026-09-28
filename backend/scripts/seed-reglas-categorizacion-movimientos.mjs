/**
 * Carga la semilla inicial de categorías y reglas de auto-categorización de
 * Movimientos (ver src/modules/finanzas/movimientos/domain/reglas-semilla.ts) y
 * categoriza retroactivamente los movimientos existentes que coincidan.
 *
 * Idempotente: se puede correr más de una vez.
 *
 * Requiere el backend compilado (npm run build en esta carpeta).
 *
 * Emulador:
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:GCLOUD_PROJECT='bacar-web'
 *   node scripts/seed-reglas-categorizacion-movimientos.mjs
 *
 * Producción (usa ADMIN_SDK_KEY_PATH de .env.local):
 *   node scripts/seed-reglas-categorizacion-movimientos.mjs --prod
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getApps, initializeApp } from 'firebase-admin/app'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const esProd = process.argv.includes('--prod')

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
  // Contra el emulador no hace falta credencial: alcanza con el projectId.
  loadTestEnv()
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT?.trim() || 'bacar-web' })
  }
}

const { sembrarReglasCategorizacion } = await import(
  pathToFileURL(resolve(HERE, '../lib/modules/finanzas/movimientos/services/reglas-categorizacion.service.js')).href
)

const actorUid = process.env.SEED_ACTOR_UID?.trim() || 'seed-reglas-categorizacion'
const resultado = await sembrarReglasCategorizacion({ actorUid })

console.log(`Destino: ${esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`}`)
console.log('\nCategorías:')
for (const c of resultado.categorias) {
  console.log(`  ${c.creada ? 'creada    ' : 'ya existía'}  ${c.nombre}  (${c.id})`)
}
console.log('\nReglas:')
let total = 0
for (const r of resultado.reglas) {
  total += r.movimientosActualizados
  console.log(
    `  ${r.creada ? 'creada    ' : 'ya existía'}  ${r.descripcionExacta.padEnd(28)} → ${r.categoria.padEnd(22)} movimientos: ${r.movimientosActualizados}`,
  )
}
console.log(`\nMovimientos categorizados en total: ${total}`)
