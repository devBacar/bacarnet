import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type NivelCarga = 'liviano' | 'medio' | 'pesado' | 'sin_pagos'

export interface DiaCarga {
  fecha: string
  tipo: 'habil' | 'finde' | 'feriado'
  esHoy: boolean
  totalCentavos: number
  pendienteCentavos: number
  cantidad: number
  nivel: NivelCarga
  vsPromedio: number | null
}

export interface CargaMes {
  mes: string
  promedioCentavos: number
  diasHabiles: number
  totalCentavos: number
}

export interface CargaDiaria {
  desde: string
  hasta: string
  tipoCambio: number | null
  dias: DiaCarga[]
  meses: CargaMes[]
  arrastreCentavos: number
  diasMasLivianos: string[]
}

export async function fetchCargaDiaria(params: { desde?: string; dias?: number } = {}): Promise<CargaDiaria> {
  const token = await auth.currentUser?.getIdToken()
  const query = new URLSearchParams()
  if (params.desde) query.set('desde', params.desde)
  if (params.dias) query.set('dias', String(params.dias))
  const res = await fetch(resolveApiUrl(`/api/finanzas/carga-diaria?${query.toString()}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? 'No se pudo calcular la carga de pagos')
  }
  return (await res.json()) as CargaDiaria
}
