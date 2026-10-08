import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type MonedaTablero = 'ARS' | 'USD'

export interface ItemTablero {
  etiqueta: string
  fecha: string
  centavos: number
}

export interface BloqueTablero {
  cantidad: number
  centavos: number
  items: ItemTablero[]
}

export interface ContraparteTablero {
  nombre: string
  centavos: number
  porcentaje: number | null
}

export type AlertaTablero =
  | { id: string; tipo: 'descubierto'; banco: string; dias: number }
  | { id: string; tipo: 'cheques_rechazados'; cantidad: number; centavos: number }
  | { id: string; tipo: 'costo_bancario'; porcentaje: number }
  | { id: string; tipo: 'salidas_mayores' }

export interface TableroFinanzas {
  mes: string
  moneda: MonedaTablero
  hoy: string
  generadoEn: string
  monedas: MonedaTablero[]
  meses: string[]
  resumen: {
    saldoHoyCentavos: number
    saldoHace30Centavos: number | null
    variacion30Centavos: number | null
    cuentasSinSaldoPrevio: string[]
    entradasCentavos: number
    salidasCentavos: number
    costoBancarioCentavos: number
    costoBancarioPorcentaje: number | null
  }
  porMes: Array<{ mes: string; entradasCentavos: number; salidasCentavos: number }>
  salidasPorGrupo: Array<{
    grupo: string
    centavos: number
    porcentaje: number | null
    categorias: Array<{ nombre: string; centavos: number; porcentaje: number | null }>
  }>
  costoPorBanco: Array<{
    banco: string
    centavos: number
    mesAnteriorCentavos: number
    variacionPorcentaje: number | null
  }>
  contrapartes: {
    entradas: ContraparteTablero[]
    salidas: ContraparteTablero[]
    concentracionCobros: boolean
    concentracionPorcentaje: number | null
    entradasSinIdentificarPorcentaje: number | null
    salidasSinIdentificarPorcentaje: number | null
  }
  proximos30: {
    desde: string
    hasta: string
    chequesADebitar: BloqueTablero
    chequesACobrar: BloqueTablero
    compromisos: BloqueTablero
    cobros: BloqueTablero
    saldoEstimadoCentavos: number
  }
  alertas: AlertaTablero[]
}

async function tableroFetch(path: string): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(resolveApiUrl(`/api/finanzas${path}`), { headers })
}

export async function fetchTableroFinanzas(input: { mes: string | null; moneda: MonedaTablero }): Promise<TableroFinanzas> {
  const params = new URLSearchParams()
  if (input.mes) params.set('mes', input.mes)
  params.set('moneda', input.moneda)
  const res = await tableroFetch(`/tablero?${params.toString()}`)
  if (!res.ok) {
    let mensaje = 'No se pudo cargar el tablero de Finanzas'
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) mensaje = data.error
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new Error(mensaje)
  }
  return (await res.json()) as TableroFinanzas
}
