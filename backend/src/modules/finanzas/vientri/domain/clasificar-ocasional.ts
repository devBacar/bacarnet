import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'

/** Textos de `revisar` que agrega la importación. No deben contener "imposible": esa palabra descarta el cheque de las pantallas. */
export const REVISAR_SIN_DATOS_FINANCIEROS = 'Sin datos de operación financiera (renovación, USD, tasa o interés): revisar a mano'
export const REVISAR_INTERES_SIN_ORIGEN = 'Interés sin operación de origen (no dice de qué cheque viene): revisar a mano'
export const REVISAR_PROVEEDOR_NO_CARGADO = 'Proveedor no cargado en Proveedores financieros'

export interface ProveedorEnLista {
  id: string
}

/** Beneficiarios (ya normalizados) que son siempre compra de IVA: CONTA I, II, III, IIII, IV, CONTA 1… */
const BENEFICIARIO_COMPRA_IVA = /^conta\s*[ivx\d]+$/

/** Compra de IVA: el OBS nombra "IVA" como palabra suelta, o el beneficiario es uno de los CONTA. */
export function esCompraIva(beneficiarioNormalizado: string, obsOriginal: string): boolean {
  return BENEFICIARIO_COMPRA_IVA.test(beneficiarioNormalizado) || /\biva\b/i.test(obsOriginal)
}

/**
 * Otros pagos: cheques a personas que no son operaciones financieras (retiros, pagos sueltos).
 * Iván Barrera solo cuando el OBS dice "retiro"; Fabrega Gabriela y Cavazza siempre.
 * Se mira por palabras sueltas para no depender del orden del nombre ("barrera ivan" / "ivan barrera").
 */
export function esOtroPago(beneficiarioNormalizado: string, obsOriginal: string): boolean {
  const palabras = new Set(beneficiarioNormalizado.split(' '))
  if (palabras.has('barrera') && palabras.has('ivan')) return /\bretiro/i.test(obsOriginal)
  if (palabras.has('fabrega') && palabras.has('gabriela')) return true
  return palabras.has('cavazza')
}

/** Clave para juntar los otros pagos de una misma vez: fecha de emisión + OBS + beneficiario. */
export function claveGrupoOtroPago(d: { fechaEmision: string | null; obsOriginal: string; beneficiarioNormalizado: string }): string {
  return `${d.fechaEmision ?? ''}|${d.obsOriginal.trim().toLowerCase()}|${d.beneficiarioNormalizado}`
}

export interface SenalesFinancieras {
  esRenovacion: boolean
  /** Otro cheque lo renueva: es el cheque viejo de una operación, aunque su OBS esté vacío. */
  esRenovadoPorOtro: boolean
  tieneUsd: boolean
  tieneTasaExplicita: boolean
  tieneRol: boolean
  /**
   * El OBS lo marca solo como interés (sin capital ni renovación). Los que dicen "capital"/"cap" (con o sin
   * interés, ej. "INTERESES Y CAP") son la operación inicial de la que salen las renovaciones: no les falta origen.
   */
  esSoloInteres: boolean
  /** Se sabe de dónde viene: renueva a otro cheque, o tiene USD o tasa explícita. */
  tieneOrigen: boolean
}

export interface ClasificacionOcasional {
  esProveedorFinanciero: true
  tipoProveedor: 'financiero'
  proveedorFinancieroId: string | null
  esCompraIva: boolean
  /** Solo los textos que agrega esta regla, en el orden en que se muestran. */
  revisarAgregados: string[]
}

/**
 * Todos los cheques ocasionales son del circuito financiero. El proveedor se engancha por nombre
 * normalizado contra la colección `proveedoresFinancieros`; lo que no esté cargado, o no tenga ninguna
 * señal de operación financiera en el OBS, queda en `revisar` para controlarlo uno por uno.
 */
export function clasificarOcasional(
  beneficiarioNormalizado: string,
  senales: SenalesFinancieras,
  proveedores: Map<string, ProveedorEnLista>,
  obsOriginal = '',
): ClasificacionOcasional {
  const compraIva = esCompraIva(beneficiarioNormalizado, obsOriginal)
  const proveedor = beneficiarioNormalizado !== '' ? proveedores.get(beneficiarioNormalizado) ?? null : null
  const sinSenales =
    !senales.esRenovacion
    && !senales.esRenovadoPorOtro
    && !senales.tieneUsd
    && !senales.tieneTasaExplicita
    && !senales.tieneRol

  // Una compra de IVA no es una operación financiera: no tiene sentido pedir proveedor ni datos de renovación.
  const revisarAgregados: string[] = []
  if (!compraIva) {
    if (beneficiarioNormalizado !== '' && proveedor === null) revisarAgregados.push(REVISAR_PROVEEDOR_NO_CARGADO)
    if (sinSenales) revisarAgregados.push(REVISAR_SIN_DATOS_FINANCIEROS)
    else if (senales.esSoloInteres && !senales.tieneOrigen) revisarAgregados.push(REVISAR_INTERES_SIN_ORIGEN)
  }

  return {
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    proveedorFinancieroId: proveedor?.id ?? null,
    esCompraIva: compraIva,
    revisarAgregados,
  }
}

/** Aplica la regla a un doc ya guardado, usando lo que ya tiene (no hace falta el CSV). Conserva los demás `revisar`. */
export function reclasificarDoc(
  doc: ChequeOcasionalDoc,
  proveedores: Map<string, ProveedorEnLista>,
): ChequeOcasionalDoc {
  const c = clasificarOcasional(
    doc.beneficiarioNormalizado,
    {
      esRenovacion: doc.esRenovacion,
      esRenovadoPorOtro: (doc.renovadoPor ?? []).length > 0,
      tieneUsd: doc.operacionUsd !== null,
      tieneTasaExplicita: doc.tasaExplicita !== null,
      tieneRol: doc.rolEnOperacion !== null,
      esSoloInteres: doc.rolEnOperacion === 'interes',
      tieneOrigen: (doc.renovacionDe ?? []).length > 0 || doc.operacionUsd !== null || doc.tasaExplicita !== null || doc.interesDe != null,
    },
    proveedores,
    doc.obsOriginal,
  )
  const propios = (doc.revisar ?? []).filter(
    (r) => r !== REVISAR_PROVEEDOR_NO_CARGADO && r !== REVISAR_SIN_DATOS_FINANCIEROS && r !== REVISAR_INTERES_SIN_ORIGEN,
  )
  return {
    ...doc,
    esProveedorFinanciero: c.esProveedorFinanciero,
    tipoProveedor: c.tipoProveedor,
    proveedorFinancieroId: c.proveedorFinancieroId,
    esCompraIva: c.esCompraIva,
    revisar: [...propios, ...c.revisarAgregados],
  }
}
