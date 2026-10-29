import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

/** Snapshot COPS (contrato front↔back). `rrhh` y `liquidacion` son opcionales. */
export interface CopsSnapshot {
  empresaId: string
  empresaNombre: string
  timestamp: string
  clientes: { activos: number; total: number }
  objetivos: number
  empleados: { activos: number }
  sla: { contratos: number; horasMes: number }
  operacionHoy: {
    enServicio: number
    deFranco: number
    ausentes: number
    vacantes: number
    novedades: number
  }
  planificacion: {
    proximoMes: string
    objetivosPublicados: number
    objetivosTotal: number
    /** Porcentaje 0–100. */
    pctPublicado: number
  }
  rrhh?: {
    personalHoy: {
      M: number
      T: number
      N: number
      D12: number
      N12: number
      RET: number
      otros: number
    }
    licenciasHoy: number
    ausenciasMes: number
  }
  liquidacion?: {
    periodoActual: string
    cicloStart: string
    cicloEnd: string
    ftCiclo: number
  }
}

/** Error con código HTTP para mensajes 401 / 503 en la pantalla. */
export class CopsApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function mensajeDeError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    if (data.error) return data.error
  } catch {
    /* el cuerpo no era JSON */
  }
  return fallback
}

/** Llama al proxy propio `/api/cops/snapshot` (nunca al endpoint externo). */
export async function fetchCopsSnapshot(): Promise<CopsSnapshot> {
  const user = auth.currentUser
  if (!user) throw new CopsApiError('No autenticado', 401)
  const token = await user.getIdToken()
  const res = await fetch(resolveApiUrl('/api/cops/snapshot'), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    throw new CopsApiError('Acceso no autorizado — contactar a administrador COPS', 401)
  }
  if (res.status === 503) {
    throw new CopsApiError('Datos aún no disponibles, reintentando...', 503)
  }
  if (!res.ok) {
    throw new CopsApiError(await mensajeDeError(res, 'No se pudo cargar el tablero COPS'), res.status)
  }
  return (await res.json()) as CopsSnapshot
}
