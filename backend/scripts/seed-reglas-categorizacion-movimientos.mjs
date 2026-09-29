/**
 * Carga la semilla de categorías (con grupo) y reglas de auto-categorización de
 * Movimientos (ver src/modules/finanzas/movimientos/domain/reglas-semilla.ts):
 * texto, código de Interbanking y CUIT. Después categoriza lo que quedó sin categoría.
 *
 * Idempotente: se puede correr más de una vez.
 * `--simular` arma el mismo reporte sin escribir.
 *
 * Requiere el backend compilado (npm run build en esta carpeta).
 *
 * Emulador:
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:GCLOUD_PROJECT='bacar-web'
 *   node scripts/seed-reglas-categorizacion-movimientos.mjs
 *   node scripts/seed-reglas-categorizacion-movimientos.mjs --simular
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
const resultado = await sembrarReglasCategorizacion({ actorUid, simular })

const destino = esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`
console.log(`Destino: ${destino}`)
console.log(simular ? 'Modo: simulación (no se escribe nada)' : 'Modo: escritura')

function listar(titulo, filas, linea) {
  console.log(`\n${titulo} (${filas.length}):`)
  if (filas.length === 0) {
    console.log('  (ninguna)')
    return
  }
  for (const fila of filas) console.log(`  ${linea(fila)}`)
}

listar('Categorías creadas', resultado.categoriasCreadas, (c) => `${c.nombre}  [${c.grupo}]  (${c.id})`)
listar(
  'Categorías actualizadas',
  resultado.categoriasActualizadas,
  (c) => `${c.nombre}  grupo → ${c.grupo}  (${c.id})`,
)
listar(
  'Reglas creadas',
  resultado.reglasCreadas,
  (r) => `[${r.tipo}]  ${r.valor}  →  ${r.categoria}`,
)
listar(
  'Reglas movidas',
  resultado.reglasMovidas,
  (r) => `[${r.tipo}]  ${r.valor}  ${r.desde}  →  ${r.hacia}`,
)
listar(
  'Reglas respetadas',
  resultado.reglasRespetadas,
  (r) => `[${r.tipo}]  ${r.valor}  se queda en ${r.categoriaActual}`,
)

console.log(`\nMovimientos movidos por migración de reglas: ${resultado.movimientosMigrados}`)
console.log(`Movimientos movidos por CUIT: ${resultado.movimientosPorCuit}`)
console.log(`Movimientos categorizados en el retroactivo: ${resultado.movimientosRetroactivos}`)
const porCategoria = Object.entries(resultado.porCategoriaRetroactivo)
if (porCategoria.length === 0) {
  console.log('  (ninguna categoría)')
} else {
  for (const [nombre, cantidad] of porCategoria) console.log(`  ${nombre}: ${cantidad}`)
}

listar('Categorías retiradas', resultado.categoriasRetiradas, (c) => `${c.nombre}  (${c.id})`)
listar('Categorías que se mantienen', resultado.categoriasMantenidas, (c) => `${c.nombre}: ${c.motivo}`)
