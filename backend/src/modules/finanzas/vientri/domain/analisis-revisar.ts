import type { ChequeOcasionalDoc, DatosOperacionManual, InteresDeRenovacion, OperacionRenovacion, TipoOperacionManual } from './cheque-ocasional.types.js'
import {
  avisosDelDetalle,
  chequesDeRedondeo,
  detalleDiferenciaDeInteres,
  detalleMesVencimiento,
  detalleMismoVencimiento,
  detallePorcentajeRenovacion,
  detalleRestaRenovacion,
  fuerzaDelDetalle,
  type DetalleInteres,
} from './detalle-interes.js'
import { armarDetalleDolares, usdDelGrupo, type DetalleDolares } from './detalle-dolares.js'
import { sugerirInteres } from './interes-posicion.js'
import { resolverProveedor, type ProveedorDelCatalogo } from './operaciones-usd.js'
import { armarPropuestaRenovacion, mismoBeneficiario, numeroCorto } from './propuesta-renovacion.js'

/**
 * Revisión asistida de "A revisar". Junta los cheques a revisar por operación (mismo beneficiario, misma emisión
 * y mismo OBS) y, para cada grupo, arma todas las explicaciones posibles con la cuenta que las respalda:
 *  - renovación de los cheques que nombra el OBS,
 *  - interés o diferencia: el total da justo un % redondo de una renovación del mismo proveedor,
 *  - interés sobre lo que el proveedor tiene por vencer (misma regla que `interes-posicion.ts`),
 *  - diferencia sobre la base de un interés ya sugerido,
 *  - operación en dólares (dólares × cotización contra el total),
 *  - origen posible: cheques del proveedor que salieron en esos días.
 * No cambia ningún dato: es para que Finanzas compare y decida.
 */

export type FuerzaHipotesis = 'fuerte' | 'posible' | 'debil'
export type TipoHipotesis =
  | 'renovacion_obs'
  | 'interes_renovacion'
  | 'interes_posicion'
  | 'diferencia'
  | 'dolares'
  | 'origen_posible'

export interface ChequeEvidencia {
  numeroCheque: string
  beneficiario: string
  montoCentavos: number
  fechaEmision: string | null
  fechaVencimiento: string | null
  fechaConciliado: string | null
  estado: string
  pagado: boolean
  obs: string
}

/** La cuenta que respalda una hipótesis: base × tasa = esperado, comparado contra el total del grupo. */
export { chequesDeRedondeo }

export interface CuentaHipotesis {
  baseCentavos: number
  /** 6 = 6 %. Null cuando no hay tasa (dólares). */
  tasaPorcentaje: number | null
  esperadoCentavos: number
  /** Total del grupo − esperado. Cero (o centavos) cuando da justo. */
  diferenciaCentavos: number
  /**
   * Si la diferencia se explica porque cada cheque se redondeó al peso (hasta $0,50 por cheque): cuántos cheques.
   * Null si la diferencia es más grande que eso.
   */
  redondeoCheques: number | null
}

/**
 * Lo que se guardaría si Finanzas confirma la hipótesis: es el mismo pedido que la clasificación a mano
 * (`POST /:id/clasificar`). Null cuando no hay nada para guardar (ya está cargado).
 */
export interface ConfirmarHipotesis {
  tipo: TipoOperacionManual
  datos: DatosOperacionManual
  etiqueta: string
  /** Qué pasa al guardar, en palabras simples. */
  efecto: string
}

export interface HipotesisRevisar {
  tipo: TipoHipotesis
  fuerza: FuerzaHipotesis
  titulo: string
  explicacion: string
  cuenta: CuentaHipotesis | null
  /** Cheques en los que se apoya (hasta `MAX_CHEQUES_EVIDENCIA`). */
  cheques: ChequeEvidencia[]
  chequesTotal: number
  avisos: string[]
  /** Aclaración que no es una alerta (se muestra chica). */
  nota?: string | null
  /** Solo intereses: el paso a paso (qué se pagó, sobre qué, la cuenta, por qué tiene sentido, otras bases). */
  detalleInteres?: DetalleInteres | null
  /** Solo dólares: el paso a paso (qué se pidió, cómo se pagó, la cuenta, por qué tiene sentido). */
  detalleDolares?: DetalleDolares | null
  confirmar: ConfirmarHipotesis | null
}

/** Una renovación del mismo proveedor emitida el mismo día que el grupo, con sus cheques viejos y nuevos. */
export interface RenovacionDelDia {
  obs: string
  /** False si no se sabe qué cheques viejos reemplaza. */
  vinculada: boolean
  viejos: ChequeEvidencia[]
  nuevos: ChequeEvidencia[]
  totalViejosCentavos: number
  totalNuevosCentavos: number
  /** Nuevos − viejos: el interés que ya va adentro de los cheques nuevos. */
  interesCentavos: number
  tasaPorcentaje: number | null
  /** Cuánto es el total del grupo sobre los cheques viejos y sobre los nuevos (6 = 6 %), dé o no una tasa redonda. */
  grupoSobreViejosPorcentaje: number | null
  grupoSobreNuevosPorcentaje: number | null
  /** Días que se corrieron los vencimientos (de los viejos a los nuevos). */
  diasRenovacion: number | null
}

export interface OperacionDelMismoDia {
  obs: string
  cantidadCheques: number
  totalCentavos: number
}

export interface GrupoARevisar {
  /** Id del primer cheque del grupo (`oca-…`), para abrir su detalle. */
  id: string
  beneficiario: string
  /** Nombre del proveedor en el catálogo, o como está escrito si no está cargado. */
  proveedor: string
  proveedorCargado: boolean
  fechaEmision: string | null
  obs: string
  cantidadCheques: number
  totalCentavos: number
  /** Motivos por los que está a revisar (sin repetir). */
  motivos: string[]
  cheques: (ChequeEvidencia & { id: string; aRevisar: boolean })[]
  /** Renovaciones del proveedor emitidas el mismo día: a la que pertenece un interés o una diferencia de ese día. */
  renovacionesDelDia: RenovacionDelDia[]
  /** Qué más se le emitió a ese proveedor el mismo día. */
  mismoDia: OperacionDelMismoDia[]
  hipotesis: HipotesisRevisar[]
}

export const MAX_CHEQUES_EVIDENCIA = 30
/** Cada cheque se redondea al peso: se acepta $1 de diferencia por cheque del grupo. */
const TOLERANCIA_POR_CHEQUE_CENTAVOS = 100
/** Tasas que se prueban, en centésimos de punto: de 0,25 % a 20 % de a 0,25 %. */
const TASAS_BP = Array.from({ length: 80 }, (_, i) => (i + 1) * 25)
/** Hasta qué tasa se le dice "diferencia" en vez de "interés". */
const TASA_MAX_DIFERENCIA_BP = 300
/** Una renovación cuenta como base si se emitió hasta estos días antes (o pocos días después) del grupo. */
const DIAS_ATRAS_RENOVACION = 60
const DIAS_ADELANTE_RENOVACION = 5
/** Una base múltiplo de $1.000 es redonda: cualquier cheque redondo "da justo" un % de ella. */
const BASE_REDONDA_CENTAVOS = 1_000_00
/** Origen posible: cheques conciliados o vencidos a estos días de la emisión del grupo. */
const DIAS_CONCILIADO_ORIGEN = 3
const DIAS_VENCIMIENTO_ORIGEN = 5
const TASA_MAX_RENOVACION = 0.5

const ORDEN_FUERZA: Record<FuerzaHipotesis, number> = { fuerte: 0, posible: 1, debil: 2 }

const dias = (desde: string, hasta: string): number =>
  Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)
const fechaCorta = (ymd: string | null): string => (ymd ? ymd.split('-').reverse().join('/') : 'sin fecha')
const pesos = (c: number): string => `$${Math.round(c / 100).toLocaleString('es-AR')}`
const porcentaje = (p: number): string => `${p.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`
const suma = (lista: { montoCentavos: number }[]): number => lista.reduce((s, d) => s + d.montoCentavos, 0)
const claveOperacion = (d: ChequeOcasionalDoc): string =>
  `${d.beneficiarioNormalizado}|${d.fechaEmision ?? ''}|${d.obsOriginal.trim()}`

function evidencia(d: ChequeOcasionalDoc): ChequeEvidencia {
  return {
    numeroCheque: d.numeroCheque,
    beneficiario: d.beneficiario,
    montoCentavos: d.montoCentavos,
    fechaEmision: d.fechaEmision,
    fechaVencimiento: d.fechaVencimiento,
    fechaConciliado: d.fechaConciliado,
    estado: d.estado,
    pagado: d.pagado,
    obs: d.obsOriginal.trim(),
  }
}

function conCheques(docs: ChequeOcasionalDoc[]): Pick<HipotesisRevisar, 'cheques' | 'chequesTotal'> {
  return { cheques: docs.slice(0, MAX_CHEQUES_EVIDENCIA).map(evidencia), chequesTotal: docs.length }
}

/** La tasa redonda con la que `base` da `monto`, o null. */
function tasaRedonda(baseCentavos: number, montoCentavos: number, tolerancia: number): number | null {
  if (baseCentavos <= 0) return null
  return TASAS_BP.find((bp) => Math.abs(Math.round((baseCentavos * bp) / 10_000) - montoCentavos) <= tolerancia) ?? null
}

/**
 * Marcar como interés: solo si el grupo todavía no dice si es interés o capital. Se usa cuando no hay detalle (no se
 * sabe de qué operación viene); el cheque sigue a revisar con el aviso "Interés sin operación de origen".
 */
function confirmarInteres(grupo: ChequeOcasionalDoc[]): ConfirmarHipotesis | null {
  if (grupo.some((d) => d.rolEnOperacion !== null)) return null
  return {
    tipo: 'rol',
    datos: { rol: 'interes' },
    etiqueta: 'Marcar como interés',
    efecto: 'Queda marcado como interés. Todavía no se guarda sobre qué cheques se calculó, así que sigue en A revisar como "Interés sin operación de origen".',
  }
}

function textoCuenta(d: DetalleInteres): string {
  if (d.forma === 'renovacion') return 'cheques nuevos − cheques viejos'
  return d.porMes ? `${porcentaje(d.tasaPorcentaje)} mensual × ${plural(d.periodos, 'mes', 'meses')}` : porcentaje(d.tasaPorcentaje)
}

/**
 * Confirmar un interés con detalle: cada cheque queda marcado como interés y atado a la operación de su tramo (la
 * renovación relacionada, si la hay), con la tasa y la base. Así deja de estar "sin operación de origen" y sale de
 * A revisar. En el detalle de cada renovación se ve solo el interés de sus cheques.
 */
function confirmarDetalle(grupo: ChequeOcasionalDoc[], d: DetalleInteres): ConfirmarHipotesis | null {
  if (grupo.every((x) => x.interesDe != null)) return null
  const interesDePorCheque: Record<string, InteresDeRenovacion> = {}
  for (const t of d.tramos) {
    for (const n of t.chequesInteres) {
      interesDePorCheque[numeroCorto(n)] = {
        fechaRenovacion: t.renovacion?.fechaEmision ?? null,
        obsRenovacion: t.renovacion?.obs ?? '',
        tasaPorcentaje: d.tasaPorcentaje,
        porMes: d.porMes,
        meses: d.periodos,
        baseCentavos: t.baseCentavos,
        baseDescripcion: t.baseDescripcion,
      }
    }
  }
  const renovaciones = d.tramos.map((t) => t.renovacion)
  const fechas = new Set(renovaciones.map((r) => r?.fechaEmision ?? null))
  const distintas = new Set(renovaciones.map((r) => `${r?.fechaEmision ?? ''}|${r?.obs ?? ''}`)).size
  let etiqueta = 'Confirmar este interés'
  let destino: string | null = null
  if (renovaciones.every((r) => r !== null) && fechas.size === 1) {
    const f = fechaCorta(renovaciones[0]!.fechaEmision)
    etiqueta = distintas === 1 ? `Confirmar como interés de la renovación del ${f}` : `Confirmar como interés de las renovaciones del ${f}`
    destino = distintas === 1 ? `de la renovación del ${f}` : `de su renovación del ${f}`
  } else if (renovaciones.some((r) => r !== null)) {
    etiqueta = 'Confirmar como interés de estas renovaciones'
    destino = 'de su renovación'
  }
  return {
    tipo: 'rol',
    datos: { rol: 'interes', interesDePorCheque },
    etiqueta,
    efecto: destino
      ? `${grupo.length === 1 ? 'El cheque queda' : 'Cada cheque queda'} como el interés ${destino} (${textoCuenta(d)}) y sale de A revisar.`
      : `${grupo.length === 1 ? 'Queda' : 'Quedan'} como interés (${textoCuenta(d)}) y ${grupo.length === 1 ? 'sale' : 'salen'} de A revisar.`,
  }
}

/** Arma una hipótesis de interés a partir de su detalle: la cuenta, la fuerza, los avisos y qué se guarda al confirmar. */
function deDetalle(
  base: Pick<HipotesisRevisar, 'tipo' | 'titulo' | 'explicacion' | 'cheques' | 'chequesTotal'> & { avisos?: string[]; nota?: string | null },
  grupo: ChequeOcasionalDoc[],
  d: DetalleInteres,
): HipotesisRevisar {
  return {
    ...base,
    fuerza: fuerzaDelDetalle(d),
    cuenta: {
      baseCentavos: d.tramos.reduce((s, t) => s + t.baseCentavos, 0),
      tasaPorcentaje: d.tasaPorcentaje,
      esperadoCentavos: d.esperadoCentavos,
      diferenciaCentavos: d.diferenciaCentavos,
      redondeoCheques: d.redondeoCheques,
    },
    avisos: [...(base.avisos ?? []), ...avisosDelDetalle(d)],
    nota: base.nota ?? null,
    detalleInteres: d,
    confirmar: confirmarDetalle(grupo, d),
  }
}

function confirmarRenovacion(numeros: string[]): ConfirmarHipotesis {
  return {
    tipo: 'renovacion',
    datos: { chequeIds: numeros },
    etiqueta: 'Guardar como renovación de estos cheques',
    efecto: `Queda como renovación de ${plural(numeros.length, 'cheque', 'cheques')} y sale de A revisar.`,
  }
}

interface Contexto {
  todos: ChequeOcasionalDoc[]
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo>
  operaciones: OperacionRenovacion[]
  porNumero: Map<string, ChequeOcasionalDoc>
}

function hipotesisRenovacionObs(grupo: ChequeOcasionalDoc[], total: number, ctx: Contexto): HipotesisRevisar[] {
  const propuesta = armarPropuestaRenovacion(grupo[0]!, ctx.todos, ctx.catalogo)
  if (propuesta.viejos.length === 0) return []
  const encontrados = propuesta.viejos.filter((v) => v.encontrado !== null)
  const docs = encontrados
    .map((v) => ctx.porNumero.get(numeroCorto(v.encontrado!.numeroCheque)))
    .filter((d): d is ChequeOcasionalDoc => d !== undefined)
  const totalViejos = suma(docs)
  const avisos = propuesta.viejos.flatMap((v) => v.avisos.map((a) => `${v.numeroObs}: ${a}`))
  const todosEncontrados = encontrados.length === propuesta.viejos.length
  const tasa = totalViejos > 0 ? (total - totalViejos) / totalViejos : null
  const tasaRazonable = tasa !== null && tasa >= 0 && tasa <= TASA_MAX_RENOVACION
  if (tasa !== null && !tasaRazonable) {
    avisos.push(
      tasa < 0
        ? 'Los cheques nuevos suman menos que los viejos: puede faltar algún cheque nuevo o ser un pago parcial'
        : 'El interés da más del 50 %: puede faltar algún cheque viejo',
    )
  }
  const fuerza: FuerzaHipotesis = todosEncontrados && avisos.length === 0 && tasaRazonable ? 'fuerte' : encontrados.length > 0 ? 'posible' : 'debil'
  return [
    {
      tipo: 'renovacion_obs',
      fuerza,
      titulo: `Renovación de ${plural(propuesta.viejos.length, 'cheque', 'cheques')} que nombra el OBS`,
      explicacion:
        encontrados.length === 0
          ? 'El OBS nombra números de cheque, pero ninguno está entre los cheques ocasionales cargados.'
          : `El OBS nombra ${plural(propuesta.viejos.length, 'cheque', 'cheques')}; ${todosEncontrados ? 'están todos' : `se encontraron ${encontrados.length}`} en la base y suman ${pesos(totalViejos)}. Los nuevos suman ${pesos(total)}${tasa !== null ? `: la diferencia es ${pesos(total - totalViejos)} (${porcentaje(tasa * 100)})` : ''}.`,
      cuenta:
        totalViejos > 0
          ? { baseCentavos: totalViejos, tasaPorcentaje: tasa !== null ? Math.round(tasa * 10_000) / 100 : null, esperadoCentavos: totalViejos, diferenciaCentavos: total - totalViejos, redondeoCheques: null }
          : null,
      ...conCheques(docs),
      avisos,
      confirmar:
        encontrados.length > 0 && grupo.some((d) => d.renovacionDe.length === 0)
          ? confirmarRenovacion(propuesta.viejos.map((v) => v.numeroObs))
          : null,
    },
  ]
}

function hipotesisSobreRenovaciones(grupo: ChequeOcasionalDoc[], total: number, ctx: Contexto): HipotesisRevisar[] {
  const primero = grupo[0]!
  const emision = primero.fechaEmision
  if (!emision) return []
  const tolerancia = TOLERANCIA_POR_CHEQUE_CENTAVOS * grupo.length
  const delGrupo = new Set(grupo.map((d) => d.numeroCheque))
  const res: HipotesisRevisar[] = []

  for (const op of ctx.operaciones) {
    if (!op.vinculada || !op.fechaEmision) continue
    const d = dias(op.fechaEmision, emision)
    if (d < -DIAS_ADELANTE_RENOVACION || d > DIAS_ATRAS_RENOVACION) continue
    if (op.chequesNuevos.some((c) => delGrupo.has(c.numeroCheque)) || op.chequesViejos.some((c) => delGrupo.has(c.numeroCheque))) continue
    if (!mismoBeneficiario(op, primero, ctx.catalogo)) continue

    const mismoDia = d === 0
    const cuando = mismoDia ? 'del mismo día' : `del ${fechaCorta(op.fechaEmision)}`
    const docsDe = (lista: { numeroCheque: string }[]): ChequeOcasionalDoc[] =>
      lista.map((c) => ctx.porNumero.get(numeroCorto(c.numeroCheque))).filter((x): x is ChequeOcasionalDoc => x !== undefined)

    // 1) El total es justo el interés de esa renovación (nuevos − viejos).
    if (op.interesCentavos > 0 && Math.abs(op.interesCentavos - total) <= tolerancia) {
      res.push(
        deDetalle(
          {
            tipo: 'interes_renovacion',
            titulo: `Es justo el interés de la renovación ${cuando}`,
            explicacion: `En esa renovación los cheques nuevos (${pesos(op.totalNuevosCentavos)}) superan a los viejos (${pesos(op.totalViejosCentavos)}) por ${pesos(op.interesCentavos)}, que es lo que suma este grupo.`,
            ...conCheques(docsDe(op.chequesNuevos)),
          },
          grupo,
          detalleRestaRenovacion(grupo, op, ctx),
        ),
      )
    }

    // 2) El total es un % redondo de los cheques viejos o de los nuevos de esa renovación.
    for (const [cual, base, lista] of [
      ['viejos', op.totalViejosCentavos, op.chequesViejos],
      ['nuevos', op.totalNuevosCentavos, op.chequesNuevos],
    ] as const) {
      const bp = tasaRedonda(base, total, tolerancia)
      if (bp === null) continue
      const esperado = Math.round((base * bp) / 10_000)
      const esDiferencia = bp <= TASA_MAX_DIFERENCIA_BP && !mismoDia
      res.push(
        deDetalle(
          {
            tipo: esDiferencia ? 'diferencia' : 'interes_renovacion',
            titulo: `${esDiferencia ? 'Diferencia' : 'Interés'} del ${porcentaje(bp / 100)} sobre los cheques ${cual} de la renovación ${cuando}`,
            explicacion: `Los ${plural(lista.length, 'cheque', 'cheques')} ${cual} de esa renovación suman ${pesos(base)}. El ${porcentaje(bp / 100)} de eso es ${pesos(esperado)} y este grupo suma ${pesos(total)}.`,
            ...conCheques(docsDe(lista)),
          },
          grupo,
          detallePorcentajeRenovacion(grupo, op, cual, bp, esDiferencia ? 'diferencia' : 'porcentaje_renovacion', ctx),
        ),
      )
    }
  }
  return res
}

function tituloPosicion(d: DetalleInteres, proveedor: string): string {
  if (d.forma === 'mes_vencimiento') {
    const t = d.tramos[0]!
    return `Interés del ${porcentaje(d.tasaPorcentaje)} mensual, ${plural(d.periodos, 'mes', 'meses')}, sobre ${t.baseDescripcion.replace('lo que vence', `lo que ${proveedor} tiene venciendo`)}`
  }
  const renovaciones = d.tramos.map((t) => t.renovacion)
  const fechas = new Set(renovaciones.map((r) => r?.fechaEmision ?? null))
  const cuantas = d.tramos.length > 1 ? `, de ${d.tramos.length} operaciones` : ''
  let de = ''
  if (renovaciones.every((r) => r !== null) && fechas.size === 1) {
    de = ` (${d.tramos.length > 1 ? 'renovaciones' : 'renovación'} del ${fechaCorta(renovaciones[0]!.fechaEmision)})`
  } else if (d.tramos.length === 1) {
    de = ` (${d.tramos[0]!.baseDescripcion})`
  }
  return `Interés del ${porcentaje(d.tasaPorcentaje)} sobre el capital que vence el mismo día${cuantas}${de}`
}

/**
 * Interés pagado aparte sobre lo que el proveedor tiene por vencer. Finanzas confirmó (11/2026) que en una renovación,
 * para no reemitir todo, a veces los cheques nuevos salen por el mismo importe y la diferencia (el interés) se emite
 * aparte en varios cheques. Por eso la base puede incluir cheques de compras en dólares sin que sea raro.
 */
function hipotesisInteresPosicion(grupo: ChequeOcasionalDoc[], proveedor: string, ctx: Contexto): HipotesisRevisar[] {
  if (grupo.some((d) => d.esRenovacion)) return []
  const sinUsd = sugerirInteres(grupo, ctx.todos, ctx.catalogo)
  const s = sinUsd ?? sugerirInteres(grupo, ctx.todos, ctx.catalogo, { incluirUsd: true })
  if (!s) return []
  const conUsd = sinUsd === null
  const lotes = s.operaciones
    .map((o) => `${plural(o.cantidadCheques, 'cheque', 'cheques')} del ${fechaCorta(o.fechaEmision)}${o.obs ? ` ("${o.obs}")` : ''} por ${pesos(o.montoCentavos)}`)
    .join('; ')
  const d = s.forma === 'mes_vencimiento' ? detalleMesVencimiento(grupo, s, ctx, conUsd) : detalleMismoVencimiento(grupo, s, ctx, conUsd)
  return [
    deDetalle(
      {
        tipo: 'interes_posicion',
        titulo: tituloPosicion(d, proveedor),
        explicacion: `La base sale de: ${lotes}.`,
        cheques: [],
        chequesTotal: s.cantidadChequesBase,
        nota: conUsd
          ? 'La base incluye cheques de compras en dólares. Es normal: cuando se renueva sin reemitir todo, el interés sale aparte en varios cheques.'
          : null,
      },
      grupo,
      d,
    ),
  ]
}

/** Diferencia contra la base de un interés ya sugerido a otros cheques del mismo proveedor. */
function hipotesisDiferenciaDeInteres(grupo: ChequeOcasionalDoc[], total: number, ctx: Contexto): HipotesisRevisar[] {
  const primero = grupo[0]!
  const emision = primero.fechaEmision
  if (!emision) return []
  const tolerancia = TOLERANCIA_POR_CHEQUE_CENTAVOS * grupo.length
  const enGrupo = new Set(grupo)
  const vistas = new Set<string>()
  const res: HipotesisRevisar[] = []
  for (const d of ctx.todos) {
    const s = d.interesSugerido
    if (!s || d.baja || enGrupo.has(d) || !d.fechaEmision) continue
    const clave = `${claveOperacion(d)}|${s.baseCentavos}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    const dd = dias(d.fechaEmision, emision)
    if (dd < 0 || dd > DIAS_ATRAS_RENOVACION || !mismoBeneficiario(d, primero, ctx.catalogo)) continue
    const bp = tasaRedonda(s.baseCentavos, total, tolerancia)
    if (bp === null || bp > TASA_MAX_DIFERENCIA_BP) continue
    const esperado = Math.round((s.baseCentavos * bp) / 10_000)
    res.push(
      deDetalle(
        {
          tipo: 'diferencia',
          titulo: `Diferencia del ${porcentaje(bp / 100)} sobre la misma base que los intereses del ${fechaCorta(d.fechaEmision)}`,
          explicacion: `Los intereses del ${fechaCorta(d.fechaEmision)}${d.obsOriginal.trim() ? ` ("${d.obsOriginal.trim()}")` : ''} se calcularon al ${porcentaje(s.tasaPorcentaje)} sobre ${pesos(s.baseCentavos)}. El ${porcentaje(bp / 100)} de esa base es ${pesos(esperado)} y este grupo suma ${pesos(total)}.`,
          ...conCheques(ctx.todos.filter((x) => !x.baja && claveOperacion(x) === claveOperacion(d))),
        },
        grupo,
        detalleDiferenciaDeInteres(grupo, s, d.fechaEmision, bp, ctx),
      ),
    )
  }
  if (res.length > 1) for (const h of res) h.avisos.push('Coincide con más de una base: hay que confirmar cuál es')
  return res
}

const porcentajeCorto = (p: number): string => `${p.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`

/** Lo que dice la cuenta de dólares, en una línea, para los avisos. */
function avisosDolares(d: DetalleDolares): string[] {
  switch (d.lectura) {
    case 'faltan_cheques':
      return [`Los cheques suman ${pesos(-d.diferenciaCentavos)} menos que dólares × cotización: puede haber más cheques de esta operación con otra emisión u otro OBS`]
    case 'sin_plazo':
      return [
        d.plazoPromedioDias !== null && d.plazoPromedioDias < 7
          ? `Los cheques suman ${porcentajeCorto(d.recargoPorcentaje)} más y vencen enseguida: no es interés por plazo. Puede ser otra cotización ($${d.cotizacionEfectiva.toLocaleString('es-AR', { maximumFractionDigits: 2 })}) o un costo de la operación`
          : `Los cheques suman ${porcentajeCorto(d.recargoPorcentaje)} más: da una tasa mensual muy alta para ser interés por plazo`,
      ]
    case 'interes_por_plazo':
      return d.rangoProveedor && d.mensualPorcentaje !== null && (d.mensualPorcentaje < d.rangoProveedor.min - 2 || d.mensualPorcentaje > d.rangoProveedor.max + 2)
        ? [`La tasa (${porcentajeCorto(d.mensualPorcentaje)} mensual) está fuera de lo que suele cobrar este proveedor`]
        : []
    default:
      return []
  }
}

function hipotesisDolares(grupo: ChequeOcasionalDoc[], ctx: Contexto): HipotesisRevisar[] {
  const usd = usdDelGrupo(grupo)
  const d = armarDetalleDolares(grupo, ctx)
  if (!usd || !d) return []
  const yaCargado = grupo.every((x) => x.operacionUsd)
  const montoUsd = usd.montoUsd.toLocaleString('es-AR')
  const cotizacion = usd.cotizacion.toLocaleString('es-AR')
  return [
    {
      tipo: 'dolares',
      fuerza:
        d.lectura === 'justo' || (d.lectura === 'tasa_redonda' && d.tasaRedonda?.ajuste === 'al_peso')
          ? 'fuerte'
          : d.lectura === 'sin_plazo'
            ? 'debil'
            : 'posible',
      titulo:
        d.lectura === 'tasa_redonda'
          ? `Operación en dólares: US$ ${montoUsd} a ${cotizacion}, con ${porcentaje(d.tasaRedonda!.tasaMensualPorcentaje)} mensual de interés`
          : `Operación en dólares: US$ ${montoUsd} a ${cotizacion}`,
      explicacion: `${yaCargado ? 'Ya está cargada como operación en dólares. ' : 'El OBS se lee como dólares y cotización. '}US$ ${montoUsd} × ${cotizacion} = ${pesos(d.capitalCentavos)}; los ${plural(grupo.length, 'cheque suma', 'cheques suman')} ${pesos(d.totalChequesCentavos)}.`,
      cuenta: {
        baseCentavos: d.capitalCentavos,
        tasaPorcentaje: null,
        esperadoCentavos: d.capitalCentavos,
        diferenciaCentavos: d.diferenciaCentavos,
        redondeoCheques: d.redondeoCheques,
      },
      cheques: [],
      chequesTotal: 0,
      avisos: avisosDolares(d),
      detalleDolares: d,
      confirmar: yaCargado
        ? null
        : {
            tipo: 'usd',
            datos: { usd },
            etiqueta: 'Guardar como operación en dólares',
            efecto: 'Queda como operación en dólares con esos dólares y esa cotización, y sale de A revisar.',
          },
    },
  ]
}

/** Cheques del proveedor que salieron (se conciliaron o vencían) en los días de la emisión y nadie renovó todavía. */
function hipotesisOrigenPosible(grupo: ChequeOcasionalDoc[], total: number, ctx: Contexto): HipotesisRevisar[] {
  const primero = grupo[0]!
  const emision = primero.fechaEmision
  // Un cheque de interés no reemplaza a otros: no se le busca origen como si fuera una renovación.
  if (!emision || grupo.some((d) => d.renovacionDe.length > 0 || d.rolEnOperacion === 'interes')) return []
  const enGrupo = new Set(grupo)
  const candidatos = ctx.todos.filter((d) => {
    if (d.baja || enGrupo.has(d) || d.montoCentavos <= 0 || !d.fechaEmision || d.fechaEmision >= emision) return false
    if ((d.renovadoPor ?? []).length > 0) return false
    const porConciliado = d.fechaConciliado !== null && Math.abs(dias(d.fechaConciliado, emision)) <= DIAS_CONCILIADO_ORIGEN
    const porVencimiento = d.fechaVencimiento !== null && Math.abs(dias(d.fechaVencimiento, emision)) <= DIAS_VENCIMIENTO_ORIGEN
    if (!porConciliado && !porVencimiento) return false
    return mismoBeneficiario(d, primero, ctx.catalogo)
  })
  if (candidatos.length === 0) return []

  const lotes = new Map<string, ChequeOcasionalDoc[]>()
  for (const d of candidatos) lotes.set(claveOperacion(d), [...(lotes.get(claveOperacion(d)) ?? []), d])
  const conjuntos: { docs: ChequeOcasionalDoc[]; nombre: string }[] = [...lotes.values()].map((docs) => ({
    docs,
    nombre: `${plural(docs.length, 'cheque', 'cheques')} del lote emitido el ${fechaCorta(docs[0]!.fechaEmision)}${docs[0]!.obsOriginal.trim() ? ` ("${docs[0]!.obsOriginal.trim()}")` : ''}`,
  }))
  if (lotes.size > 1) conjuntos.push({ docs: candidatos, nombre: `${plural(candidatos.length, 'cheque', 'cheques')} de ${lotes.size} lotes juntos` })

  const res: HipotesisRevisar[] = []
  for (const { docs, nombre } of conjuntos) {
    const base = suma(docs)
    const tasa = (total - base) / base
    if (tasa < 0 || tasa > TASA_MAX_RENOVACION) continue
    res.push({
      tipo: 'origen_posible',
      fuerza: 'posible',
      titulo: `Puede venir de ${nombre}`,
      explicacion: `Esos cheques se cobraron o vencían en los días de la emisión (${fechaCorta(emision)}) y nadie los renovó todavía. Suman ${pesos(base)}; si este grupo los reemplaza, el interés sería ${pesos(total - base)} (${porcentaje(tasa * 100)}).`,
      cuenta: { baseCentavos: base, tasaPorcentaje: Math.round(tasa * 10_000) / 100, esperadoCentavos: base, diferenciaCentavos: total - base, redondeoCheques: null },
      ...conCheques(docs),
      avisos: [],
      confirmar: confirmarRenovacion(docs.map((d) => numeroCorto(d.numeroCheque))),
    })
  }
  // El que deja menos interés suele ser el reemplazo más parejo: va primero.
  return res.sort((a, b) => (a.cuenta!.diferenciaCentavos - b.cuenta!.diferenciaCentavos)).slice(0, 5)
}

/**
 * Dos caminos distintos pueden llegar a la misma cuenta: "8 % de lo que vence el mismo día" y "8 % de los cheques nuevos
 * de la renovación del 08/09" son la misma base cuando esos cheques nuevos son lo que vence ese día. Se deja solo la
 * primera (las hipótesis ya vienen ordenadas de más fuerte a más débil).
 */
function primeraDeCadaCuenta(): (h: HipotesisRevisar) => boolean {
  const vistas = new Set<string>()
  return (h) => {
    const d = h.detalleInteres
    if (!d) return true
    const tramos = d.tramos
      .map((t) => `${t.baseCentavos}|${t.renovacion?.fechaEmision ?? ''}|${t.renovacion?.obs ?? ''}|${[...t.chequesInteres].sort().join(',')}`)
      .sort()
      .join(';')
    const clave = `${d.tasaPorcentaje}|${d.porMes}|${d.periodos}|${tramos}`
    if (vistas.has(clave)) return false
    vistas.add(clave)
    return true
  }
}

/** Arma el análisis de un grupo (todos los cheques de la misma operación, estén o no a revisar). */
function analizarGrupo(grupo: ChequeOcasionalDoc[], ctx: Contexto): GrupoARevisar {
  const primero = grupo[0]!
  const total = suma(grupo)
  const proveedor = resolverProveedor(primero.beneficiario, primero.beneficiarioNormalizado, ctx.catalogo)
  const enGrupo = new Set(grupo)

  const mismoDia = new Map<string, OperacionDelMismoDia>()
  if (primero.fechaEmision) {
    for (const d of ctx.todos) {
      if (d.baja || enGrupo.has(d) || d.fechaEmision !== primero.fechaEmision || !mismoBeneficiario(d, primero, ctx.catalogo)) continue
      const obs = d.obsOriginal.trim()
      const op = mismoDia.get(obs) ?? { obs, cantidadCheques: 0, totalCentavos: 0 }
      op.cantidadCheques += 1
      op.totalCentavos += d.montoCentavos
      mismoDia.set(obs, op)
    }
  }

  const porcentajeDe = (base: number): number | null => (base > 0 ? Math.round((total / base) * 10_000) / 100 : null)
  const docsDe = (lista: { numeroCheque: string }[]): ChequeOcasionalDoc[] =>
    lista.map((c) => ctx.porNumero.get(numeroCorto(c.numeroCheque))).filter((x): x is ChequeOcasionalDoc => x !== undefined)
  const delGrupo = new Set(grupo.map((d) => d.numeroCheque))
  const renovacionesDelDia: RenovacionDelDia[] = ctx.operaciones
    .filter(
      (op) =>
        primero.fechaEmision !== null
        && op.fechaEmision === primero.fechaEmision
        && !op.chequesNuevos.some((c) => delGrupo.has(c.numeroCheque))
        && mismoBeneficiario(op, primero, ctx.catalogo),
    )
    .map((op) => ({
      obs: op.obsOriginal.trim(),
      vinculada: op.vinculada,
      viejos: docsDe(op.chequesViejos).map(evidencia),
      nuevos: docsDe(op.chequesNuevos).map(evidencia),
      totalViejosCentavos: op.totalViejosCentavos,
      totalNuevosCentavos: op.totalNuevosCentavos,
      interesCentavos: op.interesCentavos,
      tasaPorcentaje: op.vinculada ? Math.round(op.tasaImplicita * 10_000) / 100 : null,
      grupoSobreViejosPorcentaje: porcentajeDe(op.totalViejosCentavos),
      grupoSobreNuevosPorcentaje: porcentajeDe(op.totalNuevosCentavos),
      diasRenovacion: op.diasRenovacion,
    }))

  const hipotesis = [
    ...hipotesisRenovacionObs(grupo, total, ctx),
    ...hipotesisDolares(grupo, ctx),
    ...hipotesisSobreRenovaciones(grupo, total, ctx),
    ...hipotesisInteresPosicion(grupo, proveedor.nombre, ctx),
    ...hipotesisDiferenciaDeInteres(grupo, total, ctx),
    ...hipotesisOrigenPosible(grupo, total, ctx),
  ]
    .sort((a, b) => ORDEN_FUERZA[a.fuerza] - ORDEN_FUERZA[b.fuerza])
    .filter(primeraDeCadaCuenta())
  for (const h of hipotesis) {
    if (h.cuenta && h.cuenta.redondeoCheques === null && h.tipo !== 'renovacion_obs' && h.tipo !== 'origen_posible') {
      h.cuenta.redondeoCheques = chequesDeRedondeo(h.cuenta.diferenciaCentavos, grupo.length)
    }
  }

  return {
    id: `oca-${primero.vientriId}`,
    beneficiario: primero.beneficiario,
    proveedor: proveedor.nombre,
    proveedorCargado: proveedor.proveedorId !== null,
    fechaEmision: primero.fechaEmision,
    obs: primero.obsOriginal.trim(),
    cantidadCheques: grupo.length,
    totalCentavos: total,
    motivos: [...new Set(grupo.flatMap((d) => d.revisar))],
    cheques: grupo.map((d) => ({ ...evidencia(d), id: `oca-${d.vientriId}`, aRevisar: d.revisar.length > 0 })),
    renovacionesDelDia,
    mismoDia: [...mismoDia.values()].sort((a, b) => b.totalCentavos - a.totalCentavos),
    hipotesis,
  }
}

/**
 * Todos los grupos con algún cheque a revisar, cada uno con sus hipótesis. `operaciones` son las renovaciones ya
 * armadas (`agruparOperacionesRenovacion`). Orden: emisión más nueva primero.
 */
export function analizarARevisar(
  todosCrudos: ChequeOcasionalDoc[],
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo>,
  operaciones: OperacionRenovacion[],
): GrupoARevisar[] {
  const todos = todosCrudos.filter((d) => !d.baja)
  const porNumero = new Map<string, ChequeOcasionalDoc>()
  for (const d of todos) if (d.numeroCheque) porNumero.set(numeroCorto(d.numeroCheque), d)
  const ctx: Contexto = { todos, catalogo, operaciones, porNumero }

  const grupos = new Map<string, ChequeOcasionalDoc[]>()
  for (const d of todos) grupos.set(claveOperacion(d), [...(grupos.get(claveOperacion(d)) ?? []), d])

  return [...grupos.values()]
    .filter((g) => g.some((d) => d.revisar.length > 0))
    .map((g) => g.slice().sort((a, b) => numeroCorto(a.numeroCheque).localeCompare(numeroCorto(b.numeroCheque))))
    .map((g) => analizarGrupo(g, ctx))
    .sort((a, b) => (b.fechaEmision ?? '').localeCompare(a.fechaEmision ?? '') || b.totalCentavos - a.totalCentavos)
}
