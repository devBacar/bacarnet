export type MedioPagoHoy = 'transferencia' | 'efectivo' | 'cheque'
export type UrgenciaHoy = 'alta' | 'media' | 'baja' | null
export type EstadoCompromisoHoy = 'pendiente' | 'vencido' | 'confeccionada_pendiente_autorizacion' | 'pagado'
export type EstadoCobroHoy = 'esperado' | 'confirmado' | 'incobrable'

export interface CompromisoHoy {
  id: string
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  /** Monto total del compromiso (sin descontar lo ya pagado). Para mostrar lo pagado hoy. */
  montoTotalCentavos: number
  /** YYYY-MM-DD en Argentina. */
  fechaVencimiento: string
  urgencia: UrgenciaHoy
  medioPago: MedioPagoHoy
  estado: EstadoCompromisoHoy
  cuentaId: string | null
  /** Cheque ya elegido/emitido para pagar este compromiso (Agenda). */
  chequeId: string | null
  /** Factura de Vientri sin vencimiento cargado (y Finanzas todavía no le puso fecha de pago). */
  sinFecha?: boolean
  /** La fecha no viene de Vientri: se estimó según lo que tarda este proveedor en cobrar. */
  estimada?: boolean
  /** YYYY-MM-DD en Argentina. Solo si estado === 'pagado'. */
  fechaPago: string | null
  origen: 'manual' | 'vientri' | 'vientri-cheque' | 'inversiones' | 'planilla'
  /** Con qué se pagó de verdad (cheques con su vencimiento real, etc.). Solo en origen 'vientri'. */
  desglosePago?: DesglosePagoHoy[] | null
}

export interface DesglosePagoHoy {
  medio: 'cheque_fisico' | 'echeq' | 'otro_medio'
  fechaVencimiento: string | null
  montoCentavos: number
  chequeNumero: string | null
}

export interface CobroHoy {
  id: string
  clienteONombre: string
  /** Si la agenda no tiene concepto, se usa el nombre del cliente. */
  concepto: string | null
  montoCentavos: number
  fechaEsperada: string
  estado: EstadoCobroHoy
  cuit: string | null
  email: string | null
  contraparte: string | null
  /** Factura de Vientri sin vencimiento cargado (y Finanzas todavía no le puso fecha). */
  sinFecha?: boolean
  /** La fecha no viene de Vientri: se estimó según lo que tarda este cliente en pagar. */
  estimada?: boolean
  /** YYYY-MM-DD en Argentina. Solo si estado === 'confirmado'. */
  fechaConfirmado: string | null
  origen: 'manual' | 'vientri' | 'vientri-cheque' | 'inversiones' | 'planilla'
  /** Con qué se cobró de verdad (cheques con su vencimiento real, etc.). Solo en origen 'vientri'. */
  desglosePago?: DesglosePagoHoy[] | null
}

export interface MovimientoHoy {
  id: string
  cuentaId: string
  bancoNombre: string
  tipo: 'debito' | 'credito'
  montoCentavos: number
  fechaProceso: string
  customerCuit: string | null
  depositorDescription: string | null
  descripcion: string
  reservado: boolean
}

export interface CuentaHoy {
  id: string
  bancoNombre: string
  tipo: 'CC' | 'USD'
  moneda: 'ARS' | 'USD'
  saldoActualCentavos: number
  descubiertoCentavos: number | null
}

export interface TransferenciaHoy {
  id: string
  montoCentavos: number
  estado: string
  estadoInterbanking: string | null
  /** ISO. Si no hay fecha del estado, se usa la de confección. */
  estadoInterbankingActualizadoAt: string | null
  fechaConfeccion: string | null
  fechaSolicitud: string | null
}

export interface SugerenciaBanco {
  id: string
  bancoNombre: string
  fecha: string
  descripcion: string
  montoCentavos: number
  cuentaId: string
}

export interface PagoFilaHoy {
  id: string
  urgencia: string
  vencido: boolean
  vencidoTexto: string | null
  /** Días de atraso (0 si no está atrasado). */
  diasAtraso?: number
  aQuien: string
  concepto: string
  montoCentavos: number
  comoPagar: string
  medioPago: MedioPagoHoy
  proveedorONombre: string
  sugerenciasBanco: SugerenciaBanco[]
  /** Medio cheque y ya hay chequeId en el compromiso. */
  chequeEmitido: boolean
  /** Aviso visible cuando el cheque ya se emitió y solo falta debitarlo. */
  aviso: string | null
  estimada?: boolean
}

export interface IngresoFilaHoy {
  id: string
  cliente: string
  concepto: string
  montoCentavos: number
  atrasado: boolean
  atrasadoTexto: string | null
  email: string | null
  llego: boolean
  bancoNombre: string | null
  movimientoId: string | null
  cuentaId: string | null
  textoReclamo: string
  estimada?: boolean
}

export interface BancoFilaHoy {
  bancoNombre: string
  saldoAhoraCentavos: number
  descubiertoCentavos: number | null
  quedaParaUsarCentavos: number
}

export interface SemanaFilaHoy {
  fecha: string
  dia: string
  aPagarCentavos: number
  aCobrarCentavos: number
  quedaCentavos: number
  esElMasPesado: boolean
}

export interface CobroAtrasadoHoy {
  id: string
  cliente: string
  concepto: string
  montoCentavos: number
  haceDias: number
  haceTexto: string
  email: string | null
  textoReclamo: string
  estimada?: boolean
}

/** Agrupación por medio real para "resuelto hoy": qué plata sale/entra hoy y por qué vía. */
export type MedioResueltoHoy = 'efectivo' | 'transferencia' | 'cheque_fisico' | 'echeq' | 'otro'

/** Pagado o cobrado hoy: informativo, no se puede accionar desde acá. */
export interface MovimientoDelDiaHoy {
  id: string
  aQuienODeQuien: string
  concepto: string
  montoCentavos: number
  medio: MedioResueltoHoy
  chequeNumero: string | null
  origen: 'manual' | 'vientri' | 'vientri-cheque' | 'inversiones' | 'planilla'
  /** Solo para cheque_fisico/echeq: si el banco ya lo debitó/acreditó. null si no se pudo chequear. */
  debitadoPorBanco: boolean | null
}

export interface FirmasHoy {
  cantidad: number
  montoCentavos: number
  texto: string
}

/** Cheque tal como lo necesita Hoy. `fechaEntregado` no se usa. */
export interface ChequeEnHoy {
  id: string
  numero: string
  direccion: 'recibido' | 'emitido'
  estado: string
  utilizado: boolean | null
  montoCentavos: number
  fechaPago: string
  bancoEmisor: string | null
  destinatario: string | null
  emisor: string
  cliente: string | null
}

export interface ChequeADebitarFila {
  id: string
  numero: string
  destinatario: string
  banco: string
  montoCentavos: number
  /** Hoy o Mañana, para no mezclarlos en la misma fila sin decirlo. */
  cuando: 'Hoy' | 'Mañana'
}

export interface ChequesADebitarHoy {
  filas: ChequeADebitarFila[]
  totalCentavos: number
  impactos: string[]
}

export interface ChequeCarteraHoy {
  id: string
  numero: string
  emisor: string
  banco: string
  fechaPago: string
  montoCentavos: number
}

export interface HoyVista {
  saludo: string
  fecha: string
  vacio: boolean
  /** Solo lo que vence hoy. */
  pagos: { totalCentavos: number; filas: PagoFilaHoy[] }
  /** Vencimiento ya pasado: no entra en los totales del día. */
  pagosAtrasados: { totalCentavos: number; filas: PagoFilaHoy[] }
  /** Facturas de Vientri sin vencimiento: Finanzas les pone el día de pago. */
  pagosSinFecha: { totalCentavos: number; filas: PagoFilaHoy[] }
  ingresos: { filas: IngresoFilaHoy[] }
  cobrosSinFecha: { cantidad: number; totalCentavos: number }
  /** Ya resuelto hoy (pagado/cobrado): informativo, para no ver el día "vacío" cuando sí hubo movimiento. */
  resueltoHoy: { pagos: { totalCentavos: number; filas: MovimientoDelDiaHoy[] }; cobros: { totalCentavos: number; filas: MovimientoDelDiaHoy[] } }
  dia: {
    saldoInicialCentavos: number
    pagosCentavos: number
    cobrosCentavos: number
    saldoFinalCentavos: number
    frase: string
    bancos: BancoFilaHoy[]
    avisoDescubierto: string | null
  }
  prevision: {
    semana: SemanaFilaHoy[] | null
    diaMasPesado: string | null
    cobrosAtrasados: CobroAtrasadoHoy[]
    firmas: FirmasHoy | null
    chequesADebitar: ChequesADebitarHoy
  }
}

export interface ArmarHoyInput {
  now: Date
  compromisos: CompromisoHoy[]
  cobros: CobroHoy[]
  movimientos: MovimientoHoy[]
  cuentas: CuentaHoy[]
  transferencias: TransferenciaHoy[]
  cheques: ChequeEnHoy[]
}
