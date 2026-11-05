import type {
  ChequeOcasionalDoc,
  DatosOperacionManual,
  RolEnOperacion,
  SugerenciaOperacion,
  TipoOperacionManual,
} from './cheque-ocasional.types.js'
import { parsearUsdSuelto } from './parsear-obs.js'

/**
 * Aprendizaje de cheques ocasionales: cada vez que Finanzas marca a mano el tipo de operación de un cheque,
 * se guarda un patrón por beneficiario + formato del OBS (los números no cuentan: "65000 TC1435" y
 * "30000 TC1440" son el mismo formato). Con eso:
 *  - a los cheques nuevos con el mismo formato se les propone el mismo tipo (nunca se aplica solo), y
 *  - se guardan los valores habituales (por ahora la cotización) para avisar cuando uno se sale de lo normal.
 */

/** Textos de `revisar` que agrega el aprendizaje. Se reconocen por el comienzo para poder recalcularlos. */
export const REVISAR_SUGERENCIA_PREFIJO = 'Sugerencia: '
export const REVISAR_FUERA_DE_LO_HABITUAL_PREFIJO = 'Fuera de lo habitual'

/** A partir de cuántas confirmaciones se usan los valores habituales para avisar. */
export const MIN_CONFIRMACIONES_VALORES = 3
/** Margen sobre el rango aprendido antes de avisar (10 %). */
const MARGEN_VALORES = 0.1

export const ETIQUETA_TIPO: Record<TipoOperacionManual, string> = {
  usd: 'operación en dólares',
  renovacion: 'renovación',
  rol: 'interés / capital',
}

const ETIQUETA_ROL: Record<Exclude<RolEnOperacion, null>, string> = {
  capital: 'capital',
  interes: 'interés',
  mixto: 'capital + interés',
}

export interface PatronOcasional {
  beneficiarioNormalizado: string
  tipo: TipoOperacionManual
  /** OBS en minúsculas, sin acentos, con cada número reemplazado por "#". */
  forma: string
  /** Último OBS confirmado, para mostrar. */
  ejemplo: string
  confirmaciones: number
  rol: Exclude<RolEnOperacion, null> | null
  cotizacionMin: number | null
  cotizacionMax: number | null
  montoUsdMin: number | null
  montoUsdMax: number | null
}

export function formaObs(obs: string | null | undefined): string {
  return (obs ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\d[\d.,]*/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Id de Firestore del patrón ('/' no está permitido en un id). */
export function idPatron(p: Pick<PatronOcasional, 'beneficiarioNormalizado' | 'tipo' | 'forma'>): string {
  return `${p.tipo}|${p.beneficiarioNormalizado}|${p.forma}`.replace(/\//g, '-').slice(0, 700)
}

/**
 * Cheques que son la misma operación que `elegido`: mismo beneficiario, misma fecha de emisión y OBS idéntico
 * (las cuotas que se emitieron juntas). Incluye al elegido; no incluye los dados de baja.
 */
export function chequesDeLaMismaOperacion<T extends ChequeOcasionalDoc>(elegido: T, todos: T[]): T[] {
  const obs = elegido.obsOriginal.trim()
  return todos.filter(
    (d) =>
      d === elegido
      || (!d.baja
        && d.beneficiarioNormalizado === elegido.beneficiarioNormalizado
        && d.fechaEmision === elegido.fechaEmision
        && d.obsOriginal.trim() === obs),
  )
}

/** Números de cheque que aparecen en el OBS (6 dígitos o más), para proponer qué cheques renueva. */
export function numerosDeChequeEnObs(obs: string): string[] {
  const vistos = new Set<string>()
  for (const m of obs.matchAll(/\d[\d.]{5,}/g)) {
    const n = m[0].replace(/\./g, '')
    if (n.length >= 6) vistos.add(n)
  }
  return [...vistos]
}

export type ResultadoValidacion = { ok: true; datos: DatosOperacionManual } | { ok: false; error: string }

/** Valida lo que manda la pantalla. Para USD, si no vienen los números se leen del OBS ("65000 TC1435"). */
export function validarClasificacion(tipo: unknown, datosRaw: unknown, obs: string): ResultadoValidacion {
  const datos = (datosRaw ?? {}) as Record<string, unknown>
  if (tipo === 'usd') {
    const usdRaw = datos.usd as { montoUsd?: unknown; cotizacion?: unknown } | undefined
    const usd = usdRaw
      ? { montoUsd: Number(usdRaw.montoUsd), cotizacion: Number(usdRaw.cotizacion) }
      : parsearUsdSuelto(obs)
    if (!usd) return { ok: false, error: 'Indicá los dólares y la cotización (el OBS no los dice en un formato conocido)' }
    if (!Number.isFinite(usd.montoUsd) || usd.montoUsd <= 0) return { ok: false, error: 'Los dólares tienen que ser un número mayor a cero' }
    if (!Number.isFinite(usd.cotizacion) || usd.cotizacion <= 0) return { ok: false, error: 'La cotización tiene que ser un número mayor a cero' }
    return { ok: true, datos: { usd } }
  }
  if (tipo === 'renovacion') {
    const ids = Array.isArray(datos.chequeIds)
      ? [...new Set(datos.chequeIds.map((x) => String(x).trim()).filter(Boolean))]
      : []
    if (ids.length === 0) return { ok: false, error: 'Indicá qué cheque o cheques renueva' }
    if (ids.some((x) => !/^[\d-]{4,}$/.test(x))) return { ok: false, error: 'Los números de cheque solo pueden tener dígitos y guiones' }
    return { ok: true, datos: { chequeIds: ids } }
  }
  if (tipo === 'rol') {
    if (datos.rol !== 'capital' && datos.rol !== 'interes' && datos.rol !== 'mixto') {
      return { ok: false, error: 'Elegí si es capital, interés o las dos cosas' }
    }
    return { ok: true, datos: { rol: datos.rol } }
  }
  return { ok: false, error: 'Tipo de operación desconocido' }
}

/** Campos del cheque que cambia cada tipo de operación. */
export function camposDeLaClasificacion(
  tipo: TipoOperacionManual,
  datos: DatosOperacionManual,
): Partial<Pick<ChequeOcasionalDoc, 'operacionUsd' | 'renovacionDe' | 'esRenovacion' | 'rolEnOperacion'>> {
  if (tipo === 'usd') return { operacionUsd: datos.usd! }
  if (tipo === 'renovacion') return { renovacionDe: datos.chequeIds!, esRenovacion: true }
  return { rolEnOperacion: datos.rol! }
}

/** ¿El cheque ya tiene cargado este tipo de operación? Entonces no se le propone ni se le pisa en grupo. */
export function yaTieneTipo(doc: ChequeOcasionalDoc, tipo: TipoOperacionManual): boolean {
  if (tipo === 'usd') return doc.operacionUsd != null
  if (tipo === 'renovacion') return (doc.renovacionDe ?? []).length > 0
  return doc.rolEnOperacion != null
}

const minimo = (a: number | null, b: number) => (a === null ? b : Math.min(a, b))
const maximo = (a: number | null, b: number) => (a === null ? b : Math.max(a, b))

/** Suma una confirmación al patrón de este beneficiario + formato de OBS + tipo. */
export function aprenderPatron(
  previo: PatronOcasional | null,
  doc: Pick<ChequeOcasionalDoc, 'beneficiarioNormalizado' | 'obsOriginal'>,
  tipo: TipoOperacionManual,
  datos: DatosOperacionManual,
): PatronOcasional {
  const base: PatronOcasional = previo ?? {
    beneficiarioNormalizado: doc.beneficiarioNormalizado,
    tipo,
    forma: formaObs(doc.obsOriginal),
    ejemplo: doc.obsOriginal,
    confirmaciones: 0,
    rol: null,
    cotizacionMin: null,
    cotizacionMax: null,
    montoUsdMin: null,
    montoUsdMax: null,
  }
  const p: PatronOcasional = { ...base, ejemplo: doc.obsOriginal.trim(), confirmaciones: base.confirmaciones + 1 }
  if (datos.rol) p.rol = datos.rol
  if (datos.usd) {
    p.cotizacionMin = minimo(p.cotizacionMin, datos.usd.cotizacion)
    p.cotizacionMax = maximo(p.cotizacionMax, datos.usd.cotizacion)
    p.montoUsdMin = minimo(p.montoUsdMin, datos.usd.montoUsd)
    p.montoUsdMax = maximo(p.montoUsdMax, datos.usd.montoUsd)
  }
  return p
}

function datosSugeridos(doc: ChequeOcasionalDoc, p: PatronOcasional): DatosOperacionManual | null {
  if (p.tipo === 'usd') {
    const usd = parsearUsdSuelto(doc.obsOriginal)
    return usd ? { usd } : null
  }
  if (p.tipo === 'renovacion') return { chequeIds: numerosDeChequeEnObs(doc.obsOriginal) }
  return p.rol ? { rol: p.rol } : null
}

const formatoNumero = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

function textoSugerencia(s: SugerenciaOperacion): string {
  const casos = s.confirmaciones === 1 ? '1 caso confirmado' : `${s.confirmaciones} casos confirmados`
  let detalle = ''
  if (s.datos.usd) detalle = ` (US$ ${formatoNumero(s.datos.usd.montoUsd)} a TC ${formatoNumero(s.datos.usd.cotizacion)})`
  else if (s.datos.rol) detalle = ` (${ETIQUETA_ROL[s.datos.rol]})`
  return `${REVISAR_SUGERENCIA_PREFIJO}parece ${ETIQUETA_TIPO[s.tipo]}${detalle}, por ${casos} con el mismo OBS`
}

/**
 * Propone el tipo de operación según lo aprendido y avisa si la cotización se sale de lo habitual del
 * beneficiario. No cambia ningún dato de la operación: solo `sugerencia` y los textos propios de `revisar`.
 */
export function aplicarPatrones(doc: ChequeOcasionalDoc, patrones: PatronOcasional[]): ChequeOcasionalDoc {
  const propios = doc.revisar.filter(
    (r) => !r.startsWith(REVISAR_SUGERENCIA_PREFIJO) && !r.startsWith(REVISAR_FUERA_DE_LO_HABITUAL_PREFIJO),
  )
  const delBeneficiario = patrones.filter((p) => p.beneficiarioNormalizado === doc.beneficiarioNormalizado)
  if (doc.baja || delBeneficiario.length === 0) return { ...doc, sugerencia: null, revisar: propios }

  const forma = formaObs(doc.obsOriginal)
  let sugerencia: SugerenciaOperacion | null = null
  for (const p of delBeneficiario) {
    if (p.forma !== forma || yaTieneTipo(doc, p.tipo)) continue
    if (sugerencia && sugerencia.confirmaciones >= p.confirmaciones) continue
    const datos = datosSugeridos(doc, p)
    if (datos) sugerencia = { tipo: p.tipo, datos, confirmaciones: p.confirmaciones }
  }

  const extra: string[] = []
  if (sugerencia) extra.push(textoSugerencia(sugerencia))

  const usd = delBeneficiario.filter((p) => p.tipo === 'usd' && p.cotizacionMin !== null && p.cotizacionMax !== null)
  const confirmadasUsd = usd.reduce((s, p) => s + p.confirmaciones, 0)
  if (doc.operacionUsd && confirmadasUsd >= MIN_CONFIRMACIONES_VALORES) {
    const min = Math.min(...usd.map((p) => p.cotizacionMin!))
    const max = Math.max(...usd.map((p) => p.cotizacionMax!))
    const tc = doc.operacionUsd.cotizacion
    if (tc < min * (1 - MARGEN_VALORES) || tc > max * (1 + MARGEN_VALORES)) {
      extra.push(
        `${REVISAR_FUERA_DE_LO_HABITUAL_PREFIJO} para ${doc.beneficiario || doc.beneficiarioNormalizado}: TC ${formatoNumero(tc)} (lo habitual es ${formatoNumero(min)} a ${formatoNumero(max)})`,
      )
    }
  }

  return { ...doc, sugerencia, revisar: [...propios, ...extra] }
}
