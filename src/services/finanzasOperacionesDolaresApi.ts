import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export interface OperacionDolaresDetalle {
  numeroCheque: string
  fechaCobro: string
  dias: number
  importeCentavos: number
  tasaEquivalenteCentavos: number
  descuentoCentavos: number
  importeLiquidarCentavos: number
}

export interface OperacionDolares {
  id: string
  fecha: string
  inversor: string
  inversorNormalizado: string
  cotizacion: number
  tasaMensual: number
  impuestoPorcentaje: number
  montoUsd: number
  cashCentavos: number
  detalles: OperacionDolaresDetalle[]
  totalChequesCentavos: number
  totalLiquidarCentavos: number
  totalInteresCentavos: number
  costoFinancieroPorcentaje: number
  notas: string
  estado: 'activa' | 'anulada'
  creadoPor: string
  creadoEn: string
  actualizadoEn: string
}

export interface OperacionDolaresInput {
  fecha: string
  inversor: string
  cotizacion: number
  tasaMensual: number
  impuestoPorcentaje: number
  montoUsd: number
  cashCentavos: number
  notas: string
  cheques: Array<{
    numeroCheque: string
    fechaCobro: string
    importeCentavos: number
  }>
}

async function headers() {
  const token = await auth.currentUser?.getIdToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function url(path = '') {
  return resolveApiUrl(`/api/finanzas/operaciones-dolares${path}`)
}

export async function listarOperacionesDolares(): Promise<OperacionDolares[]> {
  const res = await fetch(url(), { headers: await headers() })
  if (!res.ok) throw new Error('No se pudieron cargar las operaciones')
  const data = await res.json()
  return data.operaciones
}

export async function obtenerOperacionDolares(id: string): Promise<OperacionDolares> {
  const res = await fetch(url(`/${id}`), { headers: await headers() })
  if (!res.ok) throw new Error('No se pudo cargar la operación')
  const data = await res.json()
  return data.operacion
}

export async function crearOperacionDolares(input: OperacionDolaresInput): Promise<OperacionDolares> {
  const res = await fetch(url(), {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'No se pudo crear la operación')
  }
  const data = await res.json()
  return data.operacion
}

export async function actualizarOperacionDolares(id: string, input: OperacionDolaresInput): Promise<OperacionDolares> {
  const res = await fetch(url(`/${id}`), {
    method: 'PUT',
    headers: await headers(),
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'No se pudo actualizar la operación')
  }
  const data = await res.json()
  return data.operacion
}

export async function anularOperacionDolares(id: string): Promise<void> {
  const res = await fetch(url(`/${id}/anular`), {
    method: 'POST',
    headers: await headers(),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'No se pudo anular la operación')
  }
}
