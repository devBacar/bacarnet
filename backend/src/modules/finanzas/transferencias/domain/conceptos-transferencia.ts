/**
 * Conceptos de pago a terceros (OpenAPI v2, TransferenciaTercerosCommandDTOV2)
 * más SRF, que la tabla de disclaimers pide y el enum del campo no lista.
 * Requieren disclaimer aceptado: OIN, BRN y SRF.
 */

export interface ConceptoTransferenciaTerceros {
  codigo: string
  rotulo: string
  requiereDisclaimer: boolean
}

export const CONCEPTO_TERCEROS_DEFAULT = 'VAR'

export const CONCEPTOS_TRANSFERENCIA_TERCEROS: readonly ConceptoTransferenciaTerceros[] = [
  { codigo: 'VAR', rotulo: 'Varios', requiereDisclaimer: false },
  { codigo: 'ALQ', rotulo: 'Alquileres', requiereDisclaimer: false },
  { codigo: 'FAC', rotulo: 'Facturas', requiereDisclaimer: false },
  { codigo: 'HON', rotulo: 'Honorarios', requiereDisclaimer: false },
  { codigo: 'CUO', rotulo: 'Cuotas', requiereDisclaimer: false },
  { codigo: 'EXP', rotulo: 'Expensas', requiereDisclaimer: false },
  { codigo: 'PRE', rotulo: 'Préstamos', requiereDisclaimer: false },
  { codigo: 'SEG', rotulo: 'Seguros', requiereDisclaimer: false },
  { codigo: 'OIH', rotulo: 'Operaciones inmobiliarias habituales', requiereDisclaimer: false },
  { codigo: 'OIN', rotulo: 'Operaciones inmobiliarias', requiereDisclaimer: true },
  { codigo: 'ROP', rotulo: 'Reintegros de obras sociales y prepagas', requiereDisclaimer: false },
  { codigo: 'APC', rotulo: 'Aportes de capital', requiereDisclaimer: false },
  { codigo: 'BRH', rotulo: 'Bienes registrables habituales', requiereDisclaimer: false },
  { codigo: 'BRN', rotulo: 'Bienes registrables', requiereDisclaimer: true },
  { codigo: 'SIS', rotulo: 'Siniestros de seguros', requiereDisclaimer: false },
  { codigo: 'SON', rotulo: 'Suscripción de obligaciones negociables', requiereDisclaimer: false },
  { codigo: 'SRF', rotulo: 'Suscripción o rescate de fondos', requiereDisclaimer: true },
  { codigo: 'DON', rotulo: 'Donaciones', requiereDisclaimer: false },
  { codigo: 'VIA', rotulo: 'Viáticos', requiereDisclaimer: false },
  { codigo: 'COM', rotulo: 'Comercio', requiereDisclaimer: false },
  { codigo: 'SUB', rotulo: 'Subsidios', requiereDisclaimer: false },
  { codigo: 'ESE', rotulo: 'Estado, expropiaciones u otros', requiereDisclaimer: false },
]

const POR_CODIGO = new Map(CONCEPTOS_TRANSFERENCIA_TERCEROS.map((item) => [item.codigo, item]))

export function conceptoTercerosPorCodigo(codigo: string): ConceptoTransferenciaTerceros | null {
  return POR_CODIGO.get(codigo.trim().toUpperCase()) ?? null
}
