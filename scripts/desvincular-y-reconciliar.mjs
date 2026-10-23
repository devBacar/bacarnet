/**
 * Script para DevTools del navegador.
 * Desvincula cheques emitidos cuyo movimiento está fuera de la ventana -1/+5
 * y luego re-corre la reconciliación.
 *
 * Paso 1: pegar en la consola del navegador (con el backend corriendo)
 * Paso 2: ver el dry-run → si ok, descomentar el paso 2
 */

// ── Paso 1: Dry run ──
const token = await window.__getIdToken()
const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

console.log('🔍 Dry run: buscando cheques fuera de ventana...')
const dryRes = await fetch('/api/finanzas/cheques/desvincular-fuera-de-ventana?dryRun=1', { method: 'POST', headers: h })
const dryData = await dryRes.json()
console.log(`Evaluados: ${dryData.evaluados}`)
console.log(`A desvincular: ${dryData.desvinculados.length}`)
console.table(dryData.desvinculados)

// ── Paso 2: Ejecutar (descomentar cuando estés seguro) ──
// const res = await fetch('/api/finanzas/cheques/desvincular-fuera-de-ventana', { method: 'POST', headers: h })
// const data = await res.json()
// console.log('Desvinculados:', data.desvinculados.length)
// console.table(data.desvinculados)

// ── Paso 3: Re-reconciliar (descomentar después del paso 2) ──
// const recRes = await fetch('/api/finanzas/cheques/reconciliar?detalle=1', { method: 'POST', headers: h })
// const recData = await recRes.json()
// console.log('Reconciliación:', recData)
