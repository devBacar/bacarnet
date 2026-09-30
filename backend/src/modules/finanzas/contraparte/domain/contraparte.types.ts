/** De dónde salió el nombre que ve Finanzas. La primera fuente que resuelve gana. */
export type ContraparteOrigen =
  | 'manual'
  | 'banco'
  | 'transferencia'
  | 'agenda'
  | 'cheque'
  | 'interbanking'
  | 'directorio'
  | 'categoria'

export interface ContraparteGuardada {
  nombre: string | null
  cuit: string | null
  origen: ContraparteOrigen | null
}

export const CONTRAPARTE_VACIA: ContraparteGuardada = {
  nombre: null,
  cuit: null,
  origen: null,
}

export function esOrigenContraparte(value: unknown): value is ContraparteOrigen {
  return (
    value === 'manual' ||
    value === 'banco' ||
    value === 'transferencia' ||
    value === 'agenda' ||
    value === 'cheque' ||
    value === 'interbanking' ||
    value === 'directorio' ||
    value === 'categoria'
  )
}
