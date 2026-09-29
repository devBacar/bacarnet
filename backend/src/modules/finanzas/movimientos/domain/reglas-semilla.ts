/**
 * Semilla de categorías (agrupadas) y reglas de auto-categorización de Movimientos.
 *
 * Glosario armado con los textos reales que mandan Córdoba, Julio y Patagonia por
 * Interbanking (movimientos de septiembre 2026) y la nomenclatura bancaria estándar
 * argentina. NO es una tabla oficial de Interbanking: las asignaciones marcadas
 * "estimado" las tiene que revisar el líder de Finanzas.
 *
 * Tres niveles de regla, de mayor a menor prioridad:
 *  1. CUIT de la contraparte (p. ej. el CUIT propio de Bacar → movimiento interno).
 *  2. Texto exacto del banco (`descripciones`).
 *  3. Código de Interbanking (`codigosIb`, campo code_description_ib): red de respaldo
 *     para textos nuevos que el banco todavía no mandó. Solo códigos específicos;
 *     los genéricos (TRF.DATA, DEBITOS, CR EN CTA, CRED.INT, DEB.INTERN, TRF.C.AUTO,
 *     CR.TRF.LIN, DB.LINK, OF. CREDIT, CR.AUTO, CLEARING) no se usan.
 *
 * Una categoría puesta a mano siempre pesa más que cualquier regla.
 *
 * Queda a propósito SIN regla (lo decide el líder desde Movimientos): CREDITO GCIA.ADIMINI
 * (crédito de la Gerencia de Administración del banco: reintegro, ajuste o acreditación
 * especial; falta confirmar con Córdoba si puede ser otra cosa), DEB.TRANS.BANCON JUD,
 * TF.P/IN INT/P, "Movimiento" (Patagonia, código 838).
 */

export interface SemillaCategoria {
  nombre: string
  /** Nivel superior que agrupa categorías en el Cashflow (p. ej. "Gastos bancarios"). */
  grupo: string
  color: string
  /** Textos exactos del banco (se comparan sin espacios de más). */
  descripciones: string[]
  /** Códigos de Interbanking (code_description_ib) usados como respaldo. */
  codigosIb?: string[]
  /**
   * Categorías viejas desde las que la semilla puede mover una regla existente de
   * estos textos (y los movimientos que esa regla había categorizado). Si el líder
   * puso el texto en otra categoría, se respeta.
   */
  reemplazaA?: string[]
}

export interface SemillaReglaCuit {
  cuit: string
  categoria: string
  nota: string
}

export const GRUPOS_CATEGORIAS_MOVIMIENTOS = [
  'Gastos bancarios',
  'Impuestos',
  'Financiación',
  'Inversiones',
  'Pagos',
  'Cheques',
  'Cobros',
  'Movimientos internos',
] as const

export const SEMILLA_CATEGORIAS_MOVIMIENTOS: SemillaCategoria[] = [
  // ─── Gastos bancarios ──────────────────────────────────────────────
  {
    nombre: 'Comisiones bancarias',
    grupo: 'Gastos bancarios',
    color: '#1d4ed8',
    descripciones: [
      'COMEXCACUE',
      'COM.EXCESO ACUERDO',
      'COM.EMISION ECHEQ',
      'COMIS.ECHEQ PAGADO',
      'COMIS. CHEQUE PAGADO',
      'COMIS.INTERBANKING',
      'COM.MOV.CH',
      'COM.P/HAB.M/B.P',
      'COM.PAG.CH CLEARING',
      'COM.CERTIF.FIRMAS',
      'COMISIONES DIVERSAS',
      'COM.CLEARING CHQ.DEP',
      'COM.SALA/VERIF/RCTO',
      'COM.P/IN-PL.PRO',
      'RL-COM.TRANSFERENCIA',
      'RL-COM.GENERAC. CIU',
      'TRANSFERENCIA DATANET',
      'COM ECHEQ VALORES AL COBR',
      'COMIS.RECH.CH.PTMOS.',
      'COM.DEPOSITO RECHAZ.',
      'COM.LBR.DEP/DEPOSITS',
      'COM.TF.DB.PROV.',
      'COM.TF.O/B.DT',
      'COMISION ACUERDOS',
      'GASTOS S/CANJE ACELERADO',
      'RECUPERO DE GASTOS',
      'HONORARIOS GESTOR',
    ],
    codigosIb: [
      'COM.TRANSF',
      'COM.MOV.CH',
      'COM.SERV',
      'COM.C/FIRM',
      'CO.CH/RECH',
      'COM.TEF DN',
      'COM.V/COB',
      'COM.C.CTE',
      'CO.V.COBRO',
      'GTOS.BOLET',
      'RECUP.GTOS',
    ],
  },
  {
    nombre: 'Mantenimiento de cuenta',
    grupo: 'Gastos bancarios',
    color: '#0369a1',
    descripciones: ['COMIS.MANTENIM.CTA.', 'GTO.MAN./COM.VARIAS', 'COMISION MANTENIMIENTO CU'],
    codigosIb: ['C.MANT.CTA'],
  },
  {
    nombre: 'Chequeras',
    grupo: 'Gastos bancarios',
    color: '#6d28d9',
    descripciones: ['GASTOS LIBRETA CHEQ.', 'GASTOS POR CHEQUERAS'],
    codigosIb: ['GAS.LIB.CH'],
  },
  {
    nombre: 'Interbanking',
    grupo: 'Gastos bancarios',
    color: '#475569',
    descripciones: ['ABONO INTERBANKING'],
    codigosIb: ['DATANET'],
  },

  // ─── Impuestos ─────────────────────────────────────────────────────
  {
    nombre: 'Impuesto al cheque',
    grupo: 'Impuestos',
    color: '#b45309',
    descripciones: [
      'IMPUESTO AL DEBITO',
      'IMPUESTO AL CREDITO',
      'IMP.DB/CR BANCARIOS P/DEB',
      'IMP.DB/CR BANCARIOS P/CRE',
      'IMP.S/OPER.CREDITOS',
      'IMP.S/OPER.DEBITOS',
      'IMP.S/CREDITOS',
      'IMP.S/DEBITOS',
    ],
    codigosIb: ['IMP.DTO.BC'],
    reemplazaA: ['Impuestos', 'Impuesto Cheque', 'Imp. Cheque'],
  },
  {
    nombre: 'Ingresos Brutos',
    grupo: 'Impuestos',
    color: '#c2410c',
    descripciones: [
      'RECAU.SIRCREB CBA',
      'IMP.S/CREDITOS DGR',
      'RETENCION IIBB SIRCREB',
      'RET IIBB CBA OP FIN',
    ],
    codigosIb: ['ING.BRUTOS', 'RRSIRCREB'],
    reemplazaA: ['Impuestos'],
  },
  {
    nombre: 'IVA',
    grupo: 'Impuestos',
    color: '#a16207',
    descripciones: [
      'IVAPERCEP',
      'IVA PERCEPCION',
      'IVA Alicuota General',
      'IVA ALICUOTA GENERAL',
      'IVA RI',
      'IVA 21%',
      'IVA 21% *COMISIONES*',
      'IVA *INTERESES*',
      'IVA R.I. REDUCIDO',
      'IVA R.G. 3337',
      'IVA PERCEP.REDUCIDO',
      'IVA PERCEPC.RG 2408',
    ],
    codigosIb: ['IVAPERCEP', 'IVA PERCEP', 'IVAACRERNI', 'IVA 21%'],
    reemplazaA: ['Impuestos', 'Comisiones bancarias'],
  },
  {
    nombre: 'Sellos',
    grupo: 'Impuestos',
    color: '#92400e',
    descripciones: [
      'IMPUESTO A LOS SELLOS',
      'SELL.CONTRATO MUTUO',
      'SELLADOS S/S.DEUD.',
      'DEB SELLADO ADEL CC',
    ],
    codigosIb: ['IMP.SELLOS', 'SELL.INT.D', 'SELL.AVAL'],
  },
  {
    nombre: 'Ganancias',
    grupo: 'Impuestos',
    color: '#9a3412',
    descripciones: ['RETENC.IMP.GANANCIAS'],
    codigosIb: ['RE.2784 IG'],
  },
  {
    // estimado: "PAGOS AUTORIZADOS" con código DB.IMPUEST suele ser el débito de un VEP.
    nombre: 'Pago de impuestos (VEP)',
    grupo: 'Impuestos',
    color: '#78350f',
    descripciones: ['PAGOS AUTORIZADOS'],
    codigosIb: ['DB.IMPUEST'],
  },
  {
    nombre: 'Impuestos municipales y rentas',
    grupo: 'Impuestos',
    color: '#854d0e',
    descripciones: ['IMP.MUNI-LEASING', 'IMP.RENTAS-LEASING'],
  },
  {
    nombre: 'Devoluciones de impuestos',
    grupo: 'Impuestos',
    color: '#65a30d',
    descripciones: ['DEV.IMP.S/CRED.DGR', 'DEV. IMPUESTO D/C', 'REINTEGRO LEY.COMPET'],
    codigosIb: ['DEV.IMPU', 'CR.P/IMP'],
  },

  // ─── Financiación ──────────────────────────────────────────────────
  {
    nombre: 'Préstamos',
    grupo: 'Financiación',
    color: '#be123c',
    descripciones: [
      'ACREDITAC.PRESTAMOS',
      'CRED.SOLA FIRMA',
      'CREDITO POR PRESTAMO OTOR',
      'COBRANZA PRESTAMOS',
      'AMORTIZACION S/PRESTAMO O',
    ],
    codigosIb: ['DESEM.PMO', 'CRED.OTORG', 'PTMO.M/NAC'],
  },
  {
    nombre: 'Intereses',
    grupo: 'Financiación',
    color: '#9f1239',
    descripciones: [
      'INTS.S/SDOS.DEUDORES',
      'DEB.X INTE.SDO.DEUDO',
      'INTERESES P/SOBREGIRO',
      'INTERESES S/CONTRATO CC',
    ],
    codigosIb: ['INT.S/DESC', 'INT.SDO.DE', 'INT.PMO', 'INTERESES'],
  },
  {
    nombre: 'Leasing',
    grupo: 'Financiación',
    color: '#e11d48',
    descripciones: [
      'COB.CANON LEASING',
      'COB.CANON LEASING V',
      'AMORTIZAC.CONTRATO ARREND',
      'CARGO GESTORIA-ESCRIB LEA',
    ],
    codigosIb: ['GESTORIA'],
  },
  {
    // estimado: cobranza de créditos cedidos (factoring).
    nombre: 'Cesión de créditos',
    grupo: 'Financiación',
    color: '#db2777',
    descripciones: ['CRE.COBRZA CESIONES'],
  },
  {
    // DESC.DOC = Descuento de Documentos (cheques de pago diferido / pagarés adelantados por el
    // banco). DEB.DOC.DESCONTADO = débito de un documento descontado (cheque rechazado o cuota).
    nombre: 'Descuento de documentos',
    grupo: 'Financiación',
    color: '#a21caf',
    descripciones: ['DESC.DOC', 'DEB.DOC.DESCONTADO'],
    codigosIb: ['DESC.DOC'],
  },
  {
    // PA.RES.DEB.CTA.AT PR = pago de resumen / débito en cuenta de un producto (tarjeta,
    // préstamo o adelanto).
    nombre: 'Resúmenes y cuotas',
    grupo: 'Financiación',
    color: '#be185d',
    descripciones: ['PA.RES.DEB.CTA.AT PR'],
    reemplazaA: ['Débitos automáticos y servicios'],
  },
  {
    nombre: 'Planes de ahorro',
    grupo: 'Financiación',
    color: '#c026d3',
    descripciones: ['CUOTA PLAN TOYOTA', 'CIRCULO CERRADO'],
  },

  // ─── Inversiones ───────────────────────────────────────────────────
  {
    nombre: 'Fondos comunes (FCI)',
    grupo: 'Inversiones',
    color: '#15803d',
    descripciones: ['SUSCRIP.CLIENTES FCI', 'RESCATE CLIENTES FCI'],
    reemplazaA: ['Rescate'],
  },

  // ─── Pagos ─────────────────────────────────────────────────────────
  {
    nombre: 'Sueldos',
    grupo: 'Pagos',
    color: '#7c3aed',
    // Las variantes "P/IN-P" / "P/I-P" son los textos que manda Córdoba en el día en curso.
    descripciones: [
      'TF.PAG.HAB.O/B',
      'TF.DB.PAG.HAB.P',
      'INTERBANK. SUELDOS',
      'TF.DB.PAG.HAB.P/IN-P',
      'TF.PAG.HAB.O/B P/I-P',
    ],
  },
  {
    nombre: 'Proveedores',
    grupo: 'Pagos',
    color: '#4f46e5',
    descripciones: ['TF.DB.PAG.PROV.', 'INTERBANK.PROVEEDORE', 'TRANS.DEB B.TO B.'],
    codigosIb: ['PAGOS BTOB'],
  },
  {
    // estimado: transferencias salientes por home banking / Red Link / DEBIN a terceros.
    // Las que van a cuentas propias las toma antes la regla por CUIT.
    nombre: 'Transferencias a terceros',
    grupo: 'Pagos',
    color: '#6366f1',
    descripciones: [
      'TRANSF.HB.E',
      'TRANSF.HB-G',
      'DEB. TRANF RED LINK',
      'DEBITO POR DATANET',
      'DEBITO INTERPYME',
      'DB.DEBIN RED LINK',
      'DEBIN GRAVADO',
      'DEBIN',
      'GIROS/TRF',
    ],
    codigosIb: ['GIROS/TRF'],
  },
  {
    nombre: 'Débitos automáticos y servicios',
    grupo: 'Pagos',
    color: '#0891b2',
    descripciones: [
      'DEBITO CARGA PREPAGA',
      'DEB.AUTOM.SERVIC.T.A',
      'PAGO AUT.SERV ATM PR',
      'DB.PSRV. S/BASE RL',
      'DEBITO S.N.P.',
      'SANCOR COOP.SEGUROS',
      'COLSERVICE SA AH',
      'CAMINO DE LAS SIERRA',
      'PAYPERTIC',
      'FUNDACION 7MO MES',
    ],
    codigosIb: ['DB.AUT.VS', 'DEB.AUT.SE', 'DEB DDIR', 'DB.VS.ETVO'],
  },

  // ─── Cheques ───────────────────────────────────────────────────────
  {
    nombre: 'Cheques pagados',
    grupo: 'Cheques',
    color: '#9a3412',
    descripciones: [
      'CHEQUE CAMARA LOCAL',
      'ECHEQ CAMARA',
      'CH CAMAR RECIB.ACH',
      'CH DEP 72',
      'ECHEQ PROPIO DEPOSIT',
      'DEB AUT RECIB CAMARA',
      'DEB.P/CANJE INTERNO',
    ],
    codigosIb: ['CH DEP 72'],
    reemplazaA: ['Cheques'],
  },
  {
    nombre: 'Cheques depositados',
    grupo: 'Cheques',
    color: '#ea580c',
    descripciones: ['DEPOSITO ECHEQ', 'DEP. VALORES CAMARA'],
    codigosIb: ['CH DEP 48'],
  },
  {
    nombre: 'Cheques rechazados',
    grupo: 'Cheques',
    color: '#dc2626',
    descripciones: [
      'CH.RECH.DEP.CAM.INT.',
      'DEB.VS./RECH.VALORES',
      'CH/DEV.F.TEC.NO.IMPU',
      'REV DEB AUT REC CAMA',
    ],
    codigosIb: ['RECH.DEP48', 'RE.V.CO LD', 'FALLA TECN', 'REV.DE.AUT'],
  },

  // ─── Cobros ────────────────────────────────────────────────────────
  {
    nombre: 'Cobros de clientes',
    grupo: 'Cobros',
    color: '#0f766e',
    descripciones: [
      'CR.INTERB.PROVEEDOR',
      'CREDITO POR DATANET',
      'TRF.DATA',
      'CRED.VS/ACRED.VALOR.',
      'TF.CR.P/IN-PL.P/PROV',
      'CRED.TRANSFERENC.ATM',
      'CRED.TRANSFERENC.MEP',
      'CREDIN TRANSFER.G',
      'TRANSF.RECIBIDA G',
      'CRE.TRANSF.GRAVADA',
      'TRANSF.CTO HB G',
      'CREDITO INTERPYME',
      'CRED.PROVEE.BANCON',
      // CREDITO PROVEEDOR TA: un cliente corporativo nos paga como proveedor (transferencia
      // automática). TRANS P PR comparte el mismo código de Interbanking.
      'CREDITO PROVEEDOR TA',
      'TRANS P PR',
    ],
    codigosIb: ['TRANS P PR'],
  },
  {
    nombre: 'Cobros DEBIN',
    grupo: 'Cobros',
    color: '#0d9488',
    descripciones: ['CR.DEBIN RED LINK'],
  },
  {
    nombre: 'Depósitos en efectivo',
    grupo: 'Cobros',
    color: '#14b8a6',
    descripciones: ['DEPOSITO EFECTIVO', 'DEP.EFVO'],
    codigosIb: ['DEP.EFVO'],
  },

  // ─── Movimientos internos ──────────────────────────────────────────
  {
    nombre: 'Movimiento interno',
    grupo: 'Movimientos internos',
    color: '#64748b',
    descripciones: [
      'TRANSFERENCIA E/CTAS MISM',
      'TRANSF. PROP. O/BCO. EBAN',
      'CR.INTER.C.PPIAS S/I',
      'CR.TRF.MTIT RED LINK',
      'CRD. TRANF RED LINK',
      'INTERBANK.C.PROP.S/I',
      'DB.TRF.MTIT RED LINK',
      'TF.DB.MT.INT/P',
      'TRANS.CR.P/IN-PL.M/T',
    ],
    codigosIb: ['TRF.M.TIT'],
  },
]

/** CUIT propio y de empresas del grupo: la plata que va y viene entre ellas no es cobro ni pago. */
export const SEMILLA_REGLAS_CUIT: SemillaReglaCuit[] = [
  {
    cuit: '30668134978',
    categoria: 'Movimiento interno',
    nota: 'Bacar Transportadora de Caudales (CUIT propio)',
  },
]

/**
 * Categorías viejas que quedan reemplazadas. La semilla las borra solo si después de
 * migrar ya no tienen movimientos ni reglas (si el líder les dejó algo, se mantienen).
 */
export const SEMILLA_CATEGORIAS_A_RETIRAR = ['Impuestos', 'Impuesto Cheque', 'Imp. Cheque', 'Cheques', 'Rescate']
