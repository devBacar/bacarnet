import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type MedioPagoHoy = 'transferencia' | 'efectivo' | 'cheque'

export interface SugerenciaBanco {
  id: string
  bancoNombre: string
  fecha: string
  descripcion: string
  montoCentavos: number
  cuentaId: string
}

export interface PagoHoy {
  id: string
  urgencia: string
  vencido: boolean
  vencidoTexto: string | null
  diasAtraso?: number
  aQuien: string
  concepto: string
  montoCentavos: number
  comoPagar: string
  medioPago: MedioPagoHoy
  proveedorONombre: string
  sugerenciasBanco: SugerenciaBanco[]
  /** Medio cheque y ya hay cheque emitido para el compromiso. */
  chequeEmitido?: boolean
  /** Aviso cuando el cheque ya se emitió y solo falta debitarlo. */
  aviso?: string | null
  moneda?: 'ARS' | 'USD'
  /** La fecha se estimó según la historia del proveedor. */
  estimada?: boolean
}

export interface IngresoHoy {
  id: string
  cliente: string
  concepto: string
  montoCentavos: number
  atrasado: boolean
  atrasadoTexto: string | null
  email: string | null
  llego: boolean
  bancoNombre: string | null
  movimientoId: string | null
  cuentaId: string | null
  textoReclamo: string
  estimada?: boolean
}

export interface BancoHoy {
  bancoNombre: string
  saldoAhoraCentavos: number
  descubiertoCentavos: number | null
  quedaParaUsarCentavos: number
}

export interface SemanaHoy {
  fecha: string
  dia: string
  aPagarCentavos: number
  aCobrarCentavos: number
  quedaCentavos: number
  esElMasPesado: boolean
}

export interface CobroAtrasadoHoy {
  id: string
  cliente: string
  concepto: string
  montoCentavos: number
  haceDias: number
  haceTexto: string
  email: string | null
  textoReclamo: string
  estimada?: boolean
}

export interface ChequeADebitarHoy {
  id: string
  numero: string
  destinatario: string
  banco: string
  montoCentavos: number
  cuando: 'Hoy' | 'Mañana'
}

export interface ChequesADebitarHoy {
  filas: ChequeADebitarHoy[]
  totalCentavos: number
  impactos: string[]
}

export interface ChequeCarteraHoy {
  id: string
  numero: string
  emisor: string
  banco: string
  fechaPago: string
  montoCentavos: number
}

export interface HoyResponse {
  saludo: string
  fecha: string
  vacio: boolean
  /** Solo lo que vence hoy. */
  pagos: { totalCentavos: number; filas: PagoHoy[] }
  /** Vencimiento ya pasado; no suma en el día. */
  pagosAtrasados?: { totalCentavos: number; filas: PagoHoy[] }
  /** Facturas de Vientri sin vencimiento: hay que ponerles el día de pago. */
  pagosSinFecha?: { totalCentavos: number; filas: PagoHoy[] }
  ingresos: { filas: IngresoHoy[] }
  cobrosSinFecha?: { cantidad: number; totalCentavos: number }
  dia: {
    saldoInicialCentavos: number
    pagosCentavos: number
    cobrosCentavos: number
    saldoFinalCentavos: number
    frase: string
    bancos: BancoHoy[]
    avisoDescubierto: string | null
  }
  prevision: {
    semana: SemanaHoy[] | null
    diaMasPesado: string | null
    cobrosAtrasados: CobroAtrasadoHoy[]
    firmas: { cantidad: number; montoCentavos: number; texto: string } | null
    chequesADebitar: ChequesADebitarHoy
  }
  /** Hay compromisos, cobros o cheques con `demo: true` (solo en el entorno de pruebas). */
  hayDatosDemo: boolean
}

async function hoyFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(resolveApiUrl(`/api/finanzas/hoy${path}`), { ...init, headers })
}

async function leerError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchHoy(): Promise<HoyResponse> {
  const res = await hoyFetch('/')
  if (!res.ok) await leerError(res, 'No pude armar el día')
  return res.json() as Promise<HoyResponse>
}

/** Borra los datos de ejemplo. El backend responde 403 fuera del entorno de pruebas. */
export async function borrarDatosDemoHoy(): Promise<string> {
  const res = await hoyFetch('/demo', { method: 'DELETE' })
  if (!res.ok) await leerError(res, 'No se pudieron borrar los datos de ejemplo')
  const data = (await res.json()) as { mensaje: string }
  return data.mensaje
}

export async function pagarHoyEnEfectivo(
  compromisoId: string,
  input: { cajaId: string; comprobante?: File | null },
): Promise<string> {
  const form = new FormData()
  form.set('cajaId', input.cajaId)
  if (input.comprobante) form.set('comprobante', input.comprobante)
  const res = await hoyFetch(`/compromisos/${encodeURIComponent(compromisoId)}/efectivo`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) await leerError(res, 'No se pudo anotar el pago')
  const data = (await res.json()) as { mensaje: string }
  return data.mensaje
}

export async function yaPagueHoy(
  compromisoId: string,
  body: {
    medioPago: MedioPagoHoy
    fechaPago: string
    cuentaId?: string
    movimientoId?: string
  },
): Promise<string> {
  const res = await hoyFetch(`/compromisos/${encodeURIComponent(compromisoId)}/ya-pague`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) await leerError(res, 'No se pudo marcar como pagado')
  const data = (await res.json()) as { mensaje: string }
  return data.mensaje
}

export async function fetchCarteraHoy(montoCentavos: number): Promise<ChequeCarteraHoy[]> {
  const res = await hoyFetch(`/cartera?montoCentavos=${montoCentavos}`)
  if (!res.ok) await leerError(res, 'No pude mirar los cheques de la cartera')
  const data = (await res.json()) as { cheques: ChequeCarteraHoy[] }
  return data.cheques
}

export type PartePagoCombinado =
  | { medio: 'efectivo'; cajaId: string; montoCentavos: number }
  | { medio: 'cheque_cartera'; chequeId: string }
  | {
      medio: 'cheque_propio'
      montoCentavos: number
      cheque: { tipo: 'echeq' | 'fisico'; numero: string; banco: string; fechaPago: string }
    }

/** Varias formas juntas. Las transferencias no van acá: se arman en el flujo de firma. */
export async function pagarHoyCombinado(
  compromisoId: string,
  partes: PartePagoCombinado[],
  comprobantes: Array<{ indice: number; archivo: File }> = [],
): Promise<string> {
  const body =
    comprobantes.length > 0
      ? (() => {
          const form = new FormData()
          form.set('partes', JSON.stringify(partes))
          for (const item of comprobantes) form.set(`comprobante_${item.indice}`, item.archivo)
          return form
        })()
      : JSON.stringify({ partes })
  const res = await hoyFetch(`/compromisos/${encodeURIComponent(compromisoId)}/pago-combinado`, {
    method: 'POST',
    body,
  })
  if (!res.ok) await leerError(res, 'No se pudo anotar el pago')
  const data = (await res.json()) as { mensaje: string }
  return data.mensaje
}

export async function pagarHoyConCheque(compromisoId: string, chequeId: string): Promise<string> {
  const res = await hoyFetch(`/compromisos/${encodeURIComponent(compromisoId)}/cheque`, {
    method: 'POST',
    body: JSON.stringify({ chequeId }),
  })
  if (!res.ok) await leerError(res, 'No se pudo endosar el cheque')
  const data = (await res.json()) as { mensaje: string }
  return data.mensaje
}

export async function reprogramarPagoHoy(compromisoId: string, fecha: string): Promise<string> {
  const res = await hoyFetch(`/compromisos/${encodeURIComponent(compromisoId)}/reprogramar`, {
    method: 'POST',
    body: JSON.stringify({ fecha }),
  })
  if (!res.ok) await leerError(res, 'No se pudo cambiar el día')
  const data = (await res.json()) as { mensaje: string }
  return data.mensaje
}

export async function confirmarCobroHoy(cobroId: string, movimientoId: string): Promise<string> {
  const res = await hoyFetch(`/cobros/${encodeURIComponent(cobroId)}/confirmar`, {
    method: 'POST',
    body: JSON.stringify({ movimientoId }),
  })
  if (!res.ok) await leerError(res, 'No se pudo confirmar el cobro')
  const data = (await res.json()) as { mensaje: string }
  return data.mensaje
}

export async function cobrarHoyEnEfectivo(
  cobroId: string,
  input: { cajaId: string; comprobante?: File | null },
): Promise<string> {
  const form = new FormData()
  form.set('cajaId', input.cajaId)
  if (input.comprobante) form.set('comprobante', input.comprobante)
  const res = await hoyFetch(`/cobros/${encodeURIComponent(cobroId)}/efectivo`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) await leerError(res, 'No se pudo anotar el ingreso')
  const data = (await res.json()) as { mensaje: string }
  return data.mensaje
}

export async function reprogramarCobroHoy(cobroId: string, fecha: string): Promise<string> {
  const res = await hoyFetch(`/cobros/${encodeURIComponent(cobroId)}/reprogramar`, {
    method: 'POST',
    body: JSON.stringify({ fecha }),
  })
  if (!res.ok) await leerError(res, 'No se pudo cambiar el día')
  const data = (await res.json()) as { mensaje: string }
  return data.mensaje
}
