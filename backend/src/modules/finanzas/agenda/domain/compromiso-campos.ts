import type { MedioPago, MonedaCompromiso } from './agenda.types.js'
import { parsePrioridadUrgencia, type PrioridadUrgencia } from './agenda.prioridad.js'
import { esGrupoCompromiso, GRUPO_COMPROMISO_DEFAULT, type GrupoCompromiso } from './grupos-compromiso.js'

const MEDIOS: readonly MedioPago[] = ['transferencia', 'cheque', 'efectivo']
const OBSERVACION_MAX = 500

export interface CamposPlanillaCompromiso {
  grupo: GrupoCompromiso
  moneda: MonedaCompromiso
  deudaTotalCentavos: number | null
  cuotaNumero: number | null
  cuotaTotal: number | null
  observacion: string | null
}

export interface EdicionCompromiso extends Partial<CamposPlanillaCompromiso> {
  concepto?: string
  proveedorONombre?: string
  montoCentavos?: number
  fechaVencimiento?: Date
  medioPago?: MedioPago
  urgenciaManual?: PrioridadUrgencia | null
  esViatico?: boolean
  beneficiarioEmpleado?: string | null
}

export function normalizarGrupo(value: unknown): GrupoCompromiso {
  return typeof value === 'string' && esGrupoCompromiso(value) ? value : GRUPO_COMPROMISO_DEFAULT
}

export function normalizarMoneda(value: unknown): MonedaCompromiso {
  return value === 'USD' ? 'USD' : 'ARS'
}

export function normalizarCentavosOpcional(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function normalizarCuota(
  numero: unknown,
  total: unknown,
): { cuotaNumero: number | null; cuotaTotal: number | null } {
  if (
    typeof numero === 'number' &&
    typeof total === 'number' &&
    Number.isInteger(numero) &&
    Number.isInteger(total) &&
    numero > 0 &&
    total > 0 &&
    numero <= total
  ) {
    return { cuotaNumero: numero, cuotaTotal: total }
  }
  return { cuotaNumero: null, cuotaTotal: null }
}

export function normalizarObservacion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const texto = value.trim()
  if (!texto) return null
  return texto.slice(0, OBSERVACION_MAX)
}

export function textoCuota(numero: number | null, total: number | null): string | null {
  if (numero == null || total == null) return null
  return `${numero} de ${total}`
}

function vacio(value: unknown): boolean {
  return value == null || value === ''
}

export function leerGrupo(value: unknown, cuandoVacio: 'default' | 'error'): GrupoCompromiso {
  if (vacio(value)) {
    if (cuandoVacio === 'default') return GRUPO_COMPROMISO_DEFAULT
    throw new Error('Elegí un grupo de la lista')
  }
  if (typeof value === 'string' && esGrupoCompromiso(value)) return value
  throw new Error('Elegí un grupo de la lista')
}

export function leerMoneda(value: unknown, cuandoVacio: 'default' | 'error'): MonedaCompromiso {
  if (vacio(value)) {
    if (cuandoVacio === 'default') return 'ARS'
    throw new Error('La moneda tiene que ser pesos o dólares')
  }
  if (value === 'ARS' || value === 'USD') return value
  throw new Error('La moneda tiene que ser pesos o dólares')
}

export function leerCentavosOpcional(value: unknown, etiqueta: string): number | null {
  if (vacio(value)) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${etiqueta} tiene que ser un importe mayor a cero`)
  }
  return value
}

export function leerCuota(
  numero: unknown,
  total: unknown,
): { cuotaNumero: number | null; cuotaTotal: number | null } {
  if (vacio(numero) && vacio(total)) return { cuotaNumero: null, cuotaTotal: null }
  if (
    typeof numero !== 'number' ||
    typeof total !== 'number' ||
    !Number.isInteger(numero) ||
    !Number.isInteger(total) ||
    numero <= 0 ||
    total <= 0
  ) {
    throw new Error('La cuota tiene que ser un número y un total')
  }
  if (numero > total) throw new Error('El número de cuota no puede pasar el total')
  return { cuotaNumero: numero, cuotaTotal: total }
}

export function leerObservacion(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('La observación tiene que ser texto')
  const texto = value.trim()
  if (!texto) return null
  if (texto.length > OBSERVACION_MAX) throw new Error('La observación es demasiado larga')
  return texto
}

/** Un día `AAAA-MM-DD` se guarda al mediodía de Argentina para que no se corra. */
export function parseFechaDia(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const texto = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const fecha = new Date(`${texto}T12:00:00-03:00`)
    return Number.isNaN(fecha.getTime()) ? undefined : fecha
  }
  const fecha = new Date(texto)
  return Number.isNaN(fecha.getTime()) ? undefined : fecha
}

export function leerAltaPlanilla(body: Record<string, unknown>): CamposPlanillaCompromiso {
  return {
    grupo: leerGrupo(body.grupo, 'default'),
    moneda: leerMoneda(body.moneda, 'default'),
    deudaTotalCentavos: leerCentavosOpcional(body.deudaTotalCentavos, 'La deuda total'),
    ...leerCuota(body.cuotaNumero, body.cuotaTotal),
    observacion: body.observacion == null ? null : leerObservacion(body.observacion),
  }
}

function leerTexto(value: unknown, mensajeVacio: string): string {
  const texto = typeof value === 'string' ? value.trim() : ''
  if (!texto) throw new Error(mensajeVacio)
  return texto
}

export function leerEdicionCompromiso(body: Record<string, unknown>): EdicionCompromiso {
  const patch: EdicionCompromiso = {}
  if ('concepto' in body) patch.concepto = leerTexto(body.concepto, 'Falta el concepto')
  if ('proveedorONombre' in body) {
    patch.proveedorONombre = leerTexto(body.proveedorONombre, 'Falta a quién se le paga')
  }
  if ('montoCentavos' in body) {
    const monto = body.montoCentavos
    if (typeof monto !== 'number' || !Number.isInteger(monto) || monto <= 0) {
      throw new Error('montoCentavos inválido')
    }
    patch.montoCentavos = monto
  }
  if ('fechaVencimiento' in body) {
    const fecha = parseFechaDia(body.fechaVencimiento)
    if (!fecha) throw new Error('Elegí el día')
    patch.fechaVencimiento = fecha
  }
  if ('medioPago' in body) {
    if (typeof body.medioPago !== 'string' || !MEDIOS.includes(body.medioPago as MedioPago)) {
      throw new Error('Elegí el medio de pago')
    }
    patch.medioPago = body.medioPago as MedioPago
  }
  if ('urgenciaManual' in body) {
    if (body.urgenciaManual === null || body.urgenciaManual === '') {
      patch.urgenciaManual = null
    } else {
      const urgencia = parsePrioridadUrgencia(body.urgenciaManual)
      if (!urgencia) throw new Error('urgenciaManual inválida')
      patch.urgenciaManual = urgencia
    }
  }
  if ('esViatico' in body) {
    if (typeof body.esViatico !== 'boolean') throw new Error('El viático tiene que ser sí o no')
    patch.esViatico = body.esViatico
  }
  if ('beneficiarioEmpleado' in body) {
    patch.beneficiarioEmpleado =
      typeof body.beneficiarioEmpleado === 'string' ? body.beneficiarioEmpleado.trim() || null : null
  }
  if ('grupo' in body) patch.grupo = leerGrupo(body.grupo, 'error')
  if ('moneda' in body) patch.moneda = leerMoneda(body.moneda, 'error')
  if ('deudaTotalCentavos' in body) {
    patch.deudaTotalCentavos = leerCentavosOpcional(body.deudaTotalCentavos, 'La deuda total')
  }
  if ('cuotaNumero' in body || 'cuotaTotal' in body) {
    Object.assign(patch, leerCuota(body.cuotaNumero, body.cuotaTotal))
  }
  if ('observacion' in body) patch.observacion = leerObservacion(body.observacion)
  if (Object.keys(patch).length === 0) throw new Error('No hay cambios')
  return patch
}
