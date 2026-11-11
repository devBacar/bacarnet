import { normalizarNombre } from '../../agenda/domain/normalizar-nombre.js'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import type { ProveedorDelCatalogo } from './operaciones-usd.js'

/**
 * Último recurso para cheques ocasionales que vienen sin destinatario: el nombre suele estar al principio del OBS
 * ("Mana usd60.000 TC1460", "Lio usd20.000 TC1460", "Conta II"). Se toman las palabras del comienzo hasta el
 * primer dato (un número, u$/usd, TC, "renovación", "op"…) y solo se acepta si es un nombre que ya se conoce:
 * un proveedor financiero cargado (nombre o alias) o un beneficiario de otros cheques. Nunca se inventa un nombre.
 */

/** Texto de `revisar` que pone la importación cuando el cheque no trae destinatario. */
export const REVISAR_SIN_DESTINATARIO = 'Sin destinatario'

/** Palabras que ya son datos de la operación, no parte del nombre. */
const PALABRAS_DATO = new Set([
  'u', 'us', 'usd', 'u$', 'u$s', 'us$', 'tc', 'op', 'oper', 'operacion', 'renov', 'renovacion', 'interes', 'intereses',
  'cuota', 'cuotas', 'cap', 'capital', 'ajuste', 'dif', 'diferencia', 'devolucion', 'pago', 'cheque', 'cheques',
  'n', 'nro', 'n°', 'nº', 'y', 'de', 'del', 'por', 'para',
])
/** Más palabras que esto ya no es un nombre. */
const MAX_PALABRAS = 4

export interface BeneficiarioDeObs {
  beneficiario: string
  beneficiarioNormalizado: string
}

/** Nombre normalizado → cómo mostrarlo. Los proveedores cargados mandan sobre cómo está escrito en los cheques. */
export function nombresConocidos(
  docs: Pick<ChequeOcasionalDoc, 'beneficiario' | 'beneficiarioNormalizado' | 'baja'>[],
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo>,
): Map<string, string> {
  // Del cheque: la forma de escribirlo que más se repite.
  const conteo = new Map<string, Map<string, number>>()
  for (const d of docs) {
    if (d.baja || d.beneficiarioNormalizado === '') continue
    const formas = conteo.get(d.beneficiarioNormalizado) ?? new Map<string, number>()
    formas.set(d.beneficiario, (formas.get(d.beneficiario) ?? 0) + 1)
    conteo.set(d.beneficiarioNormalizado, formas)
  }
  const nombres = new Map<string, string>()
  for (const [norm, formas] of conteo) nombres.set(norm, [...formas].sort((a, b) => b[1] - a[1])[0]![0])
  for (const [clave, p] of catalogo) nombres.set(clave, p.nombre)
  return nombres
}

/** Las palabras del comienzo del OBS que pueden ser un nombre (se corta en el primer dato). */
function palabrasDelComienzo(obs: string): string[] {
  const palabras: string[] = []
  for (const crudo of obs.trim().split(/\s+/)) {
    const palabra = crudo.replace(/^[^\p{L}\d$]+|[^\p{L}\d$]+$/gu, '')
    if (palabra === '' || /[\d$]/.test(palabra)) break
    if (PALABRAS_DATO.has(normalizarNombre(palabra))) break
    palabras.push(palabra)
    if (palabras.length === MAX_PALABRAS) break
  }
  return palabras
}

/** El beneficiario según el OBS, o null si el comienzo del OBS no es un nombre conocido. Prueba del más largo al más corto. */
export function beneficiarioDesdeObs(obs: string, conocidos: ReadonlyMap<string, string>): BeneficiarioDeObs | null {
  const palabras = palabrasDelComienzo(obs)
  for (let n = palabras.length; n > 0; n--) {
    const norm = normalizarNombre(palabras.slice(0, n).join(' '))
    const nombre = conocidos.get(norm)
    if (nombre !== undefined) return { beneficiario: nombre, beneficiarioNormalizado: norm }
  }
  return null
}

/**
 * Completa el beneficiario de un cheque sin destinatario con lo que dice el OBS. Si ya se había completado así, se
 * vuelve a calcular (el catálogo puede haber cambiado); si deja de encontrarse, vuelve a quedar sin destinatario.
 */
export function completarBeneficiarioDesdeObs(
  doc: ChequeOcasionalDoc,
  conocidos: ReadonlyMap<string, string>,
): ChequeOcasionalDoc {
  if (!doc.beneficiarioDesdeObs && doc.beneficiarioNormalizado !== '') return doc
  const r = beneficiarioDesdeObs(doc.obsOriginal, conocidos)
  if (r) {
    return {
      ...doc,
      ...r,
      beneficiarioDesdeObs: true,
      revisar: doc.revisar.filter((t) => t !== REVISAR_SIN_DESTINATARIO),
    }
  }
  if (!doc.beneficiarioDesdeObs) return doc
  return {
    ...doc,
    beneficiario: '',
    beneficiarioNormalizado: '',
    beneficiarioDesdeObs: false,
    revisar: doc.revisar.includes(REVISAR_SIN_DESTINATARIO) ? doc.revisar : [...doc.revisar, REVISAR_SIN_DESTINATARIO],
  }
}
