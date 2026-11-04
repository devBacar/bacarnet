import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'

/** Textos de `revisar` que agrega la importación. No deben contener "imposible": esa palabra descarta el cheque de las pantallas. */
export const REVISAR_SIN_DATOS_FINANCIEROS = 'Sin datos de operación financiera (renovación, USD, tasa o interés): revisar a mano'
export const REVISAR_PROVEEDOR_NO_CARGADO = 'Proveedor no cargado en Proveedores financieros'

export interface ProveedorEnLista {
  id: string
}

export interface SenalesFinancieras {
  esRenovacion: boolean
  /** Otro cheque lo renueva: es el cheque viejo de una operación, aunque su OBS esté vacío. */
  esRenovadoPorOtro: boolean
  tieneUsd: boolean
  tieneTasaExplicita: boolean
  tieneRol: boolean
}

export interface ClasificacionOcasional {
  esProveedorFinanciero: true
  tipoProveedor: 'financiero'
  proveedorFinancieroId: string | null
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
): ClasificacionOcasional {
  const proveedor = beneficiarioNormalizado !== '' ? proveedores.get(beneficiarioNormalizado) ?? null : null
  const sinSenales =
    !senales.esRenovacion
    && !senales.esRenovadoPorOtro
    && !senales.tieneUsd
    && !senales.tieneTasaExplicita
    && !senales.tieneRol

  const revisarAgregados: string[] = []
  if (beneficiarioNormalizado !== '' && proveedor === null) revisarAgregados.push(REVISAR_PROVEEDOR_NO_CARGADO)
  if (sinSenales) revisarAgregados.push(REVISAR_SIN_DATOS_FINANCIEROS)

  return {
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    proveedorFinancieroId: proveedor?.id ?? null,
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
    },
    proveedores,
  )
  const propios = (doc.revisar ?? []).filter(
    (r) => r !== REVISAR_PROVEEDOR_NO_CARGADO && r !== REVISAR_SIN_DATOS_FINANCIEROS,
  )
  return {
    ...doc,
    esProveedorFinanciero: c.esProveedorFinanciero,
    tipoProveedor: c.tipoProveedor,
    proveedorFinancieroId: c.proveedorFinancieroId,
    revisar: [...propios, ...c.revisarAgregados],
  }
}
