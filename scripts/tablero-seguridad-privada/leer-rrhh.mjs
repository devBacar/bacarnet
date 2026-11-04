#!/usr/bin/env node
/**
 * Lee rrhh_informe/agregado de Firestore de producción y vuelca SOLO los agregados por mes (sin nombres de
 * personas) de horas y costo laboral de los centros de costo "Seguridad Privada" (NO incluye "Seguridad Planta",
 * que es otro centro de costo), a un JSON local para que actualizar-facturacion.mjs lo use con --rrhh.
 *
 * Requiere: una service account con permiso de lectura sobre Firestore de bacar-web, y que el entorno donde se
 * corre tenga autorizado leer datos de producción con sueldos reales (aunque sea agregado, no por persona).
 *
 * Uso:
 *   node leer-rrhh.mjs [--sa <ruta a la clave de la service account>] [--out <ruta de salida>]
 *   Por default usa C:\Users\Admin\.bacarsa\firebase-admin-sa.json y escribe rrhh_seguridad.json en esta carpeta.
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, writeFileSync } from 'node:fs'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      out[arg.slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const keyPath = args.sa || 'C:\\Users\\Admin\\.bacarsa\\firebase-admin-sa.json'
  const salida = args.out || new URL('rrhh_seguridad.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

  const sa = JSON.parse(readFileSync(keyPath, 'utf8'))
  if (getApps().length === 0) initializeApp({ credential: cert(sa) })
  const db = getFirestore()

  const snap = await db.collection('rrhh_informe').doc('agregado').get()
  if (!snap.exists) {
    console.log('NO existe rrhh_informe/agregado')
    process.exit(1)
  }
  const d = snap.data()

  const areas = d.evolucion?.areas ?? []
  const segAreas = areas.filter((a) => (a.nombre || '').toLowerCase().startsWith('seguridad privada'))
  console.log('Áreas de Seguridad Privada encontradas:', JSON.stringify(segAreas))
  const segCcs = new Set(segAreas.map((a) => a.cc))

  const otrasAreasSeguridadLike = areas.filter((a) => (a.nombre || '').toLowerCase().includes('seguridad') && !segCcs.has(a.cc))
  console.log('Otras áreas con "seguridad" en el nombre (NO incluidas, ej. Planta):', JSON.stringify(otrasAreasSeguridadLike))

  // Solo meses "real" (cerrados): evolucion.filas también trae filas "actual"/"prevision" (estimadas, para
  // planificación) que no sirven para refrescar un histórico - se descartan explícitamente, no solo por rango.
  const filasEvolucion = (d.evolucion?.filas ?? []).filter((f) => segCcs.has(f.cc) && f.tipo === 'real')
  const horasPorMes = {}
  for (const f of filasEvolucion) {
    const hp = (f.horasNormales || 0) + (f.he50 || 0) + (f.he100 || 0) + (f.fer || 0) + (f.comp || 0)
    horasPorMes[f.mes] = (horasPorMes[f.mes] || 0) + hp
  }

  // costoLaboral NO incluye las provisiones de aguinaldo/despidos (ver costosNomina.ts): hay que sumar `prov`
  // aparte para que cierre contra "sueldos y cargas" del tablero (que sí reparte el aguinaldo mes a mes).
  const filasCostos = (d.costos?.filas ?? []).filter((f) => segCcs.has(f.cc))
  const costoPorMes = {}
  for (const f of filasCostos) {
    costoPorMes[f.mes] = (costoPorMes[f.mes] || 0) + (f.costoLaboral || 0) + (f.prov || 0)
  }

  const meses = [...new Set([...Object.keys(horasPorMes), ...Object.keys(costoPorMes)])].sort()
  console.log('Meses con datos:', meses.length, meses[0], '..', meses[meses.length - 1])

  writeFileSync(salida, JSON.stringify({ segCcs: [...segCcs], horasPorMes, costoPorMes, meses }, null, 1), 'utf8')
  console.log('Escrito', salida)
}

main()
