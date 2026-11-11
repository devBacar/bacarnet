import type { ChequeOcasionalDoc, DatosOperacionManual, OperacionRenovacion, TipoOperacionManual } from './cheque-ocasional.types.js'
import { sugerirInteres, textoInteresSugerido } from './interes-posicion.js'
import { resolverProveedor, type ProveedorDelCatalogo } from './operaciones-usd.js'
import { parsearUsdSuelto } from './parsear-obs.js'
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
export interface CuentaHipotesis {
  baseCentavos: number
  /** 6 = 6 %. Null cuando no hay tasa (dólares). */
  tasaPorcentaje: number | null
  esperadoCentavos: number
  /** Total del grupo − esperado. Cero (o centavos) cuando da justo. */
  diferenciaCentavos: number
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
 * Marcar como interés: solo si el grupo todavía no dice si es interés o capital. Hoy no se guarda sobre qué
 * cheques se calculó, así que el cheque sigue a revisar con el aviso "Interés sin operación de origen".
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
          ? { baseCentavos: totalViejos, tasaPorcentaje: tasa !== null ? Math.round(tasa * 10_000) / 100 : null, esperadoCentavos: totalViejos, diferenciaCentavos: total - totalViejos }
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
      res.push({
        tipo: 'interes_renovacion',
        fuerza: 'fuerte',
        titulo: `Es justo el interés de la renovación ${cuando}`,
        explicacion: `En esa renovación los cheques nuevos (${pesos(op.totalNuevosCentavos)}) superan a los viejos (${pesos(op.totalViejosCentavos)}) por ${pesos(op.interesCentavos)}, que es lo que suma este grupo.`,
        cuenta: { baseCentavos: op.totalViejosCentavos, tasaPorcentaje: Math.round(op.tasaImplicita * 10_000) / 100, esperadoCentavos: op.interesCentavos, diferenciaCentavos: total - op.interesCentavos },
        ...conCheques(docsDe(op.chequesNuevos)),
        avisos: [],
        confirmar: confirmarInteres(grupo),
      })
    }

    // 2) El total es un % redondo de los cheques viejos o de los nuevos de esa renovación.
    for (const [cual, base, lista] of [
      ['viejos', op.totalViejosCentavos, op.chequesViejos],
      ['nuevos', op.totalNuevosCentavos, op.chequesNuevos],
    ] as const) {
      const bp = tasaRedonda(base, total, tolerancia)
      if (bp === null) continue
      const esperado = Math.round((base * bp) / 10_000)
      const redonda = base % BASE_REDONDA_CENTAVOS === 0
      const esDiferencia = bp <= TASA_MAX_DIFERENCIA_BP && !mismoDia
      res.push({
        tipo: esDiferencia ? 'diferencia' : 'interes_renovacion',
        fuerza: redonda ? 'debil' : mismoDia ? 'fuerte' : 'posible',
        titulo: `${esDiferencia ? 'Diferencia' : 'Interés'} del ${porcentaje(bp / 100)} sobre los cheques ${cual} de la renovación ${cuando}`,
        explicacion: `Los ${plural(lista.length, 'cheque', 'cheques')} ${cual} de esa renovación suman ${pesos(base)}. El ${porcentaje(bp / 100)} de eso es ${pesos(esperado)} y este grupo suma ${pesos(total)}.`,
        cuenta: { baseCentavos: base, tasaPorcentaje: bp / 100, esperadoCentavos: esperado, diferenciaCentavos: total - esperado },
        ...conCheques(docsDe(lista)),
        avisos: redonda ? ['La base es un monto redondo: la coincidencia puede ser casualidad'] : [],
        confirmar: confirmarInteres(grupo),
      })
    }
  }
  return res
}

function hipotesisInteresPosicion(grupo: ChequeOcasionalDoc[], total: number, proveedor: string, ctx: Contexto): HipotesisRevisar[] {
  if (grupo.some((d) => d.esRenovacion)) return []
  // Las operaciones en dólares ya traen el interés en sus cheques: no son base. Si solo cierra contándolas, se
  // muestra igual pero como dudosa, para que Finanzas vea la coincidencia y decida.
  const sinUsd = sugerirInteres(grupo, ctx.todos, ctx.catalogo)
  const s = sinUsd ?? sugerirInteres(grupo, ctx.todos, ctx.catalogo, { incluirUsd: true })
  if (!s) return []
  const conUsd = sinUsd === null
  const lotes = s.operaciones
    .map((o) => `${plural(o.cantidadCheques, 'cheque', 'cheques')} del ${fechaCorta(o.fechaEmision)}${o.obs ? ` ("${o.obs}")` : ''} por ${pesos(o.montoCentavos)}`)
    .join('; ')
  // Por mes: la base × tasa se paga una vez por mes. Mismo vencimiento: cada cheque ya dio justo contra su base.
  const esperado = s.forma === 'mes_vencimiento' ? Math.round((s.baseCentavos * s.tasaPorcentaje) / 100) * (s.meses ?? 1) : total
  return [
    {
      tipo: 'interes_posicion',
      fuerza: conUsd ? 'debil' : 'posible',
      titulo: textoInteresSugerido(grupo[0]!, s, proveedor),
      explicacion: `La base sale de: ${lotes}.`,
      cuenta: { baseCentavos: s.baseCentavos, tasaPorcentaje: s.tasaPorcentaje, esperadoCentavos: esperado, diferenciaCentavos: total - esperado },
      cheques: [],
      chequesTotal: s.cantidadChequesBase,
      avisos: conUsd
        ? ['La cuenta solo cierra contando cheques de operaciones en dólares, que en teoría ya traen el interés adentro']
        : [],
      confirmar: confirmarInteres(grupo),
    },
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
    const redonda = s.baseCentavos % BASE_REDONDA_CENTAVOS === 0
    res.push({
      tipo: 'diferencia',
      fuerza: redonda ? 'debil' : 'posible',
      titulo: `Diferencia del ${porcentaje(bp / 100)} sobre la misma base que los intereses del ${fechaCorta(d.fechaEmision)}`,
      explicacion: `Los intereses del ${fechaCorta(d.fechaEmision)}${d.obsOriginal.trim() ? ` ("${d.obsOriginal.trim()}")` : ''} se calcularon al ${porcentaje(s.tasaPorcentaje)} sobre ${pesos(s.baseCentavos)}. El ${porcentaje(bp / 100)} de esa base es ${pesos(esperado)} y este grupo suma ${pesos(total)}.`,
      cuenta: { baseCentavos: s.baseCentavos, tasaPorcentaje: bp / 100, esperadoCentavos: esperado, diferenciaCentavos: total - esperado },
      ...conCheques(ctx.todos.filter((x) => !x.baja && claveOperacion(x) === claveOperacion(d))),
      avisos: redonda ? ['La base es un monto redondo: la coincidencia puede ser casualidad'] : [],
      confirmar: confirmarInteres(grupo),
    })
  }
  if (res.length > 1) for (const h of res) h.avisos.push('Coincide con más de una base: hay que confirmar cuál es')
  return res
}

function hipotesisDolares(grupo: ChequeOcasionalDoc[], total: number): HipotesisRevisar[] {
  const usd = grupo.find((d) => d.operacionUsd)?.operacionUsd ?? parsearUsdSuelto(grupo[0]!.obsOriginal)
  if (!usd) return []
  const esperado = Math.round(usd.montoUsd * usd.cotizacion * 100)
  const diferencia = total - esperado
  const justo = Math.abs(diferencia) <= TOLERANCIA_POR_CHEQUE_CENTAVOS * grupo.length
  const yaCargado = grupo.every((d) => d.operacionUsd)
  const avisos: string[] = []
  if (!justo) {
    avisos.push(
      diferencia < 0
        ? `Los cheques suman ${pesos(-diferencia)} menos: puede haber más cheques de esta operación con otra emisión u otro OBS`
        : `Los cheques suman ${pesos(diferencia)} más: puede incluir interés`,
    )
  }
  return [
    {
      tipo: 'dolares',
      fuerza: justo ? 'fuerte' : 'posible',
      titulo: `Operación en dólares: US$ ${usd.montoUsd.toLocaleString('es-AR')} a ${usd.cotizacion.toLocaleString('es-AR')}`,
      explicacion: `${yaCargado ? 'Ya está cargada como operación en dólares. ' : 'El OBS se lee como dólares y cotización. '}US$ ${usd.montoUsd.toLocaleString('es-AR')} × ${usd.cotizacion.toLocaleString('es-AR')} = ${pesos(esperado)}; los ${plural(grupo.length, 'cheque suma', 'cheques suman')} ${pesos(total)}.`,
      cuenta: { baseCentavos: esperado, tasaPorcentaje: null, esperadoCentavos: esperado, diferenciaCentavos: diferencia },
      cheques: [],
      chequesTotal: 0,
      avisos,
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
      cuenta: { baseCentavos: base, tasaPorcentaje: Math.round(tasa * 10_000) / 100, esperadoCentavos: base, diferenciaCentavos: total - base },
      ...conCheques(docs),
      avisos: [],
      confirmar: confirmarRenovacion(docs.map((d) => numeroCorto(d.numeroCheque))),
    })
  }
  // El que deja menos interés suele ser el reemplazo más parejo: va primero.
  return res.sort((a, b) => (a.cuenta!.diferenciaCentavos - b.cuenta!.diferenciaCentavos)).slice(0, 5)
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
    }))

  const hipotesis = [
    ...hipotesisRenovacionObs(grupo, total, ctx),
    ...hipotesisDolares(grupo, total),
    ...hipotesisSobreRenovaciones(grupo, total, ctx),
    ...hipotesisInteresPosicion(grupo, total, proveedor.nombre, ctx),
    ...hipotesisDiferenciaDeInteres(grupo, total, ctx),
    ...hipotesisOrigenPosible(grupo, total, ctx),
  ].sort((a, b) => ORDEN_FUERZA[a.fuerza] - ORDEN_FUERZA[b.fuerza])

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
