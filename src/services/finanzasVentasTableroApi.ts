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
  centavosMesAnterior: number
  variacionPorcentaje: number | null
  caidaFuerte: boolean
  cantidadComprobantes: number
  cantidadClientes: number
  ticketPromedioCentavos: number
  concentracionTop5Porcentaje: number | null
  centavosMismoMesAnioAnterior: number
  variacionInteranualPorcentaje: number | null
}

export interface ClienteVentaTablero {
  vientriId: number
  nombre: string
  centavos: number
  porUnegocio: Array<{ idUnegocio: number | null; nombre: string; centavos: number }>
}

export interface ClientePerdidoTablero {
  vientriId: number
  nombre: string
  centavosMesAnterior: number
}

export interface MesTendenciaTablero {
  mes: string
  totalCentavos: number
}

export interface TendenciaUnegocioMes {
  mes: string
  porUnegocio: Array<{ idUnegocio: number | null; nombre: string; centavos: number }>
}

export interface ComparativoInteranual {
  mesAnioAnterior: string
  totalCentavos: number
  variacionPorcentaje: number | null
}

export interface ProyeccionVentas {
  totalProyectadoCentavos: number
  diasHabilesTranscurridos: number
  diasHabilesTotales: number
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
  tendenciaPorUnegocio: TendenciaUnegocioMes[]
  comparativoInteranual: ComparativoInteranual
  proyeccion: ProyeccionVentas | null
  porUnegocio: UnegocioVentaTablero[]
  topItems: ItemVentaTablero[]
  clientes: ClienteVentaTablero[]
  clientesNuevos: ClienteVentaTablero[]
  clientesPerdidos: ClientePerdidoTablero[]
  sinDatosDeItems: boolean
}

export interface HistorialClienteMes {
  mes: string
  totalCentavos: number
}

export interface HistorialCliente {
  vientriId: number
  tendencia: HistorialClienteMes[]
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

export async function fetchHistorialCliente(input: { vientriId: number; mes: string; moneda: MonedaTablero }): Promise<HistorialCliente> {
  const params = new URLSearchParams()
  params.set('vientriId', String(input.vientriId))
  params.set('mes', input.mes)
  params.set('moneda', input.moneda)
  const res = await tableroFetch(`/ventas-tablero/cliente-historial?${params.toString()}`)
  if (!res.ok) {
    let mensaje = 'No se pudo cargar el historial del cliente'
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) mensaje = data.error
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new Error(mensaje)
  }
  return (await res.json()) as HistorialCliente
}
