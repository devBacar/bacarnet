import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export interface TransferenciaConfeccionadaItem {
  id: string
  compromisoPagoId: string | null
  tipo: string
  cuentaDebitoId: string
  cuentaCreditoCbu: string
  montoCentavos: number
  operationId: string
  processId: string | null
  estado: string
  erroresInterbanking: string[] | null
}

async function transferenciasFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/transferencias${path}`), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

export type TransferenciaEstadoUi =
  | 'confeccionada'
  | 'pendiente_proceso'
  | 'rechazada'
  | 'efectivizada'
  | 'cancelada'

export type TransferenciaTipoUi =
  | 'cuentas_propias'
  | 'sueldos'
  | 'proveedores'
  | 'terceros'
  | 'pagos_arca'

export interface TransferenciaHistorialItem {
  id: string
  estadoAnterior: string | null
  estadoNuevo: string
  fecha: string | null
  origen: string
  nota: string | null
}

export interface TransferenciaCandidatoMovimiento {
  id: string
  fechaProceso: string
  montoCentavos: number
  descripcion: string
}

export interface TransferenciaListItem {
  id: string
  compromisoPagoId: string | null
  origen?: 'compromiso' | 'directa' | string
  tipo: TransferenciaTipoUi | string
  estado: TransferenciaEstadoUi | string
  estadoInterbanking?: string | null
  estadoInterbankingRotulo?: string | null
  estadoInterbankingTono?: 'pendiente' | 'enviada' | 'hecha' | 'rechazada' | null
  estadoInterbankingActualizadoAt?: string | null
  montoCentavos: number
  concepto: string | null
  referencia?: string | null
  fechaConfeccion: string | null
  operationId: string
  cuentaDebitoId: string
  direccion: string
  erroresInterbanking: string[] | null
  puedeCancelar: boolean
  movimientoId: string | null
  requiereConfirmacionManual: boolean
  candidatos: TransferenciaCandidatoMovimiento[]
}

export interface TransferenciasListFilters {
  estado?: string
  cuentaId?: string
  tipo?: string
  desde?: string
  hasta?: string
}

export async function fetchTransferencias(
  filters: TransferenciasListFilters = {},
): Promise<TransferenciaListItem[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value?.trim()) params.set(key, value.trim())
  }
  const qs = params.toString()
  const res = await transferenciasFetch(qs ? `/?${qs}` : '/')
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    transferencias?: TransferenciaListItem[]
  }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudo cargar el historial de transferencias')
  return payload.transferencias ?? []
}

export async function fetchTransferenciaHistorial(
  transferenciaId: string,
): Promise<TransferenciaHistorialItem[]> {
  const res = await transferenciasFetch(`/${encodeURIComponent(transferenciaId)}/historial`)
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    historial?: TransferenciaHistorialItem[]
  }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudo leer el historial')
  return payload.historial ?? []
}

export async function confirmarMovimientoTransferencia(
  transferenciaId: string,
  movimientoId: string,
): Promise<void> {
  const res = await transferenciasFetch(
    `/${encodeURIComponent(transferenciaId)}/confirmar-movimiento`,
    {
      method: 'POST',
      body: JSON.stringify({ movimientoId }),
    },
  )
  const payload = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudo confirmar el movimiento')
}

export async function cancelarTransferenciaConfeccionada(transferenciaId: string): Promise<{
  transferencia: TransferenciaConfeccionadaItem
  compromiso: {
    id: string
    estado: string
    transferenciaConfeccionadaId: string | null
  } | null
  nota: string
}> {
  const res = await transferenciasFetch(`/${encodeURIComponent(transferenciaId)}/cancelar`, {
    method: 'POST',
    body: '{}',
  })
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    transferencia?: TransferenciaConfeccionadaItem
    compromiso?: {
      id: string
      estado: string
      transferenciaConfeccionadaId: string | null
    }
    nota?: string
  }
  if (!res.ok || !payload.transferencia) {
    throw new Error(payload.error ?? 'No se pudo marcar la transferencia como cancelada')
  }
  return {
    transferencia: payload.transferencia,
    compromiso: payload.compromiso ?? null,
    nota: payload.nota ?? '',
  }
}

export async function confeccionarTransferencia(body: {
  compromisoPagoId: string
  cuentaCreditoCbu: string
  cuentaDebitoId?: string
  tipo?: 'cuentas_propias' | 'proveedores'
}): Promise<{ transferencia: TransferenciaConfeccionadaItem; provider: string }> {
  const res = await transferenciasFetch('/confeccionar', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    errores?: string[]
    transferencia?: TransferenciaConfeccionadaItem
  }
  if (!res.ok) {
    throw new Error(payload.errores?.[0] ?? payload.error ?? 'No se pudo confeccionar la transferencia')
  }
  return payload as { transferencia: TransferenciaConfeccionadaItem; provider: string }
}

export type TransferenciaDirectaTipo = 'cuentas_propias' | 'terceros' | 'proveedores'

export class TransferenciaDirectaError extends Error {
  readonly status: number
  readonly requiereConfirmacion: boolean
  readonly disponibleCentavos: number | null

  constructor(
    message: string,
    status: number,
    extra?: { requiereConfirmacion?: boolean; disponibleCentavos?: number | null },
  ) {
    super(message)
    this.name = 'TransferenciaDirectaError'
    this.status = status
    this.requiereConfirmacion = extra?.requiereConfirmacion === true
    this.disponibleCentavos = extra?.disponibleCentavos ?? null
  }
}

export interface ConfeccionDirectaBody {
  cuentaDebitoId: string
  tipo: TransferenciaDirectaTipo
  destino: {
    cbu?: string
    nombre?: string
    cuit?: string | null
    cuentaId?: string
    tipoCuenta?: TipoCuentaDestinatario
  }
  montoCentavos: number
  concepto: string
  referencia?: string
  codigoConcepto?: string
  disclaimerAceptado?: boolean
  idempotencyKey: string
  confirmarSinFondos?: boolean
}

export async function confeccionarTransferenciaDirecta(
  body: ConfeccionDirectaBody,
): Promise<{ transferencia: TransferenciaConfeccionadaItem; provider: string }> {
  const res = await transferenciasFetch('/confeccionar-directa', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    errores?: string[]
    transferencia?: TransferenciaConfeccionadaItem
    requiereConfirmacion?: boolean
    disponibleCentavos?: number
  }
  if (!res.ok) {
    throw new TransferenciaDirectaError(
      payload.errores?.[0] ?? payload.error ?? 'No se pudo confeccionar la transferencia',
      res.status,
      {
        requiereConfirmacion: payload.requiereConfirmacion === true,
        disponibleCentavos: payload.disponibleCentavos ?? null,
      },
    )
  }
  if (!payload.transferencia) {
    throw new TransferenciaDirectaError('No se pudo confeccionar la transferencia', res.status)
  }
  return { transferencia: payload.transferencia, provider: '' }
}

export interface ActualizarEstadosResultado {
  revisadas: number
  actualizadas: number
  sinCambio: number
  sinCoincidencia: number
  ambiguas: number
}

export async function actualizarEstadosTransferencias(): Promise<ActualizarEstadosResultado> {
  const res = await transferenciasFetch('/actualizar-estados', {
    method: 'POST',
    body: '{}',
  })
  const payload = (await res.json().catch(() => ({}))) as ActualizarEstadosResultado & { error?: string }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudieron actualizar los estados')
  return payload
}

export type DestinatarioTipo = 'terceros' | 'proveedores'

export type TipoCuentaDestinatario = 'CC' | 'CA'

export interface DestinatarioItem {
  id: string
  nombre: string
  cbu: string
  cuit: string | null
  alias: string | null
  bancoNombre: string | null
  tipo: DestinatarioTipo
  tipoCuenta: TipoCuentaDestinatario | null
  usos: number
  ultimoUsoAt: string | null
  sugerido: boolean
}

function normalizarDestinatario(item: DestinatarioItem): DestinatarioItem {
  const tipo = item.tipoCuenta
  return {
    ...item,
    tipoCuenta: tipo === 'CC' || tipo === 'CA' ? tipo : null,
  }
}

async function destinatariosFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/destinatarios${path}`), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

export async function fetchDestinatarios(query: { q?: string; tipo?: DestinatarioTipo } = {}): Promise<DestinatarioItem[]> {
  const params = new URLSearchParams()
  if (query.q?.trim()) params.set('q', query.q.trim())
  if (query.tipo) params.set('tipo', query.tipo)
  const qs = params.toString()
  const res = await destinatariosFetch(qs ? `/?${qs}` : '/')
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    destinatarios?: DestinatarioItem[]
  }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudo cargar la agenda de destinatarios')
  return (payload.destinatarios ?? []).map(normalizarDestinatario)
}

export async function crearDestinatario(body: {
  nombre: string
  cbu: string
  cuit?: string | null
  alias?: string | null
  tipo: DestinatarioTipo
  tipoCuenta?: TipoCuentaDestinatario | null
}): Promise<DestinatarioItem> {
  const res = await destinatariosFetch('/', { method: 'POST', body: JSON.stringify(body) })
  const payload = (await res.json().catch(() => ({}))) as { error?: string; destinatario?: DestinatarioItem }
  if (!res.ok || !payload.destinatario) throw new Error(payload.error ?? 'No se pudo guardar el destinatario')
  return normalizarDestinatario(payload.destinatario)
}

export async function actualizarDestinatario(
  id: string,
  body: {
    nombre?: string
    alias?: string | null
    cuit?: string | null
    tipo?: DestinatarioTipo
    tipoCuenta?: TipoCuentaDestinatario | null
  },
): Promise<DestinatarioItem> {
  const res = await destinatariosFetch(`/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => ({}))) as { error?: string; destinatario?: DestinatarioItem }
  if (!res.ok || !payload.destinatario) throw new Error(payload.error ?? 'No se pudo editar el destinatario')
  return normalizarDestinatario(payload.destinatario)
}

export async function eliminarDestinatario(id: string): Promise<void> {
  const res = await destinatariosFetch(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
  const payload = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudo borrar el destinatario')
}
