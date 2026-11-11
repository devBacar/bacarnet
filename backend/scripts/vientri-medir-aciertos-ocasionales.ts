/**
 * Medición (SOLO LECTURA) de cuánto acierta lo que hoy se calcula solo en cheques ocasionales, comparado con
 * lo que escribió una persona. No escribe nada en Firestore. Ver `domain/medir-aciertos.ts`.
 *
 *  1. Marcas a mano de Finanzas: ¿el sistema ya proponía lo mismo antes de que lo marcaran?
 *  2. Renovaciones con los cheques viejos escritos en el OBS: escondiendo esos números, ¿el vínculo automático
 *     llega a los mismos cheques?
 *
 * No hace falta compilar el backend (se corre con vite-node, desde la raíz del repo).
 *
 * Emulador:
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:GCLOUD_PROJECT='bacar-web'
 *   npx vite-node backend/scripts/vientri-medir-aciertos-ocasionales.ts
 *   npx vite-node backend/scripts/vientri-medir-aciertos-ocasionales.ts -- --desde 2025-10-01 --json salida.json
 *
 * Producción (usa ADMIN_SDK_KEY_PATH de .env.local; solo lee). Pedir OK antes:
 *   npx vite-node backend/scripts/vientri-medir-aciertos-ocasionales.ts -- --prod
 *
 * El --json trae datos reales: guardarlo fuera del repo.
 */

import { writeFileSync } from 'node:fs'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
// @ts-expect-error helper en .mjs sin tipos
import { getAdminDb, loadTestEnv } from './get-test-token.mjs'
import type { ChequeOcasionalDoc } from '../src/modules/finanzas/vientri/domain/cheque-ocasional.types.js'
import {
  medirMarcasManuales,
  medirVinculoAutomatico,
  type Conteo,
} from '../src/modules/finanzas/vientri/domain/medir-aciertos.js'
import { normalizarDocOcasional } from '../src/modules/finanzas/vientri/domain/normalizar-doc-ocasional.js'

const args = process.argv.slice(2)
const valor = (flag: string): string | undefined => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const esProd = args.includes('--prod')
const desde = valor('--desde')
const salidaJson = valor('--json')

if (!esProd && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Sin FIRESTORE_EMULATOR_HOST. Para producción pasá --prod explícitamente.')
  process.exit(1)
}
if (esProd && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Hay FIRESTORE_EMULATOR_HOST definido: quitálo antes de correr contra producción.')
  process.exit(1)
}
if (desde !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
  console.error('--desde tiene que ser una fecha AAAA-MM-DD')
  process.exit(1)
}

// En producción la base la abre el helper (misma copia de firebase-admin que la inicializa).
let db: FirebaseFirestore.Firestore
if (esProd) {
  db = getAdminDb()
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('Un .env define FIRESTORE_EMULATOR_HOST: no se puede asegurar que se lea producción.')
    process.exit(1)
  }
} else {
  loadTestEnv()
  if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT?.trim() || 'bacar-web' })
  db = getFirestore()
}

const pct = (n: number, total: number): string => (total === 0 ? '  -  ' : `${((n / total) * 100).toFixed(1)}%`.padStart(6))
const fila = (titulo: string, n: number, total: number): void =>
  console.log(`  ${titulo.padEnd(34)} ${String(n).padStart(5)}  ${pct(n, total)}`)

function mostrarConteo(titulo: string, c: Conteo): void {
  console.log(`\n${titulo} (${c.total} cheques)`)
  if (c.total === 0) return
  fila('Proponía lo mismo', c.acierto, c.total)
  fila('Mismo tipo, otro dato', c.dato_distinto, c.total)
  fila('Proponía otro tipo', c.tipo_distinto, c.total)
  fila('No proponía nada', c.sin_propuesta, c.total)
}

const snap = await db.collection('vientriChequesOcasionales').get()
const docs = snap.docs.map((s) => normalizarDocOcasional(s.data() as ChequeOcasionalDoc))
console.log(`Origen: ${esProd ? 'PRODUCCIÓN' : `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`} · ${docs.length} cheques ocasionales (solo lectura)`)

// ── 1. Marcas a mano ──
const marcas = medirMarcasManuales(docs)
console.log('\n════ 1. Marcas a mano de Finanzas ════')
if (marcas.porPatron.total === 0) {
  const patrones = await db.collection('vientriPatronesOcasionales').get()
  const renovManuales = docs.filter((d) => d.esRenovacion && d.renovacionDe.length > 0 && !/renov/i.test(d.obsOriginal)).length
  console.log('No hay cheques marcados a mano en esta base: no hay contra qué comparar.')
  console.log(`  (patrones aprendidos guardados: ${patrones.size} · renovaciones con cheques viejos cargados sin que el OBS diga "renovación": ${renovManuales})`)
} else {
  mostrarConteo('Con lo aprendido hasta ese momento', marcas.porPatron)
  for (const tramo of ['1', '2', '3+']) {
    const c = marcas.porConfirmaciones[tramo]
    if (c) mostrarConteo(`  · cuando el patrón ya tenía ${tramo} confirmación(es)`, c)
  }
  mostrarConteo('Leyendo el OBS directo, sin aprender (dólares y renovación)', marcas.porLecturaDirecta)
  for (const [tipo, c] of Object.entries(marcas.porTipo)) if (c.total > 0) mostrarConteo(`Por tipo: ${tipo}`, c)
}

// ── 2. Vínculo automático ──
const vinculos = medirVinculoAutomatico(docs, { desde })
const t = vinculos.conteo
console.log('\n════ 2. Vínculo automático de renovaciones ════')
console.log(`Renovaciones con los cheques viejos escritos en el OBS${desde ? ` desde ${desde}` : ''}: ${t.total}`)
if (t.total > 0) {
  fila('Llega a los mismos cheques', t.igual, t.total)
  fila('Llega a parte (faltan o sobran)', t.parcial, t.total)
  fila('Vincula cheques que no son', t.equivocado, t.total)
  fila('No vincula nada', t.sin_vinculo, t.total)
  fila('Se junta con otra del mismo día', t.se_junta_con_otra, t.total)
  const vinculadas = t.igual + t.parcial + t.equivocado
  console.log(`\n  De las ${vinculadas} que vincula, acierta justo en ${pct(t.igual, vinculadas).trim()}.`)

  const malas = vinculos.operaciones.filter((o) => o.resultado === 'equivocado' || o.resultado === 'parcial')
  if (malas.length > 0) {
    console.log('\n  Casos para mirar (hasta 15):')
    for (const o of malas.slice(0, 15)) {
      console.log(`   - ${o.resultado.padEnd(10)} ${o.beneficiario} ${o.fechaEmision ?? '?'} · escritos: ${o.viejosEscritos.length} · automáticos: ${o.viejosAutomaticos.length}`)
    }
  }

  // --detalle: los cheques de cada caso que no dio igual, para entender por qué.
  if (args.includes('--detalle')) {
    const porNumero = new Map(docs.map((d) => [d.numeroCheque, d]))
    const ver = (n: string): string => {
      const d = porNumero.get(n)
      if (!d) return n
      return `${n} $${Math.round(d.montoCentavos / 100)} emi=${d.fechaEmision} vto=${d.fechaVencimiento} conc=${d.fechaConciliado} pagado=${d.pagado} est=${d.estadoCodigo} obs="${d.obsOriginal.slice(0, 40)}"`
    }
    for (const o of vinculos.operaciones.filter((x) => x.resultado !== 'igual' && x.resultado !== 'se_junta_con_otra')) {
      console.log(`\n== ${o.resultado} · ${o.operacionId} · ${o.chequesNuevos} nuevos por $${Math.round(o.totalNuevosCentavos / 100)}`)
      for (const v of o.viejosEscritos) console.log(`   escrito     ${ver(v)}`)
      for (const v of o.viejosAutomaticos) console.log(`   automático  ${ver(v)}`)
    }
    const sinVinculo = vinculos.operaciones.filter((x) => x.resultado === 'sin_vinculo')
    const motivo = { viejosSinPagar: 0, sinFechaConciliado: 0, otro: 0 }
    for (const o of sinVinculo) {
      const vs = o.viejosEscritos.map((v) => porNumero.get(v)).filter((v) => v !== undefined)
      if (vs.every((v) => !v.pagado)) motivo.viejosSinPagar++
      else if (vs.every((v) => !v.fechaConciliado)) motivo.sinFechaConciliado++
      else motivo.otro++
    }
    console.log('\nPor qué no vincula:', motivo)
  }
}

if (salidaJson) {
  writeFileSync(salidaJson, JSON.stringify({ marcas, vinculos }, null, 2))
  console.log(`\nDetalle completo en ${salidaJson}`)
}
