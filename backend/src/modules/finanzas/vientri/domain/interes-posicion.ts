import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import type { ProveedorDelCatalogo } from './operaciones-usd.js'
import { mismoBeneficiario } from './propuesta-renovacion.js'
import { REVISAR_INTERES_SIN_ORIGEN, REVISAR_SIN_DATOS_FINANCIEROS } from './clasificar-ocasional.js'

/**
 * Cheques de interés pagados aparte ("Intereses" en el OBS, sin decir de qué cheques vienen). Se busca sobre qué
 * cheques del mismo proveedor se calculó el interés, probando tasas redondas hasta que el monto dé al peso:
 *  - mismo vencimiento: cada cheque de interés vence el mismo día que su capital y es un % justo de él
 *    (ej. 8 % sobre la renovación cuyos cheques vencen ese día);
 *  - mes de vencimiento: el interés es un % mensual sobre todo lo que el proveedor tiene venciendo en un mes,
 *    pagado en varios cheques iguales por mes (ej. 6 % mensual sobre lo de enero, 3 cheques por mes).
 * Es solo una sugerencia para que Finanzas la confirme; no cambia ningún dato de la operación.
 */

/** Texto de `revisar` que agrega esta regla. Se reconoce por el comienzo para poder recalcularlo. */
export const REVISAR_INTERES_POSIBLE_PREFIJO = 'Posible interés '

/** Diferencia aceptada entre el monto del cheque y la cuenta (1 peso: los cheques se redondean). */
const TOLERANCIA_CENTAVOS = 100
/** Tasas que se prueban, en centésimos de punto: de 0,25 % a 20 % de a 0,25 %. */
export const TASAS_BP = Array.from({ length: 80 }, (_, i) => (i + 1) * 25)

export interface OperacionDeLaBase {
  fechaEmision: string | null
  obs: string
  cantidadCheques: number
  montoCentavos: number
}

export interface InteresPorVencimiento {
  numeroCheque: string
  fechaVencimiento: string
  baseCentavos: number
  operacion: OperacionDeLaBase
}

export interface SugerenciaInteres {
  forma: 'mismo_vencimiento' | 'mes_vencimiento'
  /** 6 = 6 %. En "mes de vencimiento" es mensual; en "mismo vencimiento" es sobre el capital de ese día. */
  tasaPorcentaje: number
  /** 'YYYY-MM' del mes cuyos vencimientos son la base (solo "mes de vencimiento"). */
  mesBase: string | null
  chequesPorMes: number | null
  meses: number | null
  baseCentavos: number
  cantidadChequesBase: number
  /** De qué operaciones salen los cheques de la base. */
  operaciones: OperacionDeLaBase[]
  /** Solo "mismo vencimiento": la base de cada cheque de interés. */
  porCheque: InteresPorVencimiento[]
  /** Números de los cheques de interés del grupo. */
  chequesInteres: string[]
}

export const coincide = (baseCentavos: number, bp: number, divisor: number, montoCentavos: number) =>
  Math.abs(Math.round((baseCentavos * bp) / 10_000 / divisor) - montoCentavos) <= TOLERANCIA_CENTAVOS

const claveOperacion = (d: ChequeOcasionalDoc) => `${d.fechaEmision ?? ''}|${d.beneficiarioNormalizado}|${d.obsOriginal.trim()}`

function operacionesDe(cheques: ChequeOcasionalDoc[]): OperacionDeLaBase[] {
  const por = new Map<string, OperacionDeLaBase>()
  for (const d of cheques) {
    const k = claveOperacion(d)
    const op = por.get(k) ?? { fechaEmision: d.fechaEmision, obs: d.obsOriginal.trim(), cantidadCheques: 0, montoCentavos: 0 }
    op.cantidadCheques += 1
    op.montoCentavos += d.montoCentavos
    por.set(k, op)
  }
  return [...por.values()].sort((a, b) => (a.fechaEmision ?? '').localeCompare(b.fechaEmision ?? ''))
}

const numerosCortos = (lista: string[]) => lista.map((n) => n.split('-').pop() ?? n)

/**
 * Cheques del proveedor que estaban vivos cuando se emitió el interés: ya emitidos, sin vencer, sin cobrar y
 * no reemplazados todavía por una renovación. Los de interés no cuentan como base. Tampoco los de operaciones en
 * dólares: esos cheques ya traen el interés adentro, así que no se les calcula interés aparte (salvo `incluirUsd`).
 */
export function chequesVivos(
  grupo: ChequeOcasionalDoc[],
  todos: ChequeOcasionalDoc[],
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo>,
  incluirUsd: boolean,
): ChequeOcasionalDoc[] {
  const primero = grupo[0]!
  const emision = primero.fechaEmision!
  const enGrupo = new Set(grupo)
  const emisionPorNumero = new Map<string, string | null>()
  for (const d of todos) emisionPorNumero.set(d.numeroCheque.split('-').pop() ?? d.numeroCheque, d.fechaEmision)

  return todos.filter((d) => {
    if (enGrupo.has(d) || d.baja || d.montoCentavos <= 0 || d.rolEnOperacion === 'interes') return false
    if (!incluirUsd && d.operacionUsd != null) return false
    if (!d.fechaEmision || !d.fechaVencimiento || d.fechaEmision > emision || d.fechaVencimiento < emision) return false
    if (d.fechaConciliado && d.fechaConciliado < emision) return false
    const renovadoAntes = numerosCortos(d.renovadoPor ?? []).some((n) => {
      const f = emisionPorNumero.get(n)
      return f != null && f <= emision
    })
    if (renovadoAntes) return false
    return mismoBeneficiario(d, primero, catalogo)
  })
}

function porMismoVencimiento(grupo: ChequeOcasionalDoc[], vivos: ChequeOcasionalDoc[]): SugerenciaInteres | null {
  // Para cada cheque de interés, las bases posibles: lo que vence ese día, o la operación entera que tiene cheques ese día.
  const candidatas = grupo.map((c) => {
    const delDia = vivos.filter((d) => d.fechaVencimiento === c.fechaVencimiento)
    if (delDia.length === 0) return []
    const bases: ChequeOcasionalDoc[][] = [delDia]
    for (const k of new Set(delDia.map(claveOperacion))) bases.push(vivos.filter((d) => claveOperacion(d) === k))
    return bases
  })
  if (candidatas.some((b) => b.length === 0)) return null

  for (const bp of TASAS_BP) {
    const elegidas: ChequeOcasionalDoc[][] = []
    for (let i = 0; i < grupo.length; i++) {
      const base = candidatas[i]!.find((b) => coincide(b.reduce((s, d) => s + d.montoCentavos, 0), bp, 1, grupo[i]!.montoCentavos))
      if (!base) break
      elegidas.push(base)
    }
    if (elegidas.length !== grupo.length) continue

    const todasLasBases = [...new Set(elegidas.flat())]
    return {
      forma: 'mismo_vencimiento',
      tasaPorcentaje: bp / 100,
      mesBase: null,
      chequesPorMes: null,
      meses: null,
      baseCentavos: todasLasBases.reduce((s, d) => s + d.montoCentavos, 0),
      cantidadChequesBase: todasLasBases.length,
      operaciones: operacionesDe(todasLasBases),
      porCheque: grupo.map((c, i) => ({
        numeroCheque: c.numeroCheque,
        fechaVencimiento: c.fechaVencimiento!,
        baseCentavos: elegidas[i]!.reduce((s, d) => s + d.montoCentavos, 0),
        operacion: operacionesDe(elegidas[i]!)[0]!,
      })),
      chequesInteres: grupo.map((c) => c.numeroCheque),
    }
  }
  return null
}

/** Días entre vencimientos que todavía cuentan como la misma cuota (29/11, 30/11 y 01/12 son una sola). */
const DIAS_MISMA_CUOTA = 5

/** Una cuota del interés: los cheques que vencen juntos (a pocos días) cuentan como el pago de un mes. */
export interface CuotaInteres {
  desde: string
  hasta: string
  cheques: number
  montoCentavos: number
}

/** Agrupa los vencimientos del grupo en cuotas: 29/11, 30/11 y 01/12 son una sola. */
export function cuotasDelInteres(grupo: Pick<ChequeOcasionalDoc, 'fechaVencimiento' | 'montoCentavos'>[]): CuotaInteres[] {
  const ordenados = grupo
    .filter((c): c is typeof c & { fechaVencimiento: string } => c.fechaVencimiento !== null)
    .slice()
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
  const cuotas: CuotaInteres[] = []
  let anterior = -Infinity
  for (const c of ordenados) {
    const v = Date.parse(`${c.fechaVencimiento}T12:00:00Z`)
    if (v - anterior > DIAS_MISMA_CUOTA * 86_400_000) {
      cuotas.push({ desde: c.fechaVencimiento, hasta: c.fechaVencimiento, cheques: 0, montoCentavos: 0 })
    }
    const actual = cuotas[cuotas.length - 1]!
    actual.hasta = c.fechaVencimiento
    actual.cheques += 1
    actual.montoCentavos += c.montoCentavos
    anterior = v
  }
  return cuotas
}

/**
 * Cuántos cheques tiene cada cuota mensual, según cómo se agrupan los vencimientos. Sin esto el monto no alcanza:
 * 3 cheques por mes al 6 % dan lo mismo que 1 cheque por mes al 2 %. Null si las cuotas no son parejas.
 */
function chequesPorCuota(grupo: ChequeOcasionalDoc[]): number | null {
  const cuotas = cuotasDelInteres(grupo).map((c) => c.cheques)
  return cuotas.length > 0 && cuotas.every((n) => n === cuotas[0]) ? cuotas[0]! : null
}

function porMesDeVencimiento(grupo: ChequeOcasionalDoc[], vivos: ChequeOcasionalDoc[]): SugerenciaInteres | null {
  // Solo cuotas iguales: el mismo interés mensual partido en k cheques por mes.
  const monto = grupo[0]!.montoCentavos
  if (grupo.some((c) => c.montoCentavos !== monto)) return null
  const k = chequesPorCuota(grupo)
  if (k === null) return null

  const porMes = new Map<string, ChequeOcasionalDoc[]>()
  for (const d of vivos) {
    const mes = d.fechaVencimiento!.slice(0, 7)
    porMes.set(mes, [...(porMes.get(mes) ?? []), d])
  }

  for (const bp of TASAS_BP) {
    for (const [mes, base] of [...porMes].sort(([a], [b]) => a.localeCompare(b))) {
      const total = base.reduce((s, d) => s + d.montoCentavos, 0)
      if (!coincide(total, bp, k, monto)) continue
      return {
        forma: 'mes_vencimiento',
        tasaPorcentaje: bp / 100,
        mesBase: mes,
        chequesPorMes: k,
        meses: grupo.length / k,
        baseCentavos: total,
        cantidadChequesBase: base.length,
        operaciones: operacionesDe(base),
        porCheque: [],
        chequesInteres: grupo.map((c) => c.numeroCheque),
      }
    }
  }
  return null
}

/** Una base que se probó para un interés en cuotas: qué tasa mensual daría (interés de un mes ÷ base). */
export interface BaseProbada {
  /** 'YYYY-MM' del mes de vencimiento, o null para "todo lo que estaba vivo". */
  mes: string | null
  /** Qué es la base, cuando no es un mes (ej. "la operación del 08/09"). */
  descripcion?: string
  cantidadCheques: number
  baseCentavos: number
  /** Tasa mensual que da, con decimales (6 = 6 %). */
  tasaPorcentaje: number
  /** La tasa es redonda (múltiplo de 0,25 %) y la cuenta cierra al peso en cada cheque. */
  cierra: boolean
}

/**
 * Para un interés pagado en cuotas iguales: la tasa mensual que daría cada base posible (lo que vence en cada mes y
 * todo lo vivo junto), con x = interés de un mes ÷ base. Sirve para mostrar por qué se elige una base y no otra:
 * casi siempre una sola da una tasa redonda. Null si las cuotas no son parejas.
 */
export function basesProbadas(
  grupo: ChequeOcasionalDoc[],
  todos: ChequeOcasionalDoc[],
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo> = new Map(),
  opts: { incluirUsd?: boolean } = {},
): BaseProbada[] | null {
  if (grupo.length === 0 || !grupo[0]!.fechaEmision || grupo.some((c) => !c.fechaVencimiento || c.montoCentavos <= 0)) return null
  const monto = grupo[0]!.montoCentavos
  if (grupo.some((c) => c.montoCentavos !== monto)) return null
  const k = chequesPorCuota(grupo)
  if (k === null) return null
  const vivos = chequesVivos(grupo, todos, catalogo, opts.incluirUsd ?? false)
  if (vivos.length === 0) return null

  const interesPorMes = monto * k
  const probar = (mes: string | null, base: ChequeOcasionalDoc[]): BaseProbada => {
    const total = base.reduce((s, d) => s + d.montoCentavos, 0)
    return {
      mes,
      cantidadCheques: base.length,
      baseCentavos: total,
      tasaPorcentaje: total > 0 ? (interesPorMes / total) * 100 : 0,
      cierra: TASAS_BP.some((bp) => coincide(total, bp, k, monto)),
    }
  }
  const porMes = new Map<string, ChequeOcasionalDoc[]>()
  for (const d of vivos) porMes.set(d.fechaVencimiento!.slice(0, 7), [...(porMes.get(d.fechaVencimiento!.slice(0, 7)) ?? []), d])
  const res = [...porMes].sort(([a], [b]) => a.localeCompare(b)).map(([mes, base]) => probar(mes, base))
  if (porMes.size > 1) res.push(probar(null, vivos))
  return res
}

/**
 * Busca sobre qué cheques del proveedor se calculó un grupo de cheques de interés (mismo beneficiario, emisión y OBS).
 * `incluirUsd` suma a la base los cheques de operaciones en dólares; en teoría no corresponde (ya traen el interés),
 * así que solo se usa para mostrar la coincidencia como dudosa, nunca para la sugerencia que se guarda.
 */
export function sugerirInteres(
  grupo: ChequeOcasionalDoc[],
  todos: ChequeOcasionalDoc[],
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo> = new Map(),
  opts: { incluirUsd?: boolean } = {},
): SugerenciaInteres | null {
  if (grupo.length === 0 || !grupo[0]!.fechaEmision || grupo.some((c) => !c.fechaVencimiento || c.montoCentavos <= 0)) return null
  const vivos = chequesVivos(grupo, todos, catalogo, opts.incluirUsd ?? false)
  if (vivos.length === 0) return null
  return porMismoVencimiento(grupo, vivos) ?? porMesDeVencimiento(grupo, vivos)
}

/**
 * Sugerencias para todos los cheques que tienen el aviso "Interés sin operación de origen". Devuelve una entrada
 * por cheque (los del mismo grupo comparten la sugerencia); los que no tienen sugerencia no aparecen.
 */
export function sugerirInteresesSueltos(
  todos: ChequeOcasionalDoc[],
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo> = new Map(),
): Map<ChequeOcasionalDoc, SugerenciaInteres> {
  const grupos = new Map<string, ChequeOcasionalDoc[]>()
  for (const d of todos) {
    if (d.baja || !d.fechaEmision || !d.revisar.includes(REVISAR_INTERES_SIN_ORIGEN)) continue
    const k = claveOperacion(d)
    grupos.set(k, [...(grupos.get(k) ?? []), d])
  }
  const resultado = new Map<ChequeOcasionalDoc, SugerenciaInteres>()
  for (const grupo of grupos.values()) {
    const s = sugerirInteres(grupo, todos, catalogo)
    if (s) for (const d of grupo) resultado.set(d, s)
  }
  return resultado
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const pesos = (c: number) => `$${Math.round(c / 100).toLocaleString('es-AR')}`
const porcentaje = (p: number) => `${p.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
const fechaCorta = (ymd: string | null) => (ymd ? ymd.split('-').reverse().join('/') : 'sin fecha')
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Texto de `revisar` para un cheque del grupo (en "mismo vencimiento" nombra la base de ese cheque). */
export function textoInteresSugerido(doc: ChequeOcasionalDoc, s: SugerenciaInteres, nombreProveedor: string): string {
  if (s.forma === 'mes_vencimiento') {
    const [anio, mes] = s.mesBase!.split('-')
    const ops = plural(s.operaciones.length, 'operación', 'operaciones')
    const cheques = plural(s.cantidadChequesBase, 'cheque', 'cheques')
    const cuotas = `${plural(s.chequesPorMes!, 'cheque', 'cheques')} por mes`
    return `${REVISAR_INTERES_POSIBLE_PREFIJO}del ${porcentaje(s.tasaPorcentaje)} mensual sobre los cheques de ${nombreProveedor} que vencen en ${MESES[Number(mes) - 1]} de ${anio} (${pesos(s.baseCentavos)} en ${cheques} de ${ops}), ${cuotas}`
  }
  const propio = s.porCheque.find((p) => p.numeroCheque === doc.numeroCheque) ?? s.porCheque[0]!
  return `${REVISAR_INTERES_POSIBLE_PREFIJO}del ${porcentaje(s.tasaPorcentaje)} sobre ${pesos(propio.baseCentavos)} que vencen el mismo día (operación del ${fechaCorta(propio.operacion.fechaEmision)}${propio.operacion.obs ? `, "${propio.operacion.obs}"` : ''})`
}

/**
 * Diferencias de interés: un cheque sin datos (por ejemplo "DIFERENCIA") que es un % chico y justo de la misma base
 * sobre la que ya se calculó un interés del proveedor (ej. el 1 % de lo que vence en enero, 10 días después del 6 %
 * mensual sobre ese mismo enero). Solo se busca contra bases ya usadas por un interés: probado contra todos los meses
 * del proveedor, un cheque común coincide por casualidad con demasiada frecuencia.
 */

/** Texto de `revisar` que agrega esta regla. Reemplaza a "Sin datos de operación financiera". */
export const REVISAR_DIFERENCIA_POSIBLE_PREFIJO = 'Posible diferencia de interés: '

/** Tasas que se prueban para una diferencia, en centésimos de punto: de 0,25 % a 3 % de a 0,25 %. */
const TASAS_DIFERENCIA_BP = Array.from({ length: 12 }, (_, i) => (i + 1) * 25)
/** Días después del interés en los que todavía puede llegar la diferencia. */
const DIAS_MAX_DIFERENCIA = 60
/** Una base múltiplo de $1.000 se considera redonda y no se usa para diferencias. */
const BASE_REDONDA_CENTAVOS = 1_000_00

export interface SugerenciaDiferencia {
  tasaPorcentaje: number
  /** La sugerencia de interés de la que sale la base. */
  interes: SugerenciaInteres
  /** 'YYYY-MM-DD' de emisión de los cheques de interés. */
  fechaEmisionInteres: string
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)

/**
 * Busca diferencias de interés entre los cheques con el aviso "Sin datos de operación financiera", contra las
 * sugerencias de interés ya calculadas (`sugerirInteresesSueltos`). Si un cheque coincide con más de una base, no se
 * adivina: queda sin sugerencia.
 */
export function sugerirDiferenciasDeInteres(
  todos: ChequeOcasionalDoc[],
  intereses: ReadonlyMap<ChequeOcasionalDoc, SugerenciaInteres>,
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo> = new Map(),
): Map<ChequeOcasionalDoc, SugerenciaDiferencia> {
  // Una entrada por sugerencia (los cheques del mismo grupo comparten el objeto), con un cheque del grupo de muestra.
  // Una base redonda ($500.000, $1.200.000) no sirve: cualquier cheque de monto redondo "da justo" un % de ella.
  const bases = new Map<SugerenciaInteres, ChequeOcasionalDoc>()
  for (const [d, s] of intereses) {
    if (bases.has(s) || !d.fechaEmision || d.beneficiarioNormalizado === '' || s.baseCentavos % BASE_REDONDA_CENTAVOS === 0) continue
    bases.set(s, d)
  }

  const resultado = new Map<ChequeOcasionalDoc, SugerenciaDiferencia>()
  if (bases.size === 0) return resultado
  for (const d of todos) {
    if (d.baja || !d.fechaEmision || d.montoCentavos <= 0 || d.beneficiarioNormalizado === '') continue
    if (!d.revisar.includes(REVISAR_SIN_DATOS_FINANCIEROS)) continue
    const encontradas: SugerenciaDiferencia[] = []
    for (const [s, muestra] of bases) {
      const dias = diasEntre(muestra.fechaEmision!, d.fechaEmision)
      if (dias < 0 || dias > DIAS_MAX_DIFERENCIA || !mismoBeneficiario(d, muestra, catalogo)) continue
      const bp = TASAS_DIFERENCIA_BP.find((t) => coincide(s.baseCentavos, t, 1, d.montoCentavos))
      if (bp !== undefined) encontradas.push({ tasaPorcentaje: bp / 100, interes: s, fechaEmisionInteres: muestra.fechaEmision! })
    }
    if (encontradas.length === 1) resultado.set(d, encontradas[0]!)
  }
  return resultado
}

/** Texto de `revisar` para un cheque con diferencia de interés sugerida. */
export function textoDiferenciaSugerida(s: SugerenciaDiferencia): string {
  const i = s.interes
  const sobre = i.forma === 'mes_vencimiento'
    ? (() => {
        const [anio, mes] = i.mesBase!.split('-')
        return `los ${pesos(i.baseCentavos)} que vencen en ${MESES[Number(mes) - 1]} de ${anio}`
      })()
    : pesos(i.baseCentavos)
  return `${REVISAR_DIFERENCIA_POSIBLE_PREFIJO}${porcentaje(s.tasaPorcentaje)} sobre ${sobre} (mismo cálculo que los intereses del ${fechaCorta(s.fechaEmisionInteres)})`
}

/**
 * Pone o saca la diferencia de interés en un cheque. Con sugerencia, el aviso "Sin datos" se reemplaza por el de la
 * diferencia (el cheque sigue a revisar hasta que Finanzas lo confirme); sin sugerencia, solo se saca el texto propio.
 */
export function aplicarDiferenciaSugerida(doc: ChequeOcasionalDoc, s: SugerenciaDiferencia | null): ChequeOcasionalDoc {
  const propios = doc.revisar.filter((r) => !r.startsWith(REVISAR_DIFERENCIA_POSIBLE_PREFIJO))
  if (!s) return { ...doc, revisar: propios }
  return { ...doc, revisar: [...propios.filter((r) => r !== REVISAR_SIN_DATOS_FINANCIEROS), textoDiferenciaSugerida(s)] }
}

/** Pone o saca la sugerencia de interés en un cheque, conservando los demás avisos. */
export function aplicarInteresSugerido(
  doc: ChequeOcasionalDoc,
  s: SugerenciaInteres | null,
  nombreProveedor: string,
): ChequeOcasionalDoc {
  const propios = doc.revisar.filter((r) => !r.startsWith(REVISAR_INTERES_POSIBLE_PREFIJO))
  if (!s) return { ...doc, interesSugerido: null, revisar: propios }
  return { ...doc, interesSugerido: s, revisar: [...propios, textoInteresSugerido(doc, s, nombreProveedor)] }
}
