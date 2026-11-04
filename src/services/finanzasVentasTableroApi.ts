import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type MonedaTablero = 'ARS' | 'USD'

export interface ItemVentaTablero {
  idArt: number | null
  nombre: string
  centavos: number
}

export interface UnegocioVentaTablero {
  idUnegocio: number | null
  nombre: string
  centavos: number
  porcentaje: number | null
  items: ItemVentaTablero[]
}

export interface ClienteVentaTablero {
  vientriId: number
  nombre: string
  centavos: number
  porUnegocio: Array<{ idUnegocio: number | null; nombre: string; centavos: number }>
}

export interface MesTendenciaTablero {
  mes: string
  totalCentavos: number
}

export interface TableroVentas {
  mes: string
  moneda: MonedaTablero
  generadoEn: string
  totalCentavos: number
  totalMesAnteriorCentavos: number
  variacionPorcentaje: number | null
  cantidadComprobantes: number
  cantidadClientes: number
  ticketPromedioCentavos: number
  concentracionTop5Porcentaje: number | null
  tendencia: MesTendenciaTablero[]
  porUnegocio: UnegocioVentaTablero[]
  topItems: ItemVentaTablero[]
  clientes: ClienteVentaTablero[]
  sinDatosDeItems: boolean
}

async function tableroFetch(path: string): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(resolveApiUrl(`/api/finanzas${path}`), { headers })
}

export async function fetchTableroVentas(input: { mes: string | null; moneda: MonedaTablero }): Promise<TableroVentas> {
  const params = new URLSearchParams()
  if (input.mes) params.set('mes', input.mes)
  params.set('moneda', input.moneda)
  const res = await tableroFetch(`/ventas-tablero?${params.toString()}`)
  if (!res.ok) {
    let mensaje = 'No se pudo cargar el tablero de Ventas'
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) mensaje = data.error
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new Error(mensaje)
  }
  return (await res.json()) as TableroVentas
}
