import { capitalEsperadoCentavos, idCompromisoCuota, ingresadoCentavos, montoAPagar } from './agenda-plan.js'
import { aPagarDeCuota, deudaCapitalizadaAl } from './cronograma.js'
import { sumarDias } from './fechas.js'
import type {
  Cuota,
  EstadoCuota,
  InversionDocumentBase,
  MonedaInversion,
} from './inversion.types.js'
import { alertasDe, estadoDeCuota, type Alertas, type PagoEnAgenda } from './seguimiento.js'

/** Lo que interesa de un compromiso de la Agenda para seguir una cuota. */
export interface CompromisoDeCuota {
  estado: string
  montoCentavos: number
  /** Ya resuelto con la regla de la Agenda (pagado viejo sin pagos = completo). */
  pagadoCentavos: number
  moneda: MonedaInversion
  comoSePago: string | null
}

export interface CuotaVista extends Cuota {
  estado: EstadoCuota
  compromisoId: string | null
  aPagarCentavos: number
  monedaPago: MonedaInversion
  pagadoCentavos: number
  restanteCentavos: number
  comoSePago: string | null
  /** Retención de Ganancias de la cuota (0 si no corresponde). */
  retencionCentavos: number
}

const ABIERTAS: ReadonlySet<EstadoCuota> = new Set(['pendiente', 'parcial', 'atrasada'])

export function cuotasVista(
  inversionId: string,
  inv: Pick<InversionDocumentBase, 'cronograma' | 'moneda' | 'estado'>,
  compromisos: ReadonlyMap<number, CompromisoDeCuota>,
  hoy: string,
  retencion: (c: Cuota) => number = () => 0,
): CuotaVista[] {
  const enAgenda = inv.estado !== 'borrador' && inv.estado !== 'pendiente_aprobacion' && inv.estado !== 'anulada'
  return inv.cronograma.map((c) => {
    const comp = enAgenda ? compromisos.get(c.numero) : undefined
    const pago: PagoEnAgenda | undefined = comp
      ? { numero: c.numero, compromisoId: idCompromisoCuota(inversionId, c.numero), estado: comp.estado, montoCentavos: comp.montoCentavos, pagadoCentavos: comp.pagadoCentavos }
      : undefined
    const retenido = retencion(c)
    const { montoCentavos, moneda } = montoAPagar({ ...c, totalCentavos: c.totalCentavos - retenido }, inv.moneda)
    const aPagar = comp?.montoCentavos ?? montoCentavos
    const pagado = comp?.pagadoCentavos ?? 0
    const estado = enAgenda ? estadoDeCuota(c, pago, hoy) : c.anulada ? 'anulada' : 'pendiente'
    return {
      ...c,
      estado,
      compromisoId: comp ? idCompromisoCuota(inversionId, c.numero) : null,
      aPagarCentavos: aPagar,
      monedaPago: comp?.moneda ?? moneda,
      pagadoCentavos: pagado,
      restanteCentavos: estado === 'pagada' || estado === 'anulada' ? 0 : Math.max(0, aPagar - pagado),
      comoSePago: comp?.comoSePago ?? null,
      retencionCentavos: retenido,
    }
  })
}

/**
 * Lo que falta pagar de las cuotas abiertas, en la moneda de la inversión.
 * Una cuota en USD que se paga en pesos descuenta la parte proporcional de lo ya pagado.
 */
export function pendienteCentavos(cuotas: readonly CuotaVista[]): number {
  return cuotas
    .filter((c) => ABIERTAS.has(c.estado))
    .reduce((s, c) => {
      const total = aPagarDeCuota(c)
      if (c.aPagarCentavos <= 0) return s + total
      return s + Math.round((total * c.restanteCentavos) / c.aPagarCentavos)
    }, 0)
}

/**
 * Lo que se le debe hoy (la columna "Deuda" de la planilla):
 * capitaliza → capital + intereses sumados hasta hoy; el resto → capital que falta devolver.
 */
export function deudaHoyCentavos(inv: InversionDocumentBase, cuotas: readonly CuotaVista[], hoy: string): number {
  if (inv.estado !== 'vigente') return 0
  if (inv.sistema === 'capitaliza') {
    const capitalDevuelto = cuotas.filter((c) => c.estado === 'pagada').reduce((s, c) => s + c.capitalCentavos, 0)
    return Math.max(0, deudaCapitalizadaAl(inv, hoy) - capitalDevuelto)
  }
  const devuelto = cuotas
    .filter((c) => c.estado === 'pagada' || c.estado === 'renovada')
    .reduce((s, c) => s + c.capitalCentavos, 0)
  return Math.max(0, inv.capitalCentavos - devuelto)
}

export function alertasVista(inv: InversionDocumentBase, cuotas: readonly CuotaVista[], hoy: string, diasAviso: number): Alertas {
  return alertasDe({
    estado: inv.estado,
    cronograma: inv.cronograma,
    estados: new Map(cuotas.map((c) => [c.numero, c.estado])),
    hoy,
    diasAviso,
  })
}

export function resumenInversion(id: string, inv: InversionDocumentBase, cuotas: readonly CuotaVista[], hoy: string, diasAviso: number) {
  const alertas = alertasVista(inv, cuotas, hoy, diasAviso)
  return {
    id,
    numero: inv.numero,
    inversorId: inv.inversorId,
    inversorNombre: inv.inversorNombre,
    estado: inv.estado,
    moneda: inv.moneda,
    capitalCentavos: inv.capitalCentavos,
    fechaAlta: inv.fechaAlta,
    fechaFinal: alertas.fechaFinal,
    sistema: inv.sistema,
    tasa: inv.tasa,
    pendienteCentavos: pendienteCentavos(cuotas),
    deudaHoyCentavos: deudaHoyCentavos(inv, cuotas, hoy),
    ingresoPendienteCentavos: Math.max(0, capitalEsperadoCentavos(inv) - ingresadoCentavos(inv.ingresos)),
    alertas,
    operacionPendiente: inv.operacionPendiente ? { tipo: inv.operacionPendiente.tipo, fecha: inv.operacionPendiente.fecha } : null,
    importada: inv.importada,
  }
}

export type ResumenInversion = ReturnType<typeof resumenInversion>

export function kpisDe(items: ReadonlyArray<{ resumen: ResumenInversion; cuotas: readonly CuotaVista[] }>, hoy: string) {
  const cero = (): Record<MonedaInversion, number> => ({ ARS: 0, USD: 0 })
  const kpis = {
    capitalVigente: cero(),
    aDevolver: cero(),
    proximos30: { cantidad: 0, porMoneda: cero() },
    cuotasAtrasadas: 0,
    paraAprobar: 0,
    porVencer: 0,
  }
  const limite = sumarDias(hoy, 30)
  for (const { resumen, cuotas } of items) {
    if (resumen.estado === 'pendiente_aprobacion' || resumen.operacionPendiente) kpis.paraAprobar += 1
    if (resumen.estado !== 'vigente') continue
    kpis.capitalVigente[resumen.moneda] += resumen.capitalCentavos
    kpis.aDevolver[resumen.moneda] += resumen.pendienteCentavos
    kpis.cuotasAtrasadas += resumen.alertas.cuotasAtrasadas
    if (resumen.alertas.porVencer) kpis.porVencer += 1
    for (const c of cuotas) {
      if (ABIERTAS.has(c.estado) && c.fechaVencimiento >= hoy && c.fechaVencimiento <= limite) {
        kpis.proximos30.cantidad += 1
        kpis.proximos30.porMoneda[c.monedaPago] += c.restanteCentavos
      }
    }
  }
  return kpis
}

