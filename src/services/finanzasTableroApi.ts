import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type MonedaTablero = 'ARS' | 'USD'

export type FormaCheque = 'fisico' | 'echeq'

export interface CategoriaMonto {
  nombre: string
  centavos: number
  porcentaje: number | null
  cantidad: number
}

export interface GrupoMonto {
  grupo: string
  centavos: number
  porcentaje: number | null
  faltaClasificar: boolean
  categorias: CategoriaMonto[]
}

export interface CostoBanco {
  banco: string
  centavos: number
  mesAnteriorCentavos: number
  variacionPorcentaje: number | null
  categorias: Array<{ nombre: string; centavos: number; cantidad: number }>
}

export interface ChequeVentana {
  id: string
  tipo: 'a_debitar' | 'a_cobrar'
  fechaPago: string
  fechaEfectiva: string
  banco: string
  contraparte: string
  numero: string
  forma: FormaCheque | null
  montoCentavos: number
}

export interface SemanaCheques {
  desde: string
  debitarCentavos: number
  acreditarCentavos: number
  netoCentavos: number
}

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
    costoBancarioMesAnteriorCentavos: number
    costoBancarioVariacionPorcentaje: number | null
  }
  porMes: Array<{ mes: string; entradasCentavos: number; salidasCentavos: number }>
  salidasPorGrupo: GrupoMonto[]
  entradasPorGrupo: GrupoMonto[]
  costoPorBanco: CostoBanco[]
  proximos30: {
    desde: string
    hasta: string
    totalADebitarCentavos: number
    totalACobrarCentavos: number
    compromisosCentavos: number
    compromisosCantidad: number
    cobrosCentavos: number
    cobrosCantidad: number
    saldoEstimadoCentavos: number
    porSemana: SemanaCheques[]
    cheques: ChequeVentana[]
  }
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
