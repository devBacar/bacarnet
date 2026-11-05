/**
 * Copia datos de PRODUCCIÓN al emulador local de Firestore.
 * Producción SOLO se lee: este script nunca escribe, borra ni modifica nada allá.
 *
 * Requisitos:
 *   - Emulador de Firestore corriendo (npm run emu).
 *   - Clave de lectura de producción: --sa <ruta.json>, o PROD_READ_SA_PATH, o (último recurso)
 *     ADMIN_SDK_KEY_PATH de backend/.env.local. Lo ideal es una service account con rol
 *     "Cloud Datastore Viewer": así ni un error de código podría escribir en producción.
 *
 * Ejemplos:
 *   node scripts/copiar-prod-a-emulador.mjs --colecciones cheques,vientriChequesOcasionales --simular
 *   node scripts/copiar-prod-a-emulador.mjs --colecciones cheques,vientriChequesOcasionales
 *   node scripts/copiar-prod-a-emulador.mjs --colecciones movimientosBancarios --desde 2026-08-01 --campo fechaProceso
 *
 * Opciones:
 *   --colecciones a,b,c   colecciones raíz a copiar (o --todas para todas las raíz)
 *   --excluir a,b         con --todas, colecciones que se saltean
 *   --desde YYYY-MM-DD    solo documentos con --campo >= esa fecha (campo de texto 'YYYY-MM-DD')
 *   --campo nombre        campo de fecha para --desde (por defecto fechaProceso)
 *   --subcolecciones      copia también las subcolecciones de cada documento
 *   --limpiar             borra esas colecciones EN EL EMULADOR antes de copiar
 *   --simular             solo cuenta lo que copiaría, no escribe en el emulador
 *   --sa <ruta>           clave de lectura de producción
 */
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const ROOT = dirname(resolve(fileURLToPath(import.meta.url), '..'))
const BACKEND = resolve(ROOT, 'backend')
const require = createRequire(resolve(BACKEND, 'package.json'))
const { Firestore } = require('@google-cloud/firestore')

const PROJECT_ID = 'bacar-web'
const EMULATOR_HOST = (process.env.EMULATOR_FIRESTORE_HOST || '127.0.0.1:8080').trim()

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (nombre) => process.argv.includes(`--${nombre}`)
const lista = (valor) => (valor ?? '').split(',').map((s) => s.trim()).filter(Boolean)

function salir(mensaje) {
  console.error(`\n${mensaje}\n`)
  process.exit(1)
}

// El origen es producción: con esta variable puesta, el cliente de Firestore apuntaría al emulador.
delete process.env.FIRESTORE_EMULATOR_HOST

if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(EMULATOR_HOST)) {
  salir(`El destino tiene que ser el emulador local (127.0.0.1 o localhost), no "${EMULATOR_HOST}".`)
}

function claveDeLectura() {
  const explicita = arg('sa') || process.env.PROD_READ_SA_PATH
  if (explicita) return { ruta: explicita, origen: 'clave de lectura indicada' }
  for (const f of ['.env.local', '.env']) {
    try {
      for (const linea of readFileSync(resolve(BACKEND, f), 'utf8').split('\n')) {
        const m = linea.match(/^\s*ADMIN_SDK_KEY_PATH\s*=\s*(.*)$/)
        if (m) return { ruta: m[1].trim().replace(/^["']|["']$/g, ''), origen: `ADMIN_SDK_KEY_PATH de backend/${f} (acceso total: ojo)` }
      }
    } catch {}
  }
  return null
}

const colecciones = lista(arg('colecciones'))
const todas = flag('todas')
if (colecciones.length === 0 && !todas) {
  salir('Indicá qué copiar: --colecciones cheques,vientriChequesOcasionales (o --todas). Agregá --simular para solo contar.')
}
const excluir = new Set(lista(arg('excluir')))
const desde = arg('desde')
const campo = arg('campo') || 'fechaProceso'
if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) salir('--desde tiene que ser AAAA-MM-DD.')
const conSub = flag('subcolecciones')
const simular = flag('simular')
const limpiar = flag('limpiar')

const clave = claveDeLectura()
if (!clave) salir('Falta la clave de lectura de producción: pasá --sa <ruta.json> o definí PROD_READ_SA_PATH.')

// Origen: producción. Se bloquean a propósito todas las vías de escritura de este cliente.
const prod = new Firestore({ projectId: PROJECT_ID, keyFilename: clave.ruta })
for (const metodo of ['batch', 'bulkWriter', 'runTransaction', 'recursiveDelete']) {
  prod[metodo] = () => {
    throw new Error(`Bloqueado: este script no escribe en producción (${metodo}).`)
  }
}

// Destino: emulador local.
const emu = new Firestore({ projectId: PROJECT_ID, host: EMULATOR_HOST, ssl: false, customHeaders: { Authorization: 'Bearer owner' } })

console.log('Origen : PRODUCCIÓN (solo lectura) —', clave.origen)
console.log('Destino: emulador', EMULATOR_HOST, simular ? '(simulación: no se escribe)' : '')

try {
  await Promise.race([
    emu.listCollections(),
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('sin respuesta')), 8000)),
  ])
} catch {
  salir(`No hay emulador de Firestore en ${EMULATOR_HOST}. Levantalo con "npm run emu" y reintentá.`)
}

const writer = simular ? null : emu.bulkWriter()
let errores = 0
writer?.onWriteError((err) => {
  errores++
  console.error('  error al escribir', err.documentRef?.path, err.message)
  return false
})

const totales = new Map()

async function copiar(origenCol, destinoCol, nivel) {
  let query = origenCol
  if (desde && nivel === 0) query = query.where(campo, '>=', desde)
  let n = 0
  for await (const doc of query.stream()) {
    n++
    if (writer) writer.set(destinoCol.doc(doc.id), doc.data())
    if (conSub) {
      for (const sub of await doc.ref.listCollections()) {
        await copiar(sub, destinoCol.doc(doc.id).collection(sub.id), nivel + 1)
      }
    }
    if (n % 1000 === 0) console.log(`  ${origenCol.path}: ${n}…`)
  }
  totales.set(origenCol.path, n)
}

const lectura = todas
  ? (await prod.listCollections()).map((c) => c.id).filter((id) => !excluir.has(id))
  : colecciones

for (const nombre of lectura) {
  console.log(`\n→ ${nombre}`)
  if (limpiar && !simular) {
    await emu.recursiveDelete(emu.collection(nombre))
    console.log('  (emulador) colección vaciada antes de copiar')
  }
  await copiar(prod.collection(nombre), emu.collection(nombre), 0)
}

await writer?.close()

console.log('\nResumen:')
for (const [ruta, n] of totales) console.log(`  ${ruta}: ${n} documentos ${simular ? 'a copiar' : 'copiados'}`)
if (errores > 0) console.log(`\n${errores} documentos con error (ver arriba).`)
console.log(simular ? '\nSimulación terminada: no se escribió nada.' : '\nListo. Producción no se modificó.')
process.exit(errores > 0 ? 1 : 0)
