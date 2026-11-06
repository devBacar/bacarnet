import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type MonedaTablero = 'ARS' | 'USD'
export type BucketAntiguedad = '0-30' | '31-60' | '61-90' | 'mas90'

export interface ComprobanteCobro {
  clave: string
  comprobante: string
  fecha: string | null
  fechaVencimiento: string | null
  totalCentavos: number
  pendienteCentavos: number
  diasVencido: number | null
  bucket: BucketAntiguedad | null
}

export interface ClienteCobro {
  personaId: number
  nombre: string
  cuit: string | null
  deudaCentavos: number
  favorCentavos: number
  saldoCentavos: number
  vencidoCentavos: number
  aVencerCentavos: number
  comprobantes: ComprobanteCobro[]
}

/** Un pago real (total o parcial) de una factura, con su fecha real de cobro. */
export interface FacturaCobrada {
  clave: string
  comprobante: string
  persona: { vientriId: number; nombre: string } | null
  fechaCobro: string | null
  importeCobradoCentavos: number
  /** 'banco': todavía no lo confirmó Vientri, se infirió de un crédito bancario (CUIT + monto exacto). */
  fuente: 'vientri' | 'banco'
}

export interface TableroCobros {
  moneda: MonedaTablero
  generadoEn: string
  hoy: string
  periodo: { desde: string; hasta: string }
  totalACobrarCentavos: number
  totalFavorCentavos: number
  totalVencidoCentavos: number
  totalAVencerCentavos: number
  antiguedad: Record<BucketAntiguedad, number>
  cantidadClientesConDeuda: number
  cobradoEnPeriodoCentavos: number
  cantidadFacturasCobradasEnPeriodo: number
  /** Créditos de HOY que todavía no se pudieron clasificar (ni cheque, transferencia ni factura). */
  sinClasificarHoy: { cantidad: number; montoCentavos: number }
  clientes: ClienteCobro[]
}

export interface DetalleClienteCobros {
  personaId: number
  nombre: string
  impagas: ComprobanteCobro[]
  cobradas: FacturaCobrada[]
}

async function tableroFetch(path: string): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(resolveApiUrl(`/api/finanzas${path}`), { headers })
}

async function leerOFallar<T>(res: Response, mensajePorDefecto: string): Promise<T> {
  if (!res.ok) {
    let mensaje = mensajePorDefecto
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) mensaje = data.error
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new Error(mensaje)
  }
  return (await res.json()) as T
}

export async function fetchTableroCobros(input: {
  desde: string | null
  hasta: string | null
  moneda: MonedaTablero
}): Promise<TableroCobros> {
  const params = new URLSearchParams()
  if (input.desde) params.set('desde', input.desde)
  if (input.hasta) params.set('hasta', input.hasta)
  params.set('moneda', input.moneda)
  const res = await tableroFetch(`/cobros-tablero?${params.toString()}`)
  return leerOFallar<TableroCobros>(res, 'No se pudo cargar el tablero de Cobros')
}

export async function fetchDetalleClienteCobros(input: {
  vientriId: number
  desde: string | null
  hasta: string | null
  moneda: MonedaTablero
}): Promise<DetalleClienteCobros> {
  const params = new URLSearchParams()
  if (input.desde) params.set('desde', input.desde)
  if (input.hasta) params.set('hasta', input.hasta)
  params.set('moneda', input.moneda)
  const res = await tableroFetch(`/cobros-tablero/cliente/${input.vientriId}?${params.toString()}`)
  return leerOFallar<DetalleClienteCobros>(res, 'No se pudo cargar el detalle del cliente')
}
