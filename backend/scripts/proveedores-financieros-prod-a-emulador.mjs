/**
 * Copia los proveedores financieros de PRODUCCIÓN al EMULADOR, tal cual (mismos IDs, alias, bajas y fusiones).
 * Así no hay que volver a armarlos a mano cada vez que se arranca con datos nuevos en el emulador.
 *
 * En producción SOLO LEE. Escribe únicamente en el emulador.
 * En el emulador: pisa los documentos con el mismo ID; los que existen solo en el emulador no se tocan
 * (se avisa si alguno choca por nombre con uno de producción).
 *
 * Requisitos: emulador de Firestore andando y ADMIN_SDK_KEY_PATH en backend/.env.local.
 * NO definir FIRESTORE_EMULATOR_HOST en la terminal (el script se niega, para no leer del lugar equivocado).
 *
 * Uso (desde la raíz del repo):
 *   node backend/scripts/proveedores-financieros-prod-a-emulador.mjs --simular
 *   node backend/scripts/proveedores-financieros-prod-a-emulador.mjs
 *
 * Opciones:
 *   --simular                 muestra qué haría, no escribe nada
 *   --emulador=HOST:PUERTO    por defecto 127.0.0.1:8080
 *   --baja-duplicados         da de baja (lógica) los proveedores que existen solo en el emulador
 *                             y repiten un nombre/alias de un proveedor de producción
 */

import { initializeApp, getApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { initAdmin } from './get-test-token.mjs'

const COLECCION = 'proveedoresFinancieros'

const args = process.argv.slice(2)
const simular = args.includes('--simular')
const bajaDuplicados = args.includes('--baja-duplicados')
const emuHost = (args.find((a) => a.startsWith('--emulador='))?.split('=')[1] ?? '127.0.0.1:8080').trim()

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Hay FIRESTORE_EMULATOR_HOST definido en esta terminal: quitalo ($env:FIRESTORE_EMULATOR_HOST=$null). ' +
      'El emulador se elige con --emulador=HOST:PUERTO.',
  )
  process.exit(1)
}

// Mismo criterio que domain/normalizar-nombre.ts, solo para comparar nombres al avisar duplicados.
const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
const claves = (data) => [...new Set([data.nombreNormalizado, ...(data.alias ?? [])].map(normalizar).filter(Boolean))]

// 0) El emulador tiene que estar andando antes de leer nada.
try {
  const r = await fetch(`http://${emuHost}/`)
  if (!r.ok) throw new Error(`respondió ${r.status}`)
} catch (err) {
  console.error(`No encuentro el emulador de Firestore en ${emuHost} (${err instanceof Error ? err.message : err}).`)
  process.exit(1)
}

// 1) Leer de producción (sin FIRESTORE_EMULATOR_HOST, así que esta instancia es sí o sí producción).
initAdmin()
const prodApp = getApp()
const projectId = prodApp.options.projectId
const prodDb = getFirestore(prodApp)
const prodSnap = await prodDb.collection(COLECCION).get()
const prodDocs = prodSnap.docs.map((d) => ({ id: d.id, data: d.data() }))
console.log(`Producción (${projectId}): ${prodDocs.length} proveedores leídos (solo lectura).`)

// 2) Recién ahora apuntar al emulador. Firestore toma la variable al crearse, así que la instancia
//    de producción de arriba ya quedó fija y no se vuelve a usar.
process.env.FIRESTORE_EMULATOR_HOST = emuHost
const emuApp = initializeApp({ projectId }, 'emulador')
const emuDb = getFirestore(emuApp)
const emuSnap = await emuDb.collection(COLECCION).get()
const emuDocs = new Map(emuSnap.docs.map((d) => [d.id, d.data()]))
console.log(`Emulador ${emuHost} (${projectId}): ${emuDocs.size} proveedores antes de copiar.`)
console.log(simular ? 'Modo: simulación (no se escribe nada)\n' : 'Modo: escritura\n')

// 3) Copiar con el mismo ID.
let nuevos = 0
let actualizados = 0
const batch = emuDb.batch()
for (const { id, data } of prodDocs) {
  const estado = data.estado === 'inactivo' ? ' (dado de baja)' : ''
  if (emuDocs.has(id)) {
    actualizados += 1
    console.log(`~ ${simular ? 'pisaría' : 'pisado'}: ${data.nombre}${estado}`)
  } else {
    nuevos += 1
    console.log(`+ ${simular ? 'crearía' : 'creado'}: ${data.nombre}${estado}`)
  }
  batch.set(emuDb.collection(COLECCION).doc(id), data)
}

// 4) Los que están solo en el emulador y repiten un nombre de producción engancharían cheques dos veces.
const prodIds = new Set(prodDocs.map((d) => d.id))
const clavesProd = new Set(prodDocs.filter((d) => d.data.estado !== 'inactivo').flatMap((d) => claves(d.data)))
const duplicados = [...emuDocs.entries()].filter(
  ([id, data]) => !prodIds.has(id) && data.estado !== 'inactivo' && claves(data).some((c) => clavesProd.has(c)),
)
for (const [id, data] of duplicados) {
  if (bajaDuplicados) {
    batch.update(emuDb.collection(COLECCION).doc(id), {
      estado: 'inactivo',
      bajaPor: 'script:prod-a-emulador',
      bajaAt: Timestamp.now(),
    })
    console.log(`- ${simular ? 'daría de baja' : 'dado de baja'} (duplicado solo del emulador): ${data.nombre} [${id}]`)
  } else {
    console.log(`! duplicado solo del emulador: ${data.nombre} [${id}] — usá --baja-duplicados para darlo de baja`)
  }
}

if (!simular) await batch.commit()

const soloEmu = [...emuDocs.keys()].filter((id) => !prodIds.has(id)).length
console.log(
  `\nResumen: ${nuevos} ${simular ? 'a crear' : 'creados'}, ${actualizados} ${simular ? 'a pisar' : 'pisados'}, ` +
    `${soloEmu} existen solo en el emulador (${duplicados.length} repiten nombre de producción).`,
)
if (!simular) {
  console.log('Los cheques ya cargados en el emulador no se reclasifican solos: reimportá o dispará la actualización de cheques.')
}
process.exit(0)
