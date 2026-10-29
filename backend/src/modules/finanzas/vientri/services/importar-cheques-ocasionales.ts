/**
 * Importa un CSV de CHQOCA (cheques ocasionales de Vientri) y guarda cada cheque
 * con su OBS parseado (renovaciones, operaciones USD) y cruce con proveedores financieros.
 *
 * Colección destino: `vientriChequesOcasionales` (ID = vientri_id).
 * Segunda pasada: resuelve `renovadoPor` (link inverso).
 */
import { normalizarNombre } from '../../agenda/domain/normalizar-nombre.js'
import { nombresNormalizadosProveedoresFinancieros } from '../../agenda/services/proveedores-financieros.repository.js'
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import { leerCsv, leerCsvSinHeader, exigirColumnas, type FilaCsv } from '../domain/csv.js'
import { NOMBRE_ESTADO_CHQ } from '../domain/cheques.js'
import { parsearObs } from '../domain/parsear-obs.js'
import type { ProveedorOcasional } from '../domain/prooca.js'
import { filtrarVentanaConCadenas } from '../domain/ventana-ocasionales.js'
import { aBool, aCentavos, aEntero, aFecha, aTexto, fechaImposible } from '../domain/valores.js'
import {
  cerrarImportacion,
  crearImportacion,
  sincronizarColeccion,
  type ConteoEscritura,
} from './vientri.repository.js'

export const VIENTRI_CHEQUES_OCASIONALES = 'vientriChequesOcasionales'

const COLUMNAS_CON_HEADER = [
  'vientri_id', 'numero', 'importe', 'fecha_vto', 'pagado', 'destinatario', 'obs',
] as const

const COLUMNAS_SIN_HEADER = [
  'destinatario', 'numero', 'numero_completo', 'id_banco',
  'fecha_emision', 'fecha_vto', 'importe', 'pagado',
  'obs', 'id_cheque', 'id_persona_recibe',
] as const

function esObsFinanciero(obsTexto: string, proveedoresFinancieros: Set<string>): boolean {
  const norm = normalizarNombre(obsTexto.replace(/[().+,/-]/g, ' '))
  if (!norm) return false
  // Patrones explícitos de capital / interés en OBS (ej. "cap + int", "Anderson (Int)", "Int parcial y Cap")
  if (/\b(intereses|interes|int)\b/.test(norm)) return true
  for (const pf of proveedoresFinancieros) {
    if (pf.length >= 4 && norm.includes(pf)) return true
  }
  return false
}

function filaADoc(
  f: FilaCsv,
  proveedoresFinancieros: Set<string>,
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

  const esProveedorFinanciero =
    (beneficiarioNorm !== '' && proveedoresFinancieros.has(beneficiarioNorm))
    || obs.renovacion !== null
    || obs.operacionUsd !== null
    || obs.tasaExplicita !== null
    || (beneficiarioNorm === '' && esObsFinanciero(obs.obsOriginal, proveedoresFinancieros))

  const estadoCodigo = aEntero(f.id_estado)
  const estado = estadoCodigo !== null
    ? (NOMBRE_ESTADO_CHQ[estadoCodigo] ?? `Estado ${estadoCodigo}`)
    : 'Sin estado'

  const fechaVencimiento = aFecha(f.fecha_vto)
  const revisar: string[] = []
  if (fechaImposible(fechaVencimiento)) revisar.push(`Fecha imposible (${fechaVencimiento})`)
  if (montoCentavos <= 0) revisar.push('Importe cero o negativo')
  if (beneficiarioNorm === '') revisar.push('Sin destinatario')

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
    esProveedorFinanciero,
    tipoProveedor: esProveedorFinanciero ? 'financiero' : null,
    esRenovacion: obs.renovacion !== null,
    renovacionDe: obs.renovacion?.chequeIds ?? [],
    renovadoPor: [],
    operacionUsd: obs.operacionUsd,
    tasaExplicita: obs.tasaExplicita,
    rolEnOperacion: obs.rol,
    obsOriginal: obs.obsOriginal,
    revisar,
    vientriId,
    vientriChqId: aEntero(f.id_cheque),
    baja: aBool(f.baja),
  }
}

function resolverRenovadoPor(docs: ChequeOcasionalDoc[]): void {
  const porNumero = new Map<string, ChequeOcasionalDoc>()
  for (const d of docs) {
    if (d.numeroCheque) {
      porNumero.set(d.numeroCheque, d)
      const corto = d.numeroCheque.split('-').pop()
      if (corto && corto !== d.numeroCheque) porNumero.set(corto, d)
    }
  }

  for (const nuevo of docs) {
    for (const numViejo of nuevo.renovacionDe) {
      const viejo = porNumero.get(numViejo)
      if (viejo && !viejo.renovadoPor.includes(nuevo.numeroCheque)) {
        viejo.renovadoPor.push(nuevo.numeroCheque)
      }
    }
  }
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
    proveedoresFinancieros: number
    fechasImposibles: number
  }
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

  const primeraLinea = opts.csv.split(/\r?\n/, 1)[0] ?? ''
  const tieneHeader = COLUMNAS_CON_HEADER.every((c) => primeraLinea.includes(c))
  const tabla = tieneHeader
    ? leerCsv(opts.csv)
    : leerCsvSinHeader(opts.csv, [...COLUMNAS_SIN_HEADER])
  if (tieneHeader) exigirColumnas(tabla, 'cheques_ocasionales.csv', COLUMNAS_CON_HEADER)

  const proveedoresFinancieros = await nombresNormalizadosProveedoresFinancieros()
  const proocaIndex = opts.proocaIndex ?? new Map<number, ProveedorOcasional>()

  const todos: ChequeOcasionalDoc[] = []
  for (const f of tabla.filas) {
    const doc = filaADoc(f, proveedoresFinancieros, proocaIndex)
    if (doc) todos.push(doc)
  }

  const docs = opts.desde ? filtrarVentanaConCadenas(todos, opts.desde) : todos
  resolverRenovadoPor(docs)

  const resumen = {
    filas: tabla.filas.length,
    parseados: docs.length,
    conRenovacion: docs.filter((d) => d.esRenovacion).length,
    conUsd: docs.filter((d) => d.operacionUsd !== null).length,
    proveedoresFinancieros: docs.filter((d) => d.esProveedorFinanciero).length,
    fechasImposibles: docs.filter((d) => d.revisar.some((r) => r.includes('imposible'))).length,
  }

  const importacionId = simular
    ? null
    : await crearImportacion({ tipo: 'cheques_ocasionales', origen: opts.origen, actor: opts.actor })

  const docsParaSync = docs.map((d) => ({ id: `oca-${d.vientriId}`, data: d as unknown as object }))

  const conteo = await sincronizarColeccion({
    coleccion: VIENTRI_CHEQUES_OCASIONALES,
    docs: docsParaSync,
    importacionId: importacionId ?? 'simulacion',
    borrarFaltantes: true,
    simular,
  })

  if (importacionId) {
    await cerrarImportacion(importacionId, {
      tipo: 'cheques_ocasionales',
      ok: true,
      resumen,
      conteo,
    })
  }

  return {
    ok: true,
    importacionId,
    mensaje: `${docs.length} cheques ocasionales procesados (${resumen.conRenovacion} con renovación, ${resumen.conUsd} con USD)`,
    simulado: simular,
    conteo,
    resumen,
  }
}
