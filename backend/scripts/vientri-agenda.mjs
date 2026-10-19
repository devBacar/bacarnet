/**
 * Agenda con Vientri: activar la carga automática y limpiar compromisos cargados a mano que no son reales.
 * Producción solo con --prod (usa ADMIN_SDK_KEY_PATH de .env.local). Pedir OK antes de escribir.
 *
 *   node scripts/vientri-agenda.mjs --prod --listar
 *       Lista los compromisos de pago y cobros esperados que NO vienen de Vientri (cargados a mano), abiertos.
 *   node scripts/vientri-agenda.mjs --prod --borrar <id1,id2,...>
 *       Guarda antes una copia completa de los dos listados (con su historial) en scripts/resguardos/
 *       y recién después borra esos ids (y su historial). Solo acepta ids que NO vienen de Vientri.
 *   node scripts/vientri-agenda.mjs --prod --activar | --desactivar
 *       Prende o apaga la carga automática de facturas de Vientri en la Agenda (vientriEstado/config.agenda).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const esProd = args.includes('--prod')
const valor = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

if (!esProd && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Sin FIRESTORE_EMULATOR_HOST. Para producción pasá --prod explícitamente.')
  process.exit(1)
}
if (esProd && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Hay FIRESTORE_EMULATOR_HOST definido: quitálo antes de correr contra producción.')
  process.exit(1)
}
if (esProd) initAdmin()
else {
  loadTestEnv()
  if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT?.trim() || 'bacar-web' })
}
const db = getFirestore()
console.log(`Destino: ${esProd ? 'PRODUCCIÓN' : 'emulador'}`)

const COLECCIONES = ['compromisosPago', 'cobrosEsperados']
const fecha = (v) => (v instanceof Timestamp ? v.toDate().toISOString().slice(0, 10) : '')
const pesos = (c) => (Number(c) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })
const plano = (v) => (v instanceof Timestamp ? v.toDate().toISOString() : v)

async function manuales() {
  const filas = []
  for (const col of COLECCIONES) {
    const snap = await db.collection(col).get()
    for (const d of snap.docs) {
      const x = d.data()
      if (x.origen === 'vientri') continue
      filas.push({
        coleccion: col,
        id: d.id,
        estado: x.estado,
        nombre: x.proveedorONombre ?? x.clienteONombre ?? '',
        concepto: x.concepto ?? '',
        monto: pesos(x.montoCentavos ?? 0),
        fecha: fecha(x.fechaVencimiento ?? x.fechaEsperada),
        creadoPor: x.createdBy ?? '',
      })
    }
  }
  return filas
}

if (args.includes('--listar')) {
  const filas = await manuales()
  console.log(`Cargados a mano (no vienen de Vientri): ${filas.length}`)
  console.table(filas)
  process.exit(0)
}

if (args.includes('--activar') || args.includes('--desactivar')) {
  const activa = args.includes('--activar')
  await db.collection('vientriEstado').doc('config').set({ agenda: activa, agendaCambiadoAt: Timestamp.now() }, { merge: true })
  console.log(activa ? 'Carga automática de Vientri en la Agenda: ACTIVADA' : 'Carga automática de Vientri en la Agenda: DESACTIVADA')
  process.exit(0)
}

const lista = valor('--borrar')
if (lista) {
  const ids = lista.split(',').map((s) => s.trim()).filter(Boolean)
  // 1. Resguardo completo de las dos colecciones, con historial
  const resguardo = {}
  for (const col of COLECCIONES) {
    resguardo[col] = []
    const snap = await db.collection(col).get()
    for (const d of snap.docs) {
      const hist = await d.ref.collection('historialEstados').get()
      resguardo[col].push({
        id: d.id,
        data: JSON.parse(JSON.stringify(d.data(), (_k, v) => plano(v))),
        historial: hist.docs.map((h) => ({ id: h.id, data: JSON.parse(JSON.stringify(h.data(), (_k, v) => plano(v))) })),
      })
    }
  }
  const dir = resolve(HERE, 'resguardos')
  mkdirSync(dir, { recursive: true })
  const archivo = resolve(dir, `agenda_resguardo_${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(archivo, JSON.stringify(resguardo, null, 2))
  console.log(`Resguardo guardado: ${archivo}`)

  // 2. Borrar solo los ids pedidos que existen y NO vienen de Vientri
  for (const id of ids) {
    let hecho = false
    for (const col of COLECCIONES) {
      const ref = db.collection(col).doc(id)
      const snap = await ref.get()
      if (!snap.exists) continue
      if (snap.get('origen') === 'vientri') {
        console.log(`NO se borra ${id}: viene de Vientri`)
        hecho = true
        break
      }
      const hist = await ref.collection('historialEstados').get()
      const batch = db.batch()
      hist.docs.forEach((h) => batch.delete(h.ref))
      batch.delete(ref)
      await batch.commit()
      console.log(`Borrado ${col}/${id} (${snap.get('concepto') ?? snap.get('clienteONombre') ?? ''})`)
      hecho = true
      break
    }
    if (!hecho) console.log(`No encontré ${id}`)
  }
  process.exit(0)
}

console.error('Indicá --listar, --borrar <ids>, --activar o --desactivar')
process.exit(1)
