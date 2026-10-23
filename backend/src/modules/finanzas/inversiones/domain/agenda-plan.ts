import { aPagarDeCuota } from './cronograma.js'
import type {
  Cuota,
  EstadoInversion,
  IngresoRegistrado,
  MedioDevolucion,
  MonedaInversion,
  TipoCambioPactado,
} from './inversion.types.js'

/**
 * Las cuotas de una inversión aprobada se ven en la Agenda como compromisos (egresos),
 * y el capital que tiene que entrar, como un cobro esperado (ingreso).
 * Los ids son fijos para poder actualizarlos: "inv-<inversionId>-c<numero>" e "inv-<inversionId>-ingreso".
 * Los pagos se hacen con las mismas herramientas de la Agenda y Hoy (efectivo, cheque, transferencia).
 */

export const ESTADOS_CON_AGENDA: ReadonlySet<EstadoInversion> = new Set(['vigente', 'cancelada', 'precancelada', 'renovada'])

export function idCompromisoCuota(inversionId: string, numero: number): string {
  return `inv-${inversionId}-c${numero}`
}

export function idCobroIngreso(inversionId: string): string {
  return `inv-${inversionId}-ingreso`
}

/** Si un id de la Agenda es de una cuota: de qué inversión y qué cuota. */
export function leerIdCompromisoCuota(id: string): { inversionId: string; numero: number } | null {
  const m = /^inv-(.+)-c(\d+)$/.exec(id)
  return m ? { inversionId: m[1]!, numero: Number(m[2]) } : null
}

export interface InversionParaAgenda {
  id: string
  numero: string
  inversorNombre: string
  moneda: MonedaInversion
  estado: EstadoInversion
  cronograma: readonly Cuota[]
  versionCronograma: number
  mediosDevolucion: readonly MedioDevolucion[]
  capitalCentavos: number
  fechaAlta: string
  ingresos: readonly IngresoRegistrado[]
  renovacionDe: { capitalCentavos: number } | null
  /** Cuotas pagadas antes de cargarla (inversiones en curso). */
  cuotasPrevias?: number
  sinVencimiento?: boolean
  /** Retención de Ganancias de cada cuota (en la moneda de la inversión). La Agenda muestra lo que se le paga: el neto. */
  retencion?: (c: Cuota) => number
}

export interface CompromisoExistente {
  id: string
  estado: string
  /** Ya anulado antes: no se vuelve a anular. */
  anulado?: boolean
  montoCentavos: number
  pagadoCentavos: number
  versionCronograma: number | null
}

export interface DatosCompromisoCuota {
  cuotaNumero: number | null
  cuotaTotal: number | null
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  moneda: MonedaInversion
  fechaVencimiento: string
  medioPago: 'transferencia' | 'cheque' | 'efectivo'
  observacion: string | null
  versionCronograma: number
}

export type OperacionAgenda =
  | { tipo: 'crear'; id: string; datos: DatosCompromisoCuota }
  /** Solo cuotas sin pagos: quedan pendientes con los datos nuevos. */
  | { tipo: 'actualizar'; id: string; datos: DatosCompromisoCuota }
  /** La cuota ya no corresponde: el compromiso queda anulado (no se borra; la Agenda no lo muestra). */
  | { tipo: 'anular'; id: string }
  | { tipo: 'conflicto'; id: string; motivo: string }

export function medioDeAgenda(medios: readonly MedioDevolucion[]): 'transferencia' | 'cheque' | 'efectivo' {
  const primero = medios[0]
  if (primero === 'cheque') return 'cheque'
  if (primero === 'efectivo') return 'efectivo'
  return 'transferencia'
}

/** Monto en la moneda en que se paga: si la cuota en USD se paga en pesos, se pasa al tipo de cambio pactado. */
export function montoAPagar(cuota: Cuota, moneda: MonedaInversion): { montoCentavos: number; moneda: MonedaInversion } {
  const aPagar = aPagarDeCuota(cuota)
  if (moneda === 'USD' && cuota.enPesos) {
    return { montoCentavos: Math.round((aPagar * cuota.enPesos.centavosPorUsd) / 100), moneda: 'ARS' }
  }
  return { montoCentavos: aPagar, moneda }
}

function textoTipoCambio(tc: TipoCambioPactado): string {
  const fuente = tc.fuente === 'pactado' ? 'pactado' : tc.fuente === 'mep' ? 'MEP' : 'BNA vendedor'
  return `${(tc.centavosPorUsd / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })} (${fuente}, ${tc.fecha})`
}

export function planAgendaCuotas(inv: InversionParaAgenda, existentes: readonly CompromisoExistente[]): OperacionAgenda[] {
  const deseados = new Map<string, DatosCompromisoCuota>()
  if (ESTADOS_CON_AGENDA.has(inv.estado)) {
    const vivas = inv.cronograma.filter((c) => !c.anulada)
    const previas = inv.cuotasPrevias ?? 0
    const total = vivas.length + previas
    vivas.forEach((c, i) => {
      const retenido = inv.retencion?.(c) ?? 0
      const { montoCentavos, moneda } = montoAPagar({ ...c, totalCentavos: c.totalCentavos - retenido }, inv.moneda)
      if (montoCentavos <= 0) return
      const tipo =
        c.tipo === 'precancelacion'
          ? 'Devolución del capital'
          : c.tipo === 'devolucion_parcial'
            ? 'Devolución parcial'
            : inv.sinVencimiento
              ? `Intereses ${c.fechaVencimiento.slice(5, 7)}/${c.fechaVencimiento.slice(0, 4)}`
              : `Cuota ${i + 1 + previas}/${total}`
      const obs: string[] = []
      if (c.capitalCentavos > 0) obs.push('incluye capital')
      if ((c.renovadaCentavos ?? 0) > 0) obs.push('parte renovada')
      if (c.enPesos) obs.push(`USD al tipo de cambio ${textoTipoCambio(c.enPesos)}`)
      if (retenido > 0) obs.push(`neto de retención de Ganancias ${(retenido / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
      if (c.estimada) obs.push('monto estimado: la tasa o el índice todavía no se conoce')
      deseados.set(idCompromisoCuota(inv.id, c.numero), {
        cuotaNumero: inv.sinVencimiento ? null : i + 1 + previas,
        cuotaTotal: inv.sinVencimiento ? null : total,
        concepto: `Inversión ${inv.numero} · ${tipo}`,
        proveedorONombre: inv.inversorNombre,
        montoCentavos,
        moneda,
        fechaVencimiento: c.fechaVencimiento,
        medioPago: medioDeAgenda(inv.mediosDevolucion),
        observacion: obs.length ? obs.join(' · ') : null,
        versionCronograma: inv.versionCronograma,
      })
    })
  }

  const ops: OperacionAgenda[] = []
  const porId = new Map(existentes.map((e) => [e.id, e]))
  for (const [id, datos] of deseados) {
    const actual = porId.get(id)
    if (!actual) {
      ops.push({ tipo: 'crear', id, datos })
      continue
    }
    if (actual.versionCronograma === inv.versionCronograma) continue
    // Una cuota con pagos (o pagada) no se reescribe nunca: si cambió, se avisa para revisarla a mano.
    if (actual.pagadoCentavos > 0 || actual.estado === 'pagado') {
      if (actual.montoCentavos !== datos.montoCentavos) {
        ops.push({ tipo: 'conflicto', id, motivo: 'Esta cuota ya tiene pagos y el cronograma nuevo le cambia el importe. Revisala a mano.' })
      }
      continue
    }
    ops.push({ tipo: 'actualizar', id, datos })
  }
  for (const e of existentes) {
    if (deseados.has(e.id) || e.anulado) continue
    if (e.pagadoCentavos > 0 || e.estado === 'confeccionada_pendiente_autorizacion') {
      ops.push({ tipo: 'conflicto', id: e.id, motivo: 'Esta cuota ya no corresponde pero tiene pagos o una transferencia armada. Revisala a mano.' })
    } else {
      ops.push({ tipo: 'anular', id: e.id })
    }
  }
  return ops
}

export interface CobroExistente {
  estado: string
  montoCentavos: number
}

export type OperacionCobro =
  | { tipo: 'nada' }
  | { tipo: 'crear'; montoCentavos: number; fechaEsperada: string; confirmado: boolean; concepto: string; nombre: string; moneda: MonedaInversion }
  | { tipo: 'actualizar_monto'; montoCentavos: number }
  | { tipo: 'confirmar'; montoCentavos: number }

export function capitalEsperadoCentavos(inv: Pick<InversionParaAgenda, 'capitalCentavos' | 'renovacionDe'>): number {
  return Math.max(0, inv.capitalCentavos - (inv.renovacionDe?.capitalCentavos ?? 0))
}

export function ingresadoCentavos(ingresos: readonly IngresoRegistrado[]): number {
  return ingresos.reduce((s, i) => s + i.montoCentavos, 0)
}

export function planCobroIngreso(inv: InversionParaAgenda, existente: CobroExistente | null): OperacionCobro {
  if (!ESTADOS_CON_AGENDA.has(inv.estado)) return { tipo: 'nada' }
  const esperado = capitalEsperadoCentavos(inv)
  if (esperado <= 0) return { tipo: 'nada' }
  const ingresado = ingresadoCentavos(inv.ingresos)
  const falta = Math.max(0, esperado - ingresado)
  if (!existente) {
    return {
      tipo: 'crear',
      montoCentavos: falta > 0 ? falta : esperado,
      fechaEsperada: inv.fechaAlta,
      confirmado: falta === 0,
      concepto: `Inversión ${inv.numero} · ingreso del capital`,
      nombre: inv.inversorNombre,
      moneda: inv.moneda,
    }
  }
  if (existente.estado === 'confirmado') return { tipo: 'nada' }
  if (falta === 0) return { tipo: 'confirmar', montoCentavos: esperado }
  if (existente.montoCentavos !== falta) return { tipo: 'actualizar_monto', montoCentavos: falta }
  return { tipo: 'nada' }
}
