import type { ChequeOcasionalDoc, DatosOperacionManual, TipoOperacionManual } from './cheque-ocasional.types.js'
import { agruparOperacionesRenovacion } from './operacion-renovacion.js'
import { parsearObs, parsearUsdSuelto } from './parsear-obs.js'
import {
  aplicarPatrones,
  aprenderPatron,
  formaObs,
  idPatron,
  numerosDeChequeEnObs,
  type PatronOcasional,
} from './patrones-ocasionales.js'

/**
 * Medición (solo lectura) de cuánto acierta lo que hoy se calcula solo, comparado con lo que escribió una persona.
 * No cambia ningún dato: sirve para decidir qué se podría aplicar sin revisión y qué no.
 *
 * Hay dos comparaciones:
 *  1. Marcas a mano de Finanzas (`clasificacionManual`): se repasan en el orden en que se hicieron y, antes de cada
 *     una, se mira qué habría propuesto el sistema con lo aprendido hasta ese momento.
 *  2. Renovaciones cuyo OBS dice qué cheques renuevan: se le esconden esos números a una operación por vez y se
 *     mira si el vínculo automático (fecha de conciliado, banco y nombre) llega a los mismos cheques viejos.
 */

const corto = (numero: string): string => numero.split('-').pop() ?? numero
const cortos = (numeros: string[]): string[] => [...new Set(numeros.map(corto))].sort()
const mismosNumeros = (a: string[], b: string[]): boolean => JSON.stringify(cortos(a)) === JSON.stringify(cortos(b))

// ───────────────────────── 1. Marcas a mano ─────────────────────────

export type ResultadoMarca =
  /** El sistema proponía el mismo tipo y los mismos datos. */
  | 'acierto'
  /** Proponía el mismo tipo pero con otros datos (otros cheques, otra cotización, otro rol). */
  | 'dato_distinto'
  /** Proponía otro tipo de operación. */
  | 'tipo_distinto'
  /** No proponía nada. */
  | 'sin_propuesta'

export interface MarcaMedida {
  numeroCheque: string
  beneficiario: string
  obsOriginal: string
  tipo: TipoOperacionManual
  fecha: string
  /** Qué proponía el aprendizaje (patrones confirmados antes de esta marca). */
  porPatron: ResultadoMarca
  /** Cuántas confirmaciones tenía el patrón usado en ese momento (0 si no había). */
  confirmacionesPrevias: number
  /** Qué da leer el OBS sin haber aprendido nada (dólares "65000 TC1435" o números de cheque). No aplica a interés/capital. */
  porLecturaDirecta: ResultadoMarca | null
}

export type Conteo = Record<ResultadoMarca, number> & { total: number }

export interface MedicionMarcas {
  marcas: MarcaMedida[]
  porPatron: Conteo
  /** Lo mismo, separado por cuántas confirmaciones tenía el patrón: '1', '2' o '3+'. */
  porConfirmaciones: Record<string, Conteo>
  porLecturaDirecta: Conteo
  porTipo: Record<TipoOperacionManual, Conteo>
}

const conteoVacio = (): Conteo => ({ acierto: 0, dato_distinto: 0, tipo_distinto: 0, sin_propuesta: 0, total: 0 })
const sumar = (c: Conteo, r: ResultadoMarca): void => {
  c[r]++
  c.total++
}

/** Lo que quedó guardado en el cheque para el tipo que marcó Finanzas. */
function datosMarcados(doc: ChequeOcasionalDoc, tipo: TipoOperacionManual): DatosOperacionManual | null {
  if (tipo === 'usd') return doc.operacionUsd ? { usd: doc.operacionUsd } : null
  if (tipo === 'renovacion') return doc.renovacionDe.length > 0 ? { chequeIds: doc.renovacionDe } : null
  return doc.rolEnOperacion ? { rol: doc.rolEnOperacion } : null
}

function mismosDatos(tipo: TipoOperacionManual, a: DatosOperacionManual, b: DatosOperacionManual): boolean {
  if (tipo === 'usd') return a.usd?.montoUsd === b.usd?.montoUsd && a.usd?.cotizacion === b.usd?.cotizacion
  if (tipo === 'renovacion') return mismosNumeros(a.chequeIds ?? [], b.chequeIds ?? [])
  return a.rol === b.rol
}

/** El cheque como lo dejaba la importación antes de que alguien lo marcara: solo lo que se lee del OBS. */
function antesDeLaMarca(doc: ChequeOcasionalDoc): ChequeOcasionalDoc {
  const obs = parsearObs(doc.obsOriginal)
  return {
    ...doc,
    esRenovacion: obs.renovacion !== null,
    renovacionDe: obs.renovacion?.chequeIds ?? [],
    operacionUsd: obs.operacionUsd,
    rolEnOperacion: obs.rol,
    sugerencia: null,
    clasificacionManual: null,
  }
}

function lecturaDirecta(doc: ChequeOcasionalDoc, tipo: TipoOperacionManual, verdad: DatosOperacionManual): ResultadoMarca | null {
  if (tipo === 'rol') return null
  if (tipo === 'usd') {
    const usd = parsearUsdSuelto(doc.obsOriginal)
    if (!usd) return 'sin_propuesta'
    return mismosDatos('usd', { usd }, verdad) ? 'acierto' : 'dato_distinto'
  }
  const numeros = numerosDeChequeEnObs(doc.obsOriginal)
  if (numeros.length === 0) return 'sin_propuesta'
  return mismosDatos('renovacion', { chequeIds: numeros }, verdad) ? 'acierto' : 'dato_distinto'
}

/**
 * Repasa las marcas a mano en orden. Cada marca (una confirmación de Finanzas, que puede abarcar varias cuotas
 * con la misma fecha y hora) se compara contra lo aprendido hasta ese momento y recién después se aprende.
 * Limitación: el cheque guarda solo su última marca; si se marcó dos veces, la primera no se ve.
 */
export function medirMarcasManuales(docs: ChequeOcasionalDoc[]): MedicionMarcas {
  const eventos = new Map<string, ChequeOcasionalDoc[]>()
  for (const d of docs) {
    const m = d.clasificacionManual
    if (!m || d.baja) continue
    const clave = `${m.fecha}|${m.tipo}|${d.beneficiarioNormalizado}|${formaObs(d.obsOriginal)}`
    const lista = eventos.get(clave)
    if (lista) lista.push(d)
    else eventos.set(clave, [d])
  }

  const patrones = new Map<string, PatronOcasional>()
  const res: MedicionMarcas = {
    marcas: [],
    porPatron: conteoVacio(),
    porConfirmaciones: {},
    porLecturaDirecta: conteoVacio(),
    porTipo: { usd: conteoVacio(), renovacion: conteoVacio(), rol: conteoVacio() },
  }

  for (const clave of [...eventos.keys()].sort()) {
    const grupo = eventos.get(clave)!
    const tipo = grupo[0]!.clasificacionManual!.tipo
    const lista = [...patrones.values()]

    for (const doc of grupo) {
      const verdad = datosMarcados(doc, tipo)
      if (!verdad) continue
      const sugerencia = aplicarPatrones(antesDeLaMarca(doc), lista).sugerencia ?? null
      let porPatron: ResultadoMarca = 'sin_propuesta'
      if (sugerencia) {
        if (sugerencia.tipo !== tipo) porPatron = 'tipo_distinto'
        else porPatron = mismosDatos(tipo, sugerencia.datos, verdad) ? 'acierto' : 'dato_distinto'
      }
      const confirmacionesPrevias = sugerencia?.confirmaciones ?? 0
      const directa = lecturaDirecta(doc, tipo, verdad)

      res.marcas.push({
        numeroCheque: doc.numeroCheque,
        beneficiario: doc.beneficiario,
        obsOriginal: doc.obsOriginal,
        tipo,
        fecha: doc.clasificacionManual!.fecha,
        porPatron,
        confirmacionesPrevias,
        porLecturaDirecta: directa,
      })
      sumar(res.porPatron, porPatron)
      sumar(res.porTipo[tipo], porPatron)
      if (confirmacionesPrevias > 0) {
        const tramo = confirmacionesPrevias >= 3 ? '3+' : String(confirmacionesPrevias)
        sumar((res.porConfirmaciones[tramo] ??= conteoVacio()), porPatron)
      }
      if (directa) sumar(res.porLecturaDirecta, directa)
    }

    // Recién ahora se aprende, igual que la pantalla: una confirmación por marca, no por cuota.
    const elegido = grupo[0]!
    const verdad = datosMarcados(elegido, tipo)
    if (!verdad) continue
    const id = idPatron({ beneficiarioNormalizado: elegido.beneficiarioNormalizado, tipo, forma: formaObs(elegido.obsOriginal) })
    patrones.set(id, aprenderPatron(patrones.get(id) ?? null, elegido, tipo, verdad))
  }

  return res
}

// ───────────────────────── 2. Vínculo automático de renovaciones ─────────────────────────

export type ResultadoVinculo =
  /** Llegó exactamente a los mismos cheques viejos. */
  | 'igual'
  /** Llegó a algunos de los cheques correctos, pero le faltan o le sobran. */
  | 'parcial'
  /** Vinculó cheques que no son. Es el error que más importa: se vería como bueno sin serlo. */
  | 'equivocado'
  /** No vinculó nada (queda para revisar, no hace daño). */
  | 'sin_vinculo'
  /**
   * Ese mismo día hubo otra renovación del mismo proveedor que sí tenía los números escritos, y el sistema junta
   * los cheques sin números con esa. No se puede saber si el vínculo automático habría acertado: se cuenta aparte.
   */
  | 'se_junta_con_otra'

export interface VinculoMedido {
  operacionId: string
  beneficiario: string
  fechaEmision: string | null
  chequesNuevos: number
  totalNuevosCentavos: number
  viejosEscritos: string[]
  viejosAutomaticos: string[]
  resultado: ResultadoVinculo
}

export interface MedicionVinculos {
  operaciones: VinculoMedido[]
  conteo: Record<ResultadoVinculo, number> & { total: number }
}

export function compararViejos(escritos: string[], automaticos: string[]): ResultadoVinculo {
  if (automaticos.length === 0) return 'sin_vinculo'
  const a = cortos(escritos)
  const b = cortos(automaticos)
  if (JSON.stringify(a) === JSON.stringify(b)) return 'igual'
  return b.some((n) => a.includes(n)) ? 'parcial' : 'equivocado'
}

/**
 * Para cada renovación con los cheques viejos escritos en el OBS (y encontrados en la base), se le esconden
 * esos números y se vuelve a armar todo. Las demás operaciones conservan los suyos, como pasa en el uso real,
 * donde la mayoría viene con los números escritos.
 */
export function medirVinculoAutomatico(
  docsCrudos: ChequeOcasionalDoc[],
  opts: { desde?: string } = {},
): MedicionVinculos {
  const docs = docsCrudos.filter((d) => !d.baja)
  const res: MedicionVinculos = {
    operaciones: [],
    conteo: { igual: 0, parcial: 0, equivocado: 0, sin_vinculo: 0, se_junta_con_otra: 0, total: 0 },
  }

  const base = agruparOperacionesRenovacion(docs).filter(
    (op) => op.tipoVinculo === 'explicito' && op.vinculada && (!opts.desde || (op.fechaEmision ?? '') >= opts.desde),
  )

  for (const op of base) {
    const nuevos = new Set(op.chequesNuevos.map((c) => c.numeroCheque))
    const tapados = docs.map((d) => (nuevos.has(d.numeroCheque) ? { ...d, renovacionDe: [] } : d))
    const primero = op.chequesNuevos[0]!.numeroCheque
    const rehecha = agruparOperacionesRenovacion(tapados).find((o) => o.chequesNuevos.some((c) => c.numeroCheque === primero))

    const viejosEscritos = op.chequesViejos.map((c) => c.numeroCheque)
    const viejosAutomaticos = rehecha?.chequesViejos.map((c) => c.numeroCheque) ?? []
    const seJunta =
      rehecha?.tipoVinculo === 'explicito' || (rehecha?.chequesNuevos.some((c) => !nuevos.has(c.numeroCheque)) ?? false)
    const resultado: ResultadoVinculo = seJunta ? 'se_junta_con_otra' : compararViejos(viejosEscritos, viejosAutomaticos)

    res.operaciones.push({
      operacionId: op.id,
      beneficiario: op.beneficiario,
      fechaEmision: op.fechaEmision,
      chequesNuevos: op.chequesNuevos.length,
      totalNuevosCentavos: op.totalNuevosCentavos,
      viejosEscritos,
      viejosAutomaticos,
      resultado,
    })
    res.conteo[resultado]++
    res.conteo.total++
  }

  return res
}
