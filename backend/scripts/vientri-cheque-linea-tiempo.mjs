/**
 * Línea de tiempo (solo lectura) de un cheque ocasional, pensada para cheques de interés:
 * qué se cargó alrededor suyo, en qué lotes y a qué hora, y qué cheques del mismo beneficiario están cerca
 * (los que se conciliaron ese día, los que vencen cerca y los que se tocaron al día siguiente).
 *
 * No toca Firestore. Lee CSV de CHQOCA del dump de Vientri; si se repiten, el último pisa por ID.
 *
 * Uso:
 *   node backend/scripts/vientri-cheque-linea-tiempo.mjs --cheque 39316591 \
 *     --csv "<dump>\chqoca.csv" --csv "<incremental>\chqoca.csv" [--ids 30] [--dias 15]
 *   (--cheque se puede repetir)
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const lib = (p) => pathToFileURL(resolve(HERE, '../lib/modules/finanzas', p)).href
const { parsearObs } = await import(lib('vientri/domain/parsear-obs.js'))
const { beneficiariosCompatibles } = await import(lib('vientri/domain/operacion-renovacion.js'))
const { normalizarNombre } = await import(lib('agenda/domain/normalizar-nombre.js'))

const args = process.argv.slice(2)
const valores = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []))
const csvs = valores('--csv')
const cheques = valores('--cheque')
const ventanaIds = Number(valores('--ids')[0] ?? 30)
const ventanaDias = Number(valores('--dias')[0] ?? 15)
if (csvs.length === 0 || cheques.length === 0) {
  console.error('Uso: --cheque <número> (repetible) --csv <chqoca.csv> (repetible) [--ids 30] [--dias 15]')
  process.exit(1)
}

const ALIAS = { id: 'id', nro: 'numero', nro_completo: 'numero_completo', fecvto: 'vto', fecemision: 'emision',
  idestadoch: 'estado', fec_conciliado: 'conc', fecimp: 'impreso', fecins: 'cargado', fecsys: 'guardado',
  // Formato del export de Bacarnet (cheques_propios.csv): mismas columnas con otros nombres.
  vientri_id: 'id', fecha_emision: 'emision', fecha_vto: 'vto', id_estado: 'estado', fecha_conciliado: 'conc' }
const porId = new Map()
for (const ruta of csvs) {
  const lineas = readFileSync(ruta, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const cab = lineas[0].split(';').map((c) => c.trim().toLowerCase()).map((c) => ALIAS[c] ?? c)
  for (const l of lineas.slice(1)) {
    const c = l.split(';')
    const f = {}
    cab.forEach((k, i) => { f[k] = c[i] })
    porId.set(Number(f.id), f)
  }
}

const dia = (t) => (t ? t.slice(0, 10) : '')
const hora = (t) => (t && t.length >= 16 ? t.slice(11, 16) : '')
const dias = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86_400_000)
const pesos = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })

const todos = [...porId.values()].filter((f) => dia(f.vto) < '2030-01-01' && f.baja !== '1').map((f) => ({
  id: Number(f.id),
  nro: (f.numero_completo || f.numero || '').split('-').pop(),
  benef: (f.destinatario || '').trim(),
  benefN: normalizarNombre(f.destinatario || ''),
  obs: (f.obs || '').trim(),
  rol: parsearObs(f.obs).rol,
  imp: Number(f.importe),
  emision: dia(f.emision), vto: dia(f.vto), conc: dia(f.conc),
  cargado: f.cargado ?? '', impreso: f.impreso ?? '', guardado: f.guardado ?? '',
  estado: f.estado, pagado: f.pagado === '1',
})).sort((a, b) => a.id - b.id)

/** Días entre que se dio por pagado y su vencimiento: si es positivo, se marcó pagado ANTES de vencer (no lo debitó el banco: se renovó). */
const anticipo = (c) => (c.pagado && c.conc && c.vto ? dias(c.conc, c.vto) : 0)

const fila = (c) =>
  `${c.nro.padStart(8)}  ${(c.rol ?? '-').padEnd(8)} ${c.benef.slice(0, 13).padEnd(13)} ${c.obs.slice(0, 24).padEnd(24)} $${pesos(c.imp).padStart(11)}`
  + `  em ${c.emision}  vto ${c.vto}  cargado ${hora(c.cargado)}  guardado ${dia(c.guardado)} ${hora(c.guardado)}  ${c.pagado ? `pagado ${c.conc || ''}${anticipo(c) >= 3 ? ` ★ ANTICIPADO ${anticipo(c)} d (vencía ${c.vto})` : ''}` : 'pendiente'}`

for (const numero of cheques) {
  const objetivo = todos.find((c) => c.nro === numero.split('-').pop())
  console.log(`\n${'='.repeat(100)}\nCHEQUE ${numero}`)
  if (!objetivo) { console.log('  No está en los CSV.'); continue }
  console.log(fila(objetivo))

  // 1) Lo que se cargó alrededor, agrupado en lotes (misma hora de carga y mismo día de emisión)
  const i = todos.indexOf(objetivo)
  const vecinos = todos.slice(Math.max(0, i - ventanaIds), i + ventanaIds + 1)
  const lotes = []
  for (const c of vecinos) {
    const k = `${c.cargado}|${c.emision}`
    const ult = lotes[lotes.length - 1]
    if (ult && ult.k === k) ult.items.push(c)
    else lotes.push({ k, items: [c] })
  }
  console.log(`\n-- Cargas alrededor (±${ventanaIds} IDs), en orden de carga. "◄" marca el lote de este cheque`)
  for (const l of lotes) {
    const p = l.items[0], u = l.items[l.items.length - 1]
    const total = l.items.reduce((s, c) => s + c.imp, 0)
    const roles = [...new Set(l.items.map((c) => c.rol ?? '-'))].join('/')
    console.log(`   ${l.items.includes(objetivo) ? '◄' : ' '} ${dia(p.cargado)} ${hora(p.cargado)}  ${String(l.items.length).padStart(2)} cheques ${p.nro}-${u.nro}  ${roles.padEnd(8)}`
      + ` ${[...new Set(l.items.map((c) => c.benef))].join(',').slice(0, 16).padEnd(16)} ${p.obs.slice(0, 22).padEnd(22)} $${pesos(total).padStart(12)}  guardado ${hora(p.guardado)}`)
  }

  // 2) Cheques del mismo beneficiario (o nombre compatible) cerca de la emisión o del vencimiento
  const mismos = todos.filter((c) => c !== objetivo && beneficiariosCompatibles(objetivo.benefN, c.benefN))
  const concEseDia = mismos.filter((c) => c.conc && Math.abs(dias(objetivo.emision, c.conc)) <= 1).sort((a, b) => anticipo(b) - anticipo(a) || a.id - b.id)
  const venceCerca = mismos.filter((c) => Math.abs(dias(objetivo.vto, c.vto)) <= ventanaDias && !concEseDia.includes(c))
  const tocadosDespues = mismos.filter((c) => c.pagado && dia(c.guardado) > objetivo.emision && dias(objetivo.emision, dia(c.guardado)) <= 2
    && !concEseDia.includes(c))
  const mostrar = (titulo, lista) => {
    console.log(`\n-- ${titulo} (${lista.length}${lista.length ? `, $${pesos(lista.reduce((s, c) => s + c.imp, 0))}` : ''})`)
    for (const c of lista.slice(0, 40)) console.log(`   ${fila(c)}`)
    if (lista.length > 40) console.log(`   … y ${lista.length - 40} más`)
  }
  mostrar(`Del mismo beneficiario, conciliados el día de emisión ±1 (${objetivo.emision}): candidatos a viejos renovados`, concEseDia)
  mostrar(`Del mismo beneficiario que vencen ±${ventanaDias} días del vencimiento ${objetivo.vto}`, venceCerca)
  mostrar('Del mismo beneficiario, pagados y guardados en los 2 días siguientes a la emisión', tocadosDespues)
  const otros = todos.filter((c) => !beneficiariosCompatibles(objetivo.benefN, c.benefN) && c.conc && c.conc === objetivo.emision && c.emision < objetivo.emision)
  console.log(`\n   (Otros beneficiarios con cheques conciliados ese mismo día: ${otros.length}. Los nombres de Vientri no siempre coinciden — por ejemplo MANA/LIONEL/LIO — así que no se descartan por nombre.)`)
}
