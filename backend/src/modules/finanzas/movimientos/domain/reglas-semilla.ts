/**
 * Semilla inicial de categorías y reglas de auto-categorización.
 *
 * Los textos son descripciones que el banco repite en los movimientos reales
 * (impuestos, comisiones, transferencias entre cuentas propias, cobros).
 * La asignación a cada categoría es una ESTIMACIÓN según nomenclatura bancaria
 * estándar argentina, no una tabla oficial de Interbanking: el líder de Finanzas
 * tiene que revisarla y ajustar lo que no coincida con su realidad.
 *
 * La semilla es idempotente: si la categoría o la regla ya existen, se reutilizan.
 */
export interface SemillaCategoria {
  nombre: string
  color: string
  descripciones: string[]
}

export const SEMILLA_CATEGORIAS_MOVIMIENTOS: SemillaCategoria[] = [
  {
    nombre: 'Impuestos',
    color: '#b45309',
    descripciones: [
      'IMPUESTO AL DEBITO',
      'IMPUESTO AL CREDITO',
      'IMP.DB/CR BANCARIOS P/DEB',
      'IMP.DB/CR BANCARIOS P/CRE',
      'IVAPERCEP',
      'IVA PERCEPCION',
      'IVA Alicuota General',
      'IVA ALICUOTA GENERAL',
      'IVA RI',
    ],
  },
  {
    nombre: 'Comisiones bancarias',
    color: '#1d4ed8',
    descripciones: [
      'COMEXCACUE',
      'COM.EXCESO ACUERDO',
      'COM.EMISION ECHEQ',
      'COMIS.ECHEQ PAGADO',
      'COMIS. CHEQUE PAGADO',
      'COMIS.INTERBANKING',
    ],
  },
  {
    nombre: 'Movimiento interno',
    color: '#7c3aed',
    descripciones: [
      'TRANSFERENCIA E/CTAS MISM',
      'TRANSF. PROP. O/BCO. EBAN',
      'CR.INTER.C.PPIAS S/I',
      'CR.TRF.MTIT RED LINK',
      'CRD. TRANF RED LINK',
    ],
  },
  {
    nombre: 'Cobros de clientes',
    color: '#0f766e',
    descripciones: ['CR.INTERB.PROVEEDOR', 'CREDITO POR DATANET', 'TRF.DATA', 'CRED.VS/ACRED.VALOR.'],
  },
  {
    nombre: 'Cobros DEBIN',
    color: '#0369a1',
    descripciones: ['CR.DEBIN RED LINK'],
  },
  {
    nombre: 'Cheques',
    color: '#9a3412',
    descripciones: ['CHEQUE CAMARA LOCAL'],
  },
]
