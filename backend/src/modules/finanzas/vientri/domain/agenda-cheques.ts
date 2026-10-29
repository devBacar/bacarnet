/**
 * Cómo entran los cheques de cartera propia (emitidos) de Vientri a la Agenda (compromisosPago).
 * Función pura: recibe cheques de Vientri y lo que ya está en la Agenda, y devuelve qué hacer.
 *
 * - Pendientes de pago real: en_cartera o pendiente_debito (no debitado / anulado / rechazado / entregado).
 * - Solo dirección emitido. Vientri es de solo lectura: acá solo se decide qué escribir en Bacarnet.
 * - La fecha de vencimiento en Bacarnet se respeta si Finanzas la reprogramó (no se pisa).
 * - Si el cheque se debitó → compromiso pagado. Si se anuló/rechazó/entregó/etc. → baja lógica (anulado).
 */
import type { EstadoChequeVientri, VientriChequeDoc } from './tipos.js'
import { ACTOR_VIENTRI } from './agenda.js'

export { ACTOR_VIENTRI }

/** Estados que todavía implican un pago pendiente en Bacarnet. */
export const ESTADOS_CHEQUE_PENDIENTE = new Set<EstadoChequeVientri>(['en_cartera', 'pendiente_debito'])

/** Debitado en el banco = el compromiso se pagó de verdad. */
export const ESTADOS_CHEQUE_PAGADO = new Set<EstadoChequeVientri>(['debitado'])

export const GRUPO_CHEQUE_AGENDA = 'Bancos' as const

export type CierreChequeAgenda = 'pagado' | 'anulado'

export interface DatosChequeAgenda {
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  /** AAAA-MM-DD */
  fecha: string
  grupo: typeof GRUPO_CHEQUE_AGENDA
  medioPago: 'cheque'
  vientriCheque: {
    clave: string
    estado: EstadoChequeVientri
    numero: string
    bancoNombre: string | null
    fechaVencimiento: string
  }
}

export interface ExistenteChequeAgenda {
  id: string
  estado: string
  anulado: boolean
  /** AAAA-MM-DD en la Agenda hoy. */
  fecha: string | null
  /** AAAA-MM-DD que mandó Vientri la última vez. */
  fechaVientri: string | null
  montoCentavos: number
  concepto: string
  proveedorONombre: string
  cerradoPorVientri: boolean
}

export type OperacionChequeAgenda =
  | { tipo: 'crear'; id: string; datos: DatosChequeAgenda }
  | { tipo: 'actualizar'; id: string; datos: DatosChequeAgenda; cambiarFecha: boolean }
  | { tipo: 'reabrir'; id: string; datos: DatosChequeAgenda }
  | { tipo: 'cerrar'; id: string; cierre: CierreChequeAgenda; motivo: string }

export function idAgendaVientriCheque(clave: string): string {
  return `vientri-cheque-${clave}`
}

export function esChequePendienteAgenda(c: VientriChequeDoc): boolean {
  return (
    c.direccion === 'emitido' &&
    !c.baja &&
    ESTADOS_CHEQUE_PENDIENTE.has(c.estado) &&
    Boolean(c.fechaVencimiento) &&
    c.montoCentavos > 0
  )
}

export function cierreParaEstadoCheque(estado: EstadoChequeVientri): CierreChequeAgenda {
  return ESTADOS_CHEQUE_PAGADO.has(estado) ? 'pagado' : 'anulado'
}

export function motivoCierreCheque(estado: EstadoChequeVientri): string {
  if (estado === 'debitado') return 'Debitado según Vientri'
  if (estado === 'anulado') return 'Anulado según Vientri'
  if (estado === 'rechazado') return 'Rechazado según Vientri'
  if (estado === 'entregado') return 'Entregado según Vientri (ya no pendiente)'
  return `Ya no pendiente en Vientri (${estado})`
}

function nombreDestinatario(c: VientriChequeDoc): string {
  const dest = c.destinatario?.trim()
  if (dest) return dest
  const librador = c.librador?.nombre?.trim()
  if (librador) return librador
  const entregadoA = c.entregadoA?.nombre?.trim()
  if (entregadoA) return entregadoA
  return 'Sin destinatario en Vientri'
}

export function datosDesdeCheque(c: VientriChequeDoc): DatosChequeAgenda {
  const fecha = (c.fechaVencimiento as string).slice(0, 10)
  const numero = c.serie ? `${c.serie}-${c.numero}` : c.numero
  const banco = c.bancoNombre?.trim()
  const concepto = banco ? `Cheque ${numero} · ${banco}` : `Cheque ${numero}`
  return {
    concepto,
    proveedorONombre: nombreDestinatario(c),
    montoCentavos: c.montoCentavos,
    fecha,
    grupo: GRUPO_CHEQUE_AGENDA,
    medioPago: 'cheque',
    vientriCheque: {
      clave: c.clave,
      estado: c.estado,
      numero: c.numero,
      bancoNombre: c.bancoNombre,
      fechaVencimiento: fecha,
    },
  }
}

export interface ResultadoPlanChequeAgenda {
  operaciones: OperacionChequeAgenda[]
  sinFecha: number
}

/**
 * Planifica altas/updates/cierres de compromisos desde cheques emitidos.
 * - `enVentana`: cheques dentro de la ventana (candidatos a crear/actualizar).
 * - `todosEmitidos`: todos los emitidos de la exportación (para cerrar si cambiaron de estado fuera de ventana).
 */
export function planAgendaCheques(opts: {
  enVentana: VientriChequeDoc[]
  todosEmitidos: VientriChequeDoc[]
  existentes: ExistenteChequeAgenda[]
}): ResultadoPlanChequeAgenda {
  const existentes = new Map(opts.existentes.map((e) => [e.id, e]))
  const porClave = new Map(opts.todosEmitidos.filter((c) => c.direccion === 'emitido').map((c) => [c.clave, c]))
  const pendientesGlobales = new Set(
    opts.todosEmitidos.filter((c) => esChequePendienteAgenda(c)).map((c) => c.clave),
  )
  const operaciones: OperacionChequeAgenda[] = []
  const vistos = new Set<string>()
  let sinFecha = 0

  for (const c of opts.enVentana) {
    if (c.direccion !== 'emitido' || c.baja) continue
    if (!ESTADOS_CHEQUE_PENDIENTE.has(c.estado)) continue
    if (!c.fechaVencimiento || c.montoCentavos <= 0) {
      if (ESTADOS_CHEQUE_PENDIENTE.has(c.estado) && !c.fechaVencimiento) sinFecha += 1
      continue
    }
    const id = idAgendaVientriCheque(c.clave)
    vistos.add(id)
    const datos = datosDesdeCheque(c)
    const ex = existentes.get(id)
    if (!ex) {
      operaciones.push({ tipo: 'crear', id, datos })
      continue
    }
    // Cerrado o anulado por Vientri y vuelve a pendiente: reabrir. Si lo cerró una persona, se respeta.
    if (ex.anulado || !exAbierto(ex)) {
      if (ex.cerradoPorVientri) operaciones.push({ tipo: 'reabrir', id, datos })
      continue
    }
    const fechaNoReprogramada = ex.fecha === ex.fechaVientri
    const cambiarFecha = fechaNoReprogramada && ex.fecha !== datos.fecha
    const cambio =
      cambiarFecha ||
      ex.fechaVientri !== datos.fecha ||
      ex.montoCentavos !== datos.montoCentavos ||
      ex.concepto !== datos.concepto ||
      ex.proveedorONombre !== datos.proveedorONombre
    if (cambio) operaciones.push({ tipo: 'actualizar', id, datos, cambiarFecha })
  }

  for (const ex of opts.existentes) {
    if (vistos.has(ex.id) || ex.anulado || !exAbierto(ex)) continue
    const clave = ex.id.replace(/^vientri-cheque-/, '')
    if (pendientesGlobales.has(clave)) continue
    const cheque = porClave.get(clave)
    if (!cheque) {
      operaciones.push({
        tipo: 'cerrar',
        id: ex.id,
        cierre: 'anulado',
        motivo: 'Ya no figura en Vientri',
      })
      continue
    }
    operaciones.push({
      tipo: 'cerrar',
      id: ex.id,
      cierre: cierreParaEstadoCheque(cheque.estado),
      motivo: motivoCierreCheque(cheque.estado),
    })
  }

  return { operaciones, sinFecha }
}

function exAbierto(ex: ExistenteChequeAgenda): boolean {
  return (
    !ex.anulado &&
    (ex.estado === 'pendiente' ||
      ex.estado === 'vencido' ||
      ex.estado === 'confeccionada_pendiente_autorizacion')
  )
}
