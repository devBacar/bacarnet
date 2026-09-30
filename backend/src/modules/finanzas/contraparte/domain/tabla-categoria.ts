/**
 * Si ninguna fuente más específica encontró a la persona, el nombre sale de acá.
 * Los textos tienen que coincidir con el nombre o el grupo de la categoría
 * (semilla en reglas-semilla.ts). `{banco}` se reemplaza por el banco de la cuenta.
 *
 * "Sellos del banco" es la categoría Sellos (impuesto que cobra el banco).
 */
export interface FilaContraparteCategoria {
  categoria?: string
  grupo?: string
  nombre: string
}

export const TABLA_CONTRAPARTE_POR_CATEGORIA: FilaContraparteCategoria[] = [
  { grupo: 'Gastos bancarios', nombre: 'Banco {banco}' },
  { categoria: 'Impuesto al cheque', nombre: 'Banco {banco}' },
  { categoria: 'Sellos', nombre: 'Banco {banco}' },
  { categoria: 'IVA', nombre: 'AFIP (cobrado por Banco {banco})' },
  { categoria: 'Ganancias', nombre: 'AFIP (cobrado por Banco {banco})' },
  { categoria: 'Ingresos Brutos', nombre: 'Rentas (SIRCREB, cobrado por Banco {banco})' },
  { categoria: 'Movimiento interno', nombre: 'Bacar · entre cuentas propias' },
  { categoria: 'Sueldos', nombre: 'Empleados (sueldos)' },
]
