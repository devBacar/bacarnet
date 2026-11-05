/**
 * Análisis (solo lectura) de CUÁNDO CAEN los cheques de interés de los ocasionales (CHQOCA) respecto de
 * la operación de renovación en la que se emitieron.
 *
 * No toca Firestore ni escribe nada: lee CSV del dump de Vientri, arma las operaciones con el mismo
 * `agruparOperacionesRenovacion` que usa la app (cheques viejos y nuevos) y, para cada cheque de interés,
 * lo ubica en la operación emitida el mismo día y muestra:
 *   - días entre su vencimiento y el de los cheques viejos / nuevos de la operación,
 *   - cuánto es el interés sobre el total de los viejos, y si algún viejo vence el mismo día.
 *
 * Requiere el backend compilado (npm --prefix backend run build).
 *
 * Uso (los CSV se pisan por ID en el orden dado: primero el dump completo, después los incrementales):
 *   node backend/scripts/vientri-analisis-intereses-ocasionales.mjs \
 *     --csv "D:\...\vientri_completo_20261028_1127\chqoca.csv" \
 *     --csv "D:\...\incrementales\inc_20261102_0543\chqoca.csv" \
 *     [--desde 2025-10-01] [--beneficiario MANA] [--json salida.json] [--ver-operacion renov-mana-2026-10-16]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const lib = (p) => pathToFileURL(resolve(HERE, '../lib/modules/finanzas', p)).href
const { parsearObs } = await import(lib('vientri/domain/parsear-obs.js'))
const { agruparOperacionesRenovacion, beneficiariosCompatibles } = await import(lib('vientri/domain/operacion-renovacion.js'))
const { calcularRenovadoPor } = await import(lib('vientri/domain/renovado-por.js'))
const { esBajaChqoca } = await import(lib('vientri/domain/cheques.js'))
const { aBool, aCentavos, aEntero, aFecha, aTexto } = await import(lib('vientri/domain/valores.js'))
const { normalizarNombre } = await import(lib('agenda/domain/normalizar-nombre.js'))

const args = process.argv.slice(2)
const valores = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []))
const csvs = valores('--csv')
const desde = valores('--desde')[0] ?? '2025-10-01'
const filtroBenef = valores('--beneficiario')[0]?.toUpperCase()
const salidaJson = valores('--json')[0]

if (csvs.length === 0) {
  console.error('Falta --csv "<ruta a chqoca.csv>" (se puede repetir para sumar incrementales).')
  process.exit(1)
}

/** El dump completo trae columnas en mayúsculas (FECVTO, IDESTADOCH…); acá se pasan al nombre que usa la importación. */
const ALIAS = {
  id: 'vientri_id', nro: 'numero', nro_completo: 'numero_completo', fecvto: 'fecha_vto', fecemision: 'fecha_emision',
  idestadoch: 'id_estado', idper_recibe: 'id_persona_recibe', idchq: 'id_cheque', fec_conciliado: 'fecha_conciliado',
}

function leer(ruta) {
  const lineas = readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const cab = lineas[0].split(';').map((c) => c.trim().toLowerCase()).map((c) => ALIAS[c] ?? c)
  return lineas.slice(1).map((l) => {
    const c = l.split(';')
    const fila = {}
    cab.forEach((k, i) => { fila[k] = c[i] })
    return fila
  })
}

const porId = new Map()
for (const ruta of csvs) for (const f of leer(ruta)) porId.set(f.vientri_id, f)

function filaADoc(f) {
  const vientriId = aEntero(f.vientri_id)
  if (vientriId === null) return null
  const obs = parsearObs(f.obs)
  const beneficiario = aTexto(f.destinatario) ?? ''
  return {
    numeroCheque: (f.numero_completo || f.numero || '').trim(),
    beneficiario,
    beneficiarioNormalizado: normalizarNombre(beneficiario),
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: aCentavos(f.importe) ?? 0,
    fechaVencimiento: aFecha(f.fecha_vto),
    fechaEmision: aFecha(f.fecha_emision),
    estadoCodigo: aEntero(f.id_estado),
    estado: '',
    pagado: aBool(f.pagado) || aFecha(f.fecha_conciliado) !== null,
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    esRenovacion: obs.renovacion !== null,
    renovacionDe: obs.renovacion?.chequeIds ?? [],
    renovadoPor: [],
    operacionUsd: obs.operacionUsd,
    tasaExplicita: obs.tasaExplicita,
    rolEnOperacion: obs.rol,
    obsOriginal: obs.obsOriginal,
    revisar: [],
    proveedorFinancieroId: null,
    fechaConciliado: aFecha(f.fecha_conciliado),
    vientriId,
    vientriChqId: aEntero(f.id_cheque),
    baja: esBajaChqoca(f),
  }
}

const docs = [...porId.values()].map(filaADoc).filter(Boolean)
  .filter((d) => d.fechaVencimiento && d.fechaEmision && d.fechaVencimiento < '2030-01-01')
calcularRenovadoPor(docs).forEach((r, i) => { docs[i].renovadoPor = r })

const operaciones = agruparOperacionesRenovacion(docs)
const dias = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86_400_000)
const pesos = (c) => (c / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })

const intereses = docs.filter((d) => !d.baja && d.rolEnOperacion === 'interes' && !d.esRenovacion && d.fechaEmision >= desde
  && (!filtroBenef || d.beneficiarioNormalizado.toUpperCase().includes(filtroBenef)))

// Un "lote" de interés = mismo día de emisión + mismo beneficiario. Se lo ubica en las operaciones emitidas ese día.
const lotes = new Map()
for (const d of intereses) {
  const k = `${d.fechaEmision}|${d.beneficiarioNormalizado}`
  if (!lotes.has(k)) lotes.set(k, [])
  lotes.get(k).push(d)
}

const resultado = []
for (const [clave, cheques] of [...lotes].sort()) {
  const [emision, benef] = clave.split('|')
  const ops = operaciones.filter((o) => o.fechaEmision === emision && o.chequesNuevos.length > 0)
  const mismas = ops.filter((o) => beneficiariosCompatibles(benef, o.beneficiarioNormalizado))
  const candidatas = mismas.length > 0 ? mismas : ops

  const total = cheques.reduce((s, c) => s + c.montoCentavos, 0)
  const op = candidatas.length === 1 ? candidatas[0] : null
  const viejos = op?.chequesViejos ?? []
  const nuevos = op?.chequesNuevos ?? []
  const vtoViejos = viejos.map((v) => v.fechaVencimiento).filter(Boolean).sort()
  const vtoNuevos = nuevos.map((n) => n.fechaVencimiento).filter(Boolean).sort()
  const totalViejos = viejos.reduce((s, v) => s + v.montoCentavos, 0)

  const detalle = cheques.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento)).map((c) => ({
    numero: c.numeroCheque.split('-').pop(),
    vencimiento: c.fechaVencimiento,
    montoCentavos: c.montoCentavos,
    diasHastaPrimerViejo: vtoViejos[0] ? dias(c.fechaVencimiento, vtoViejos[0]) : null,
    diasHastaPrimerNuevo: vtoNuevos[0] ? dias(c.fechaVencimiento, vtoNuevos[0]) : null,
    venceElMismoDiaQueUnViejo: viejos.some((v) => v.fechaVencimiento === c.fechaVencimiento),
    venceElMismoDiaQueUnNuevo: nuevos.some((n) => n.fechaVencimiento === c.fechaVencimiento),
    pagado: c.pagado,
  }))

  resultado.push({
    emision, beneficiario: cheques[0].beneficiario, cantidad: cheques.length, totalInteresCentavos: total,
    operaciones: candidatas.map((o) => o.id),
    estado: op ? 'una operación ese día' : candidatas.length > 1 ? 'varias operaciones ese día (no se elige)' : 'sin operación de renovación ese día',
    vinculoViejos: op ? op.tipoVinculo : null,
    viejos: viejos.length, totalViejosCentavos: totalViejos, nuevos: nuevos.length,
    totalNuevosCentavos: nuevos.reduce((s, n) => s + n.montoCentavos, 0),
    interesSobreViejos: totalViejos > 0 ? total / totalViejos : null,
    detalle,
  })
}

for (const r of resultado) {
  console.log(`\n== ${r.emision} ${r.beneficiario} — ${r.cantidad} cheques de interés, $${pesos(r.totalInteresCentavos)}`)
  console.log(`   ${r.estado}${r.operaciones.length ? ` (${r.operaciones.join(', ')})` : ''}`)
  if (r.viejos || r.nuevos) {
    console.log(`   viejos: ${r.viejos} por $${pesos(r.totalViejosCentavos)} (${r.vinculoViejos}) | nuevos: ${r.nuevos} por $${pesos(r.totalNuevosCentavos)}`
      + (r.interesSobreViejos !== null ? ` | interés / viejos: ${(r.interesSobreViejos * 100).toFixed(1)} %` : ''))
  }
  for (const c of r.detalle) {
    console.log(`   ${c.numero}  vence ${c.vencimiento}  $${pesos(c.montoCentavos)}  ${c.pagado ? 'pagado' : 'pendiente'}`
      + (c.diasHastaPrimerViejo !== null ? `  | 1.º viejo en ${c.diasHastaPrimerViejo} d` : '')
      + (c.diasHastaPrimerNuevo !== null ? `  | 1.º nuevo en ${c.diasHastaPrimerNuevo} d` : '')
      + (c.venceElMismoDiaQueUnViejo ? '  | MISMO DÍA que un viejo' : '')
      + (c.venceElMismoDiaQueUnNuevo ? '  | MISMO DÍA que un nuevo' : ''))
  }
}
for (const id of valores('--ver-operacion')) {
  const o = operaciones.find((x) => x.id === id)
  console.log(`\n--- ${id}${o ? ` (${o.tipoVinculo})` : ': no existe'}`)
  if (!o) continue
  for (const [titulo, lista] of [['VIEJOS', o.chequesViejos], ['NUEVOS', o.chequesNuevos]]) {
    console.log(titulo)
    for (const c of [...lista].sort((a, b) => (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? ''))) {
      console.log(`   ${c.numeroCheque.split('-').pop()}  emitido ${c.fechaEmision}  vence ${c.fechaVencimiento}  $${pesos(c.montoCentavos)}`)
    }
  }
  if (o.debugAutolink) console.log(`autolink: ${o.debugAutolink}`)
}
console.log(`\n${resultado.length} lotes de interés desde ${desde}; ${docs.length} cheques leídos de ${csvs.length} archivo(s).`)

if (salidaJson) {
  writeFileSync(salidaJson, JSON.stringify(resultado, null, 2))
  console.log(`Detalle guardado en ${salidaJson}`)
}
