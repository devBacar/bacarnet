/**
 * Cómo entran las facturas pendientes de Vientri a la Agenda de Finanzas (compromisos de pago y cobros esperados).
 * Función pura: recibe lo que vino de Vientri y lo que ya está en la Agenda, y devuelve qué hay que hacer.
 *
 * - De Vientri vienen (y no se editan en Bacarnet): comprobante, proveedor/cliente, saldo, vencimiento y moneda.
 * - Lo que carga Finanzas (prioridad, medio de pago, grupo, nota) no se toca.
 * - La fecha solo se actualiza si nadie la reprogramó en Bacarnet.
 * - Si la factura ya no tiene saldo en Vientri, se cierra (pagada / cobrada) "según Vientri".
 * - Si sigue con saldo pero quedó fuera de los 12 meses, no se toca.
 */
import type { LegDesglosePago } from './desglose-pago.js'
import { plazoPara, type PlazoEstimado, type PlazosHistoricos } from './plazos.js'
import type { VientriPendienteDoc } from './tipos.js'

export const ACTOR_VIENTRI = 'vientri'

export type LadoAgenda = 'pagar' | 'cobrar'

export interface DatosVientriAgenda {
  concepto: string
  nombre: string
  montoCentavos: number
  /** AAAA-MM-DD */
  fecha: string
  moneda: 'ARS' | 'USD'
  grupo: 'Proveedores' | 'Impositivo'
  vientri: {
    clave: string
    comprobante: string
    tipo: string | null
    cuit: string | null
    totalCentavos: number
    fechaVencimiento: string
    sinFechaDePago: boolean
    /** La fecha de la Agenda no viene de Vientri: se calculó con lo que tarda esta persona en pagar o cobrar. */
    fechaEstimada: boolean
    plazoDias: number | null
    plazoOrigen: 'historia' | 'general' | null
  }
}

/** Lo mínimo que hace falta saber de un compromiso/cobro de Vientri que ya está en la Agenda. */
export interface ExistenteAgenda {
  id: string
  abierto: boolean
  cerradoPorVientri: boolean
  /** AAAA-MM-DD de la fecha que tiene hoy en la Agenda. */
  fecha: string | null
  /** AAAA-MM-DD de la última fecha que mandó Vientri. */
  fechaVientri: string | null
  montoCentavos: number
  concepto: string
  nombre: string
  moneda: string | null
  sinFecha?: boolean | null
  fechaEstimada?: boolean | null
}

/** Compromiso o cobro cargado a mano (sin origen Vientri), para avisar posibles duplicados. */
export interface ManualAgenda {
  id: string
  /** AAAA-MM-DD */
  fecha: string | null
  montoCentavos: number
  descripcion: string
}

export interface PosibleDuplicado {
  id: string
  descripcion: string
}

/** Mismo importe exacto y fechas a 30 días o menos: puede ser lo mismo cargado dos veces. */
export const DIAS_DUPLICADO = 30

export type OperacionAgenda =
  | { tipo: 'crear'; id: string; datos: DatosVientriAgenda; posibleDuplicado: PosibleDuplicado | null }
  | { tipo: 'actualizar'; id: string; datos: DatosVientriAgenda; cambiarFecha: boolean }
  | { tipo: 'reabrir'; id: string; datos: DatosVientriAgenda }
  | { tipo: 'cerrar'; id: string; desglosePago: LegDesglosePago[] | null }

export function idAgendaVientri(clave: string): string {
  return `vientri-${clave}`
}

function sumarDias(ymd: string, dias: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function datosDesdePendiente(p: VientriPendienteDoc, fechaDatos: string, plazo?: PlazoEstimado): DatosVientriAgenda {
  const fechaVientri = (p.fechaVencimiento ?? p.fecha ?? fechaDatos).slice(0, 10)
  // Vientri no tiene vencimiento propio: el "vencimiento" es la misma fecha de la factura.
  const sinFechaDePago = !p.fechaVencimiento || p.fechaVencimiento.slice(0, 10) === (p.fecha ?? '').slice(0, 10)
  const estimada = sinFechaDePago && plazo !== undefined
  // Sin vencimiento en Vientri, la fecha es la de la factura más lo que suele tardar esta persona.
  const fecha = estimada ? sumarDias((p.fecha ?? fechaDatos).slice(0, 10), plazo.dias) : fechaVientri
  return {
    concepto: p.comprobante,
    nombre: p.persona?.nombre?.trim() || 'Sin nombre en Vientri',
    montoCentavos: p.pendienteCentavos,
    fecha,
    moneda: p.moneda === 'US' || p.moneda === 'USD' || p.moneda === 'U$S' ? 'USD' : 'ARS',
    grupo: /^IMP$|impuesto/i.test(p.tipo ?? '') ? 'Impositivo' : 'Proveedores',
    vientri: {
      clave: p.clave,
      comprobante: p.comprobante,
      tipo: p.tipo,
      cuit: p.persona?.cuit ?? null,
      totalCentavos: p.totalCentavos,
      fechaVencimiento: fecha,
      sinFechaDePago,
      fechaEstimada: estimada,
      plazoDias: estimada ? plazo.dias : null,
      plazoOrigen: estimada ? plazo.origen : null,
    },
  }
}

/** Saldos menores a esto son restos de redondeo en Vientri ($0,01, $0,04...): no son pagos ni cobros. */
export const RESIDUO_CENTAVOS = 100_00

export interface ResultadoPlanAgenda {
  operaciones: OperacionAgenda[]
  posiblesDuplicados: number
  /** Notas de crédito u otros saldos a favor (negativos): no entran a la Agenda. */
  saldosNegativos: { cantidad: number; centavos: number }
  residuos: number
}

export function planAgenda(opts: {
  lado: LadoAgenda
  /** Pendientes dentro de la ventana de 12 meses. */
  enVentana: VientriPendienteDoc[]
  /** Claves de TODOS los pendientes con saldo de ese lado (con o sin ventana). */
  clavesConSaldo: Set<string>
  existentes: ExistenteAgenda[]
  fechaDatos: string
  manuales?: ManualAgenda[]
  /** Plazos históricos para estimar la fecha de lo que no tiene vencimiento en Vientri. */
  plazos?: PlazosHistoricos
  /** Con qué se pagó/cobró de verdad cada factura, por clave (ver domain/desglose-pago.ts). */
  desglosesPago?: Map<string, LegDesglosePago[]>
}): ResultadoPlanAgenda {
  const dia = (s: string) => Date.parse(`${s.slice(0, 10)}T12:00:00Z`) / 86_400_000
  const buscarDuplicado = (datos: DatosVientriAgenda): PosibleDuplicado | null => {
    const m = (opts.manuales ?? []).find(
      (x) => x.montoCentavos === datos.montoCentavos && x.fecha !== null && Math.abs(dia(x.fecha) - dia(datos.fecha)) <= DIAS_DUPLICADO,
    )
    return m ? { id: m.id, descripcion: m.descripcion } : null
  }
  const existentes = new Map(opts.existentes.map((e) => [e.id, e]))
  const operaciones: OperacionAgenda[] = []
  const vistos = new Set<string>()
  const saldosNegativos = { cantidad: 0, centavos: 0 }
  let residuos = 0
  const clavesResiduo = new Set<string>()

  for (const p of opts.enVentana) {
    if (p.lado !== opts.lado) continue
    if (p.pendienteCentavos <= 0) {
      saldosNegativos.cantidad += 1
      saldosNegativos.centavos += p.pendienteCentavos
      continue
    }
    if (p.pendienteCentavos < RESIDUO_CENTAVOS) {
      residuos += 1
      clavesResiduo.add(p.clave)
      continue
    }
    const id = idAgendaVientri(p.clave)
    vistos.add(id)
    const datos = datosDesdePendiente(p, opts.fechaDatos, opts.plazos ? plazoPara(opts.plazos, opts.lado, p.persona?.vientriId) : undefined)
    const ex = existentes.get(id)
    if (!ex) {
      operaciones.push({ tipo: 'crear', id, datos, posibleDuplicado: buscarDuplicado(datos) })
      continue
    }
    if (!ex.abierto) {
      // Si lo cerró Vientri y volvió a tener saldo (se anuló un pago), se reabre. Si lo cerró una persona, se respeta.
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
      ex.nombre !== datos.nombre ||
      (ex.moneda ?? 'ARS') !== datos.moneda ||
      (ex.sinFecha ?? false) !== datos.vientri.sinFechaDePago ||
      (ex.fechaEstimada ?? false) !== datos.vientri.fechaEstimada
    if (cambio) operaciones.push({ tipo: 'actualizar', id, datos, cambiarFecha })
  }

  for (const ex of opts.existentes) {
    if (vistos.has(ex.id) || !ex.abierto) continue
    const clave = ex.id.replace(/^vientri-/, '')
    // Sigue debiéndose y solo quedó fuera de los 12 meses: no se toca. Un resto de redondeo sí se cierra.
    if (opts.clavesConSaldo.has(clave) && !clavesResiduo.has(clave)) continue
    operaciones.push({ tipo: 'cerrar', id: ex.id, desglosePago: opts.desglosesPago?.get(clave) ?? null })
  }

  const posiblesDuplicados = operaciones.filter((o) => o.tipo === 'crear' && o.posibleDuplicado).length
  return { operaciones, saldosNegativos, posiblesDuplicados, residuos }
}
