import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export interface ProveedorGastoTablero {
  idProveedor: number | null
  nombre: string
  centavos: number
  cantidadComprobantes: number
  porcentaje: number | null
}

export interface UnegocioGastoTablero {
  idUnegocio: number | null
  nombre: string
  centavos: number
  porcentaje: number | null
}

export interface MesGastoTablero {
  mes: string
  centavos: number
}

export interface ComparativoAnual {
  anio: number
  centavos: number
  meses: number
}

export interface TableroCombustible {
  mes: string
  generadoEn: string
  totalCentavos: number
  totalMesAnteriorCentavos: number
  variacionPorcentaje: number | null
  totalMismoMesAnioAnteriorCentavos: number
  mesAnioAnterior: string
  variacionInteranualPorcentaje: number | null
  cantidadComprobantes: number
  ticketPromedioCentavos: number
  tendencia: MesGastoTablero[]
  comparativoAnual: ComparativoAnual[]
  porProveedor: ProveedorGastoTablero[]
  porUnegocio: UnegocioGastoTablero[]
  primerMesConDatos: string
}

async function tableroFetch(path: string): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(resolveApiUrl(`/api/finanzas${path}`), { headers })
}

export async function fetchTableroCombustible(input: { mes: string | null }): Promise<TableroCombustible> {
  const params = new URLSearchParams()
  if (input.mes) params.set('mes', input.mes)
  const res = await tableroFetch(`/combustible-tablero?${params.toString()}`)
  if (!res.ok) {
    let mensaje = 'No se pudo cargar el tablero de Combustible'
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) mensaje = data.error
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new Error(mensaje)
  }
  return (await res.json()) as TableroCombustible
}
