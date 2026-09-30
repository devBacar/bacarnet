export type MedioPagoHoy = 'transferencia' | 'efectivo' | 'cheque'
export type UrgenciaHoy = 'alta' | 'media' | 'baja' | null
export type EstadoCompromisoHoy = 'pendiente' | 'vencido' | 'confeccionada_pendiente_autorizacion' | 'pagado'
export type EstadoCobroHoy = 'esperado' | 'confirmado' | 'incobrable'

export interface CompromisoHoy {
  id: string
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  /** YYYY-MM-DD en Argentina. */
  fechaVencimiento: string
  urgencia: UrgenciaHoy
  medioPago: MedioPagoHoy
  estado: EstadoCompromisoHoy
  cuentaId: string | null
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
  aQuien: string
  concepto: string
  montoCentavos: number
  comoPagar: string
  medioPago: MedioPagoHoy
  proveedorONombre: string
  sugerenciasBanco: SugerenciaBanco[]
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
}

export interface FirmasHoy {
  cantidad: number
  montoCentavos: number
  texto: string
}

export interface HoyVista {
  saludo: string
  fecha: string
  vacio: boolean
  pagos: { totalCentavos: number; filas: PagoFilaHoy[] }
  ingresos: { filas: IngresoFilaHoy[] }
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
    chequesTexto: string
  }
}

export interface ArmarHoyInput {
  now: Date
  compromisos: CompromisoHoy[]
  cobros: CobroHoy[]
  movimientos: MovimientoHoy[]
  cuentas: CuentaHoy[]
  transferencias: TransferenciaHoy[]
}
