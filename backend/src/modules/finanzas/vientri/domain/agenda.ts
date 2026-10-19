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
  | { tipo: 'cerrar'; id: string }

export function idAgendaVientri(clave: string): string {
  return `vientri-${clave}`
}

export function datosDesdePendiente(p: VientriPendienteDoc, fechaDatos: string): DatosVientriAgenda {
  const fecha = (p.fechaVencimiento ?? p.fecha ?? fechaDatos).slice(0, 10)
  return {
    concepto: p.comprobante,
    nombre: p.persona?.nombre?.trim() || 'Sin nombre en Vientri',
    montoCentavos: p.pendienteCentavos,
    fecha,
    moneda: p.moneda === 'US' || p.moneda === 'USD' || p.moneda === 'U$S' ? 'USD' : 'ARS',
    grupo: p.tipo === 'IMP' ? 'Impositivo' : 'Proveedores',
    vientri: {
      clave: p.clave,
      comprobante: p.comprobante,
      tipo: p.tipo,
      cuit: p.persona?.cuit ?? null,
      totalCentavos: p.totalCentavos,
      fechaVencimiento: fecha,
    },
  }
}

export interface ResultadoPlanAgenda {
  operaciones: OperacionAgenda[]
  posiblesDuplicados: number
  /** Notas de crédito u otros saldos a favor (negativos): no entran a la Agenda. */
  saldosNegativos: { cantidad: number; centavos: number }
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

  for (const p of opts.enVentana) {
    if (p.lado !== opts.lado) continue
    if (p.pendienteCentavos <= 0) {
      saldosNegativos.cantidad += 1
      saldosNegativos.centavos += p.pendienteCentavos
      continue
    }
    const id = idAgendaVientri(p.clave)
    vistos.add(id)
    const datos = datosDesdePendiente(p, opts.fechaDatos)
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
      (ex.moneda ?? 'ARS') !== datos.moneda
    if (cambio) operaciones.push({ tipo: 'actualizar', id, datos, cambiarFecha })
  }

  for (const ex of opts.existentes) {
    if (vistos.has(ex.id) || !ex.abierto) continue
    const clave = ex.id.replace(/^vientri-/, '')
    if (opts.clavesConSaldo.has(clave)) continue // sigue debiéndose, solo quedó fuera de los 12 meses
    operaciones.push({ tipo: 'cerrar', id: ex.id })
  }

  const posiblesDuplicados = operaciones.filter((o) => o.tipo === 'crear' && o.posibleDuplicado).length
  return { operaciones, saldosNegativos, posiblesDuplicados }
}
