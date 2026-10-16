/** Documentos que Bacarnet guarda a partir de Vientri. Todo es de solo lectura en Bacarnet. */

export interface PersonaRef {
  vientriId: number
  nombre: string | null
  cuit: string | null
}

export type DireccionChequeVientri = 'emitido' | 'recibido'

export type EstadoChequeVientri =
  | 'en_cartera'
  | 'depositado'
  | 'vendido'
  | 'rechazado'
  | 'entregado'
  | 'pendiente_debito'
  | 'debitado'
  | 'anulado'
  | 'otro'

export interface VientriChequeDoc {
  clave: string
  direccion: DireccionChequeVientri
  tipo: 'echeq' | 'fisico'
  numero: string
  serie: string
  bancoId: number | null
  bancoNombre: string | null
  montoCentavos: number
  fechaEmision: string | null
  fechaVencimiento: string | null
  fechaRecibido: string | null
  fechaDeposito: string | null
  fechaEntregado: string | null
  fechaConciliado: string | null
  estado: EstadoChequeVientri
  /** Cómo lo llama Vientri (para mostrarlo tal cual). */
  estadoVientri: string
  estadoVientriId: number | null
  librador: PersonaRef | null
  entregadoPor: PersonaRef | null
  entregadoA: PersonaRef | null
  destinatario: string | null
  /** De qué tablas de Vientri salió: Chq, CHQOCA o las dos. */
  fuentes: Array<'Chq' | 'CHQOCA'>
  vientriChqId: number | null
  vientriChqocaId: number | null
  baja: boolean
  /** Motivos para revisar a mano (vacío = todo bien). */
  revisar: string[]
  fecsys: string | null
}

export type LadoPendiente = 'pagar' | 'cobrar' | 'revisar'

export interface VientriPendienteDoc {
  clave: string
  vientriId: number
  lado: LadoPendiente
  tipoId: number | null
  tipo: string | null
  comprobante: string
  persona: PersonaRef | null
  fecha: string | null
  fechaVencimiento: string | null
  totalCentavos: number
  pendienteCentavos: number
  divisaId: number | null
  moneda: string | null
  cotizacion: number | null
  fechaProntoPago: string | null
  descuentoProntoPago: number | null
  cuotas: number | null
  prestamo: boolean
  revisar: string[]
  fecsys: string | null
}

export interface VientriPersonaDoc {
  vientriId: number
  nombre: string | null
  nombreFantasia: string | null
  cuit: string | null
  esCliente: boolean
  esProveedor: boolean
  inactivo: boolean
  incobrable: boolean
  limiteCreditoCentavos: number | null
  plazoPagoClienteDias: number | null
  ultimoPagoCliente: string | null
  plazoPagoProveedorDias: number | null
  cbu: string | null
  baja: boolean
}
