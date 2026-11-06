/**
 * Importa un CSV de CHQOCA (cheques ocasionales de Vientri) y guarda cada cheque
 * con su OBS parseado (renovaciones, operaciones USD) y cruce con proveedores financieros.
 *
 * Colección destino: `vientriChequesOcasionales` (ID = vientri_id).
 * Segunda pasada: resuelve `renovadoPor` (link inverso).
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { normalizarNombre } from '../../agenda/domain/normalizar-nombre.js'
import {
  mapaProveedoresFinancieros,
  type ProveedorFinancieroResuelto,
} from '../../agenda/services/proveedores-financieros.repository.js'
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import { leerCsv, leerCsvSinHeader, exigirColumnas, type FilaCsv } from '../domain/csv.js'
import { NOMBRE_ESTADO_CHQ, esBajaChqoca } from '../domain/cheques.js'
import { parsearObs } from '../domain/parsear-obs.js'
import type { ProveedorOcasional } from '../domain/prooca.js'
import {
  REVISAR_PROVEEDOR_NO_CARGADO,
  REVISAR_SIN_DATOS_FINANCIEROS,
  clasificarOcasional,
  reclasificarDoc,
} from '../domain/clasificar-ocasional.js'
import { normalizarDocOcasional } from '../domain/normalizar-doc-ocasional.js'
import { aplicarInteresSugerido, sugerirInteresesSueltos } from '../domain/interes-posicion.js'
import { resolverProveedor } from '../domain/operaciones-usd.js'
import { aplicarPatrones } from '../domain/patrones-ocasionales.js'
import { calcularRenovadoPor } from '../domain/renovado-por.js'
import { resolverIdsSinEncabezado } from '../domain/resolver-ids-sin-encabezado.js'
import { filtrarVentanaConCadenas } from '../domain/ventana-ocasionales.js'
import { aBool, aCentavos, aEntero, aFecha, aTexto, fechaImposible } from '../domain/valores.js'
import {
  cerrarImportacion,
  crearImportacion,
  sincronizarColeccion,
  type ConteoEscritura,
} from './vientri.repository.js'
import { recalcularSeguimiento, type ResultadoSeguimiento } from './recalcular-seguimiento.js'
import { reconstruirCompletos, type ResultadoCompletos } from './completos-ocasionales.js'
import { listarPatronesOcasionales } from './patrones-ocasionales.repository.js'

export const VIENTRI_CHEQUES_OCASIONALES = 'vientriChequesOcasionales'

const COLUMNAS_CON_HEADER = [
  'vientri_id', 'numero', 'importe', 'fecha_vto', 'pagado', 'destinatario', 'obs',
] as const

const COLUMNAS_SIN_HEADER = [
  'destinatario', 'numero', 'numero_completo', 'id_banco',
  'fecha_emision', 'fecha_vto', 'importe', 'pagado',
  'obs', 'id_cheque', 'id_persona_recibe',
] as const

export { REVISAR_PROVEEDOR_NO_CARGADO, REVISAR_SIN_DATOS_FINANCIEROS }

function filaADoc(
  f: FilaCsv,
  proveedores: Map<string, ProveedorFinancieroResuelto>,
  proocaIndex: Map<number, ProveedorOcasional>,
): ChequeOcasionalDoc | null {
  const vientriId = aEntero(f.vientri_id) ?? aEntero(f.numero)
  if (vientriId === null) return null

  const montoCentavos = aCentavos(f.importe) ?? 0
  const beneficiario = aTexto(f.destinatario) ?? ''
  const beneficiarioNorm = normalizarNombre(beneficiario)
  const obs = parsearObs(f.obs)

  const idPerRecibe = aEntero(f.id_persona_recibe)
  const prooca = idPerRecibe !== null ? proocaIndex.get(idPerRecibe) ?? null : null
  const beneficiarioFormal = prooca?.nombre ?? null
  const beneficiarioCuit = prooca?.cuit ?? null

  const clasificacion = clasificarOcasional(
    beneficiarioNorm,
    {
      esRenovacion: obs.renovacion !== null,
      esRenovadoPorOtro: false,
      tieneUsd: obs.operacionUsd !== null,
      tieneTasaExplicita: obs.tasaExplicita !== null,
      tieneRol: obs.rol !== null,
      esSoloInteres: obs.rol === 'interes',
      tieneOrigen: (obs.renovacion?.chequeIds.length ?? 0) > 0 || obs.operacionUsd !== null || obs.tasaExplicita !== null,
    },
    proveedores,
    obs.obsOriginal,
  )

  const estadoCodigo = aEntero(f.id_estado)
  const estado = estadoCodigo !== null
    ? (NOMBRE_ESTADO_CHQ[estadoCodigo] ?? `Estado ${estadoCodigo}`)
    : 'Sin estado'

  const fechaVencimiento = aFecha(f.fecha_vto)
  const revisar: string[] = []
  if (fechaImposible(fechaVencimiento)) revisar.push(`Fecha imposible (${fechaVencimiento})`)
  if (montoCentavos <= 0) revisar.push('Importe cero o negativo')
  if (beneficiarioNorm === '') revisar.push('Sin destinatario')
  revisar.push(...clasificacion.revisarAgregados)

  return {
    numeroCheque: (f.numero_completo || f.numero || '').trim(),
    beneficiario,
    beneficiarioNormalizado: beneficiarioNorm,
    beneficiarioFormal,
    beneficiarioCuit,
    montoCentavos,
    fechaVencimiento,
    fechaEmision: aFecha(f.fecha_emision),
    estadoCodigo,
    estado,
    pagado: aBool(f.pagado) || aFecha(f.fecha_conciliado) !== null,
    esProveedorFinanciero: clasificacion.esProveedorFinanciero,
    tipoProveedor: clasificacion.tipoProveedor,
    esRenovacion: obs.renovacion !== null,
    renovacionDe: obs.renovacion?.chequeIds ?? [],
    renovadoPor: [],
    operacionUsd: obs.operacionUsd,
    tasaExplicita: obs.tasaExplicita,
    rolEnOperacion: obs.rol,
    obsOriginal: obs.obsOriginal,
    revisar,
    proveedorFinancieroId: clasificacion.proveedorFinancieroId,
    esCompraIva: clasificacion.esCompraIva,
    fechaConciliado: aFecha(f.fecha_conciliado),
    vientriId,
    vientriChqId: aEntero(f.id_cheque),
    baja: esBajaChqoca(f),
  }
}

function resolverRenovadoPor(docs: ChequeOcasionalDoc[]): void {
  const renovadoPor = calcularRenovadoPor(docs)
  docs.forEach((d, i) => { d.renovadoPor = renovadoPor[i]! })
}

async function leerBase(): Promise<ChequeOcasionalDoc[]> {
  const snap = await adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).get()
  return snap.docs.map((s) => normalizarDocOcasional(s.data() as ChequeOcasionalDoc))
}

const CAMPOS_DERIVADOS = ['renovadoPor', 'operacionUsd', 'esProveedorFinanciero', 'tipoProveedor', 'proveedorFinancieroId', 'esCompraIva', 'sugerencia', 'interesSugerido', 'revisar'] as const

/**
 * Hay campos que no vienen del CSV sino de otros cheques o de la lista de proveedores: `renovadoPor`
 * (un cheque ya guardado se entera de que lo renovaron recién cuando llega el nuevo) y la clasificación
 * como proveedor financiero con sus avisos de `revisar` (cambian si se carga un proveedor nuevo o si el
 * cheque pasa a estar renovado). Se recalculan sobre toda la base y se escriben solo los que difieren.
 */
export async function sincronizarDerivadosEnBase(): Promise<number> {
  const [snap, proveedores, patrones] = await Promise.all([
    adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).get(),
    mapaProveedoresFinancieros(),
    listarPatronesOcasionales(),
  ])
  const docs = snap.docs.map((s) => normalizarDocOcasional(s.data() as ChequeOcasionalDoc))
  const renovadoPor = calcularRenovadoPor(docs)

  const actuales = docs.map((base) => ({ ...base, operacionUsd: base.operacionUsd, renovadoPor: [...base.renovadoPor].sort() }))
  const esperados = actuales.map((actual, i) => {
    // Se relee solo lo que el OBS dice con la palabra USD; nunca se borra un USD ya cargado (por ejemplo a mano).
    const operacionUsd = actual.operacionUsd ?? parsearObs(actual.obsOriginal).operacionUsd
    return aplicarPatrones(
      reclasificarDoc({ ...actual, operacionUsd, renovadoPor: renovadoPor[i]! }, proveedores),
      patrones,
    )
  })
  // El interés suelto se busca sobre la base ya recalculada: necesita saber qué cheques siguen renovados o vivos.
  const intereses = sugerirInteresesSueltos(esperados, proveedores)

  const cambios: Array<{ id: string; datos: Pick<ChequeOcasionalDoc, (typeof CAMPOS_DERIVADOS)[number]> }> = []
  snap.docs.forEach((s, i) => {
    const actual = actuales[i]!
    const sinInteres = esperados[i]!
    const nombre = resolverProveedor(sinInteres.beneficiario, sinInteres.beneficiarioNormalizado, proveedores).nombre
    const esperado = aplicarInteresSugerido(sinInteres, intereses.get(sinInteres) ?? null, nombre)
    const distinto = CAMPOS_DERIVADOS.some((c) => JSON.stringify(actual[c]) !== JSON.stringify(esperado[c]))
    if (!distinto) return
    cambios.push({
      id: s.id,
      datos: {
        renovadoPor: esperado.renovadoPor,
        operacionUsd: esperado.operacionUsd,
        esProveedorFinanciero: esperado.esProveedorFinanciero,
        tipoProveedor: esperado.tipoProveedor,
        proveedorFinancieroId: esperado.proveedorFinancieroId,
        esCompraIva: esperado.esCompraIva ?? false,
        sugerencia: esperado.sugerencia ?? null,
        interesSugerido: esperado.interesSugerido ?? null,
        revisar: esperado.revisar,
      },
    })
  })

  for (let i = 0; i < cambios.length; i += 400) {
    const batch = adminDb().batch()
    for (const c of cambios.slice(i, i + 400)) {
      batch.set(
        adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).doc(c.id),
        { ...c.datos, actualizadoAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
    }
    await batch.commit()
  }
  return cambios.length
}

/** Campos que Vientri cambia con el tiempo: son los únicos que se actualizan en un cheque que ya estaba guardado. */
export const CAMPOS_VIVOS_OCASIONALES = ['pagado', 'estado', 'estadoCodigo', 'fechaConciliado', 'baja'] as const

/**
 * Nombres de beneficiarios que no están en `proveedoresFinancieros`, sin repetir. La importación no
 * los da de alta sola: se listan para que Finanzas los cargue (así no se duplican variantes del nombre).
 */
export function proveedoresSinCargar(docs: ChequeOcasionalDoc[]): string[] {
  const vistos = new Set<string>()
  const nombres: string[] = []
  for (const d of docs) {
    if (d.baja || !d.revisar.includes(REVISAR_PROVEEDOR_NO_CARGADO)) continue
    if (vistos.has(d.beneficiarioNormalizado)) continue
    vistos.add(d.beneficiarioNormalizado)
    nombres.push(d.beneficiario)
  }
  return nombres
}

export interface ResultadoImportacionOcasionales {
  ok: boolean
  importacionId: string | null
  mensaje: string
  simulado: boolean
  conteo: ConteoEscritura | null
  resumen: {
    filas: number
    parseados: number
    conRenovacion: number
    conUsd: number
    aRevisar: number
    fechasImposibles: number
  }
  seguimiento: ResultadoSeguimiento | null
  seguimientoError: string | null
  /** Beneficiarios que no están cargados en Proveedores financieros (no se crean solos). */
  proveedoresSinCargar: string[]
  completos: ResultadoCompletos | null
  completosError: string | null
}

export interface ResumenChequesOcasionales {
  filas: number
  parseados: number
  conRenovacion: number
  conUsd: number
  aRevisar: number
  fechasImposibles: number
}

/**
 * Solo parsea (sin escribir nada): cruza el CSV con el campo OBS y arma los docs con sus
 * cadenas de renovación resueltas (`renovacionDe`/`renovadoPor`). Se usa tanto para guardar en
 * `vientriChequesOcasionales` como para cruzar cadenas de renovación contra la Agenda de cheques.
 */
export async function armarChequesOcasionales(opts: {
  csv: string
  proocaIndex?: Map<number, ProveedorOcasional>
  /** 'YYYY-MM-DD': ventana de Finanzas; además se conservan los cheques viejos de cadenas de renovación abiertas. */
  desde?: string
}): Promise<{ docs: ChequeOcasionalDoc[]; resumen: ResumenChequesOcasionales; sinIdDeVientri: string[] }> {
  const primeraLinea = opts.csv.split(/\r?\n/, 1)[0] ?? ''
  const tieneHeader = COLUMNAS_CON_HEADER.every((c) => primeraLinea.includes(c))
  const tabla = tieneHeader
    ? leerCsv(opts.csv)
    : leerCsvSinHeader(opts.csv, [...COLUMNAS_SIN_HEADER])
  if (tieneHeader) exigirColumnas(tabla, 'cheques_ocasionales.csv', COLUMNAS_CON_HEADER)

  const proveedores = await mapaProveedoresFinancieros()
  const proocaIndex = opts.proocaIndex ?? new Map<number, ProveedorOcasional>()

  let todos: ChequeOcasionalDoc[] = []
  for (const f of tabla.filas) {
    const doc = filaADoc(f, proveedores, proocaIndex)
    if (doc) todos.push(doc)
  }

  // Sin encabezado no hay vientri_id: se toma el del cheque ya guardado para no duplicarlo.
  let sinIdDeVientri: string[] = []
  if (!tieneHeader) {
    const r = resolverIdsSinEncabezado(todos, await leerBase())
    todos = r.docs
    sinIdDeVientri = r.sinIdDeVientri
  }

  const docs = opts.desde ? filtrarVentanaConCadenas(todos, opts.desde) : todos
  resolverRenovadoPor(docs)
  // Con las renovaciones ya resueltas, los avisos de revisar se recalculan (un cheque renovado por otro no queda sin datos).
  for (const d of docs) d.revisar = reclasificarDoc(d, proveedores).revisar

  const resumen: ResumenChequesOcasionales = {
    filas: tabla.filas.length,
    parseados: docs.length,
    conRenovacion: docs.filter((d) => d.esRenovacion).length,
    conUsd: docs.filter((d) => d.operacionUsd !== null).length,
    aRevisar: docs.filter((d) => d.revisar.length > 0).length,
    fechasImposibles: docs.filter((d) => d.revisar.some((r) => r.includes('imposible'))).length,
  }

  return { docs, resumen, sinIdDeVientri }
}

export async function importarChequesOcasionales(opts: {
  csv: string
  origen: 'script' | 'manual'
  actor: string
  simular?: boolean
  proocaIndex?: Map<number, ProveedorOcasional>
  /** 'YYYY-MM-DD': ventana de Finanzas; además se conservan los cheques viejos de cadenas de renovación abiertas. */
  desde?: string
}): Promise<ResultadoImportacionOcasionales> {
  const simular = opts.simular === true
  const { docs, resumen, sinIdDeVientri } = await armarChequesOcasionales(opts)

  const importacionId = simular
    ? null
    : await crearImportacion({ tipo: 'cheques_ocasionales', origen: opts.origen, actor: opts.actor })

  const docsParaSync = docs.map((d) => ({ id: `oca-${d.vientriId}`, data: d as unknown as object }))

  // Nunca se borra: lo que ya está guardado y no viene en el CSV se deja. Los cheques nuevos se
  // agregan completos; los que ya estaban solo actualizan sus campos vivos (pagado, estado, baja...).
  let conteo: ConteoEscritura
  try {
    conteo = await sincronizarColeccion({
      coleccion: VIENTRI_CHEQUES_OCASIONALES,
      docs: docsParaSync,
      importacionId: importacionId ?? 'simulacion',
      borrarFaltantes: false,
      simular,
      camposVivos: [...CAMPOS_VIVOS_OCASIONALES],
    })
    if (!simular) await sincronizarDerivadosEnBase()
  } catch (err) {
    const detalle = err instanceof Error ? err.message : 'error desconocido'
    console.error('[finanzas/cheques-ocasionales] guardar', err)
    if (importacionId) {
      await cerrarImportacion(importacionId, { tipo: 'cheques_ocasionales', ok: false, error: detalle, resumen })
    }
    return {
      ok: false,
      importacionId,
      mensaje: `No se pudieron guardar los cheques ocasionales: ${detalle}`,
      simulado: simular,
      conteo: null,
      resumen,
      seguimiento: null,
      seguimientoError: null,
      proveedoresSinCargar: [],
      completos: null,
      completosError: null,
    }
  }

  // Seguimiento de renovaciones: derivado de TODOS los cheques guardados (no solo los del CSV, porque
  // lo anterior se conserva). Si falla no tumba la importación (los cheques ya están guardados); el
  // error queda en el resultado y en el log.
  let seguimiento: ResultadoSeguimiento | null = null
  let seguimientoError: string | null = null
  if (!simular && importacionId) {
    try {
      seguimiento = await recalcularSeguimiento({ docs: await leerBase(), importacionId })
    } catch (err) {
      seguimientoError = err instanceof Error ? err.message : 'No se pudo recalcular el seguimiento'
      console.error('[finanzas/cheques-ocasionales] seguimiento', err)
    }
  }

  const sinCargar = proveedoresSinCargar(docs)

  let completos: ResultadoCompletos | null = null
  let completosError: string | null = null
  if (!simular && importacionId) {
    try {
      completos = await reconstruirCompletos(importacionId)
      console.log(`[finanzas/cheques-ocasionales] completos: ${completos.total} docs (${completos.reales} reales, ${completos.sinteticos} sintéticos)`)
    } catch (err) {
      completosError = err instanceof Error ? err.message : 'No se pudieron reconstruir los cheques completos'
      console.error('[finanzas/cheques-ocasionales] completos', err)
    }
  }

  if (importacionId) {
    await cerrarImportacion(importacionId, {
      tipo: 'cheques_ocasionales',
      ok: seguimientoError === null && completosError === null,
      resumen,
      conteo,
      seguimiento,
      seguimientoError,
      proveedoresSinCargar: sinCargar,
      completos,
      completosError,
    })
  }

  const partes = [
    `${docs.length} cheques ocasionales procesados (${resumen.conRenovacion} con renovación, ${resumen.conUsd} con USD, ${resumen.aRevisar} a revisar)`,
  ]
  if (sinCargar.length > 0) {
    const muestra = sinCargar.slice(0, 10).join(', ')
    const resto = sinCargar.length > 10 ? ` y ${sinCargar.length - 10} más` : ''
    partes.push(`${sinCargar.length} proveedores sin cargar en Proveedores financieros: ${muestra}${resto}`)
  }
  if (sinIdDeVientri.length > 0) {
    partes.push(`${sinIdDeVientri.length} cheques sin id de Vientri (no están guardados): se cargan con la importación de cheques_propios.csv`)
  }
  if (seguimientoError) {
    partes.push(`ATENCIÓN: no se pudo recalcular el seguimiento (${seguimientoError})`)
  }

  if (completosError) {
    partes.push(`ATENCIÓN: no se pudieron reconstruir los cheques completos (${completosError})`)
  }

  if (completos) {
    partes.push(`completos: ${completos.total} docs`)
  }

  return {
    ok: true,
    importacionId,
    mensaje: partes.join(' — '),
    simulado: simular,
    conteo,
    resumen,
    seguimiento,
    seguimientoError,
    proveedoresSinCargar: sinCargar,
    completos,
    completosError,
  }
}
