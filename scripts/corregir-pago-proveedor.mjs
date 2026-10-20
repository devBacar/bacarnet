/**
 * Script para DevTools del navegador.
 * Corrige cheques emitidos con estadoBancario "pago a proveedor" o "diferido"
 * que quedaron como debitado sin tener movimiento bancario.
 */

// ── Paso 1: Dry run ──
const token = await window.__getIdToken()
const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

console.log('🔍 Dry run: buscando cheques pago-a-proveedor/diferido marcados como debitado sin movimiento...')
const dryRes = await fetch('/api/finanzas/cheques/corregir-pago-proveedor?dryRun=1', { method: 'POST', headers: h })
const dryData = await dryRes.json()
console.log(`Evaluados (emitidos debitados): ${dryData.evaluados}`)
console.log(`A corregir: ${dryData.corregidos.length}`)
console.table(dryData.corregidos)

// ── Paso 2: Ejecutar (descomentar cuando estés seguro) ──
// const res = await fetch('/api/finanzas/cheques/corregir-pago-proveedor', { method: 'POST', headers: h })
// const data = await res.json()
// console.log('Corregidos:', data.corregidos.length)
// console.table(data.corregidos)

// ── Paso 3: Re-reconciliar (descomentar después del paso 2) ──
// const recRes = await fetch('/api/finanzas/cheques/reconciliar?detalle=1', { method: 'POST', headers: h })
// const recData = await recRes.json()
// console.log('Reconciliación:', recData)
