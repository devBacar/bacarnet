import { capitalEsperadoCentavos, ingresadoCentavos } from '../domain/agenda-plan.js'
import { cuentaInversor, type InversionParaCuenta } from '../domain/cuentaInversor.js'
import { documentosVisibles } from '../domain/documentos.js'
import { hoyArgentina } from '../domain/fechas.js'
import type { MonedaInversion } from '../domain/inversion.types.js'
import { retencionDeCuota } from '../domain/retencion.js'
import { alertasVista, cuotasVista } from '../domain/vista.js'
import { compromisosDeCuotas } from './inversiones.repository.js'
import { getConfigInversiones, listInversionesDocs, listInversoresDocs } from './inversores.repository.js'

export type MovimientoCuenta = {
  /** Del ingreso: la fecha en que entró. De la cuota: su vencimiento (la Agenda no guarda el día del pago). */
  fecha: string
  tipo: 'ingreso_capital' | 'cuota_pagada' | 'cuota_parcial'
  inversionId: string
  inversionNumero: string
  inversorNombre: string
  moneda: MonedaInversion
  montoCentavos: number
  retencionCentavos: number
  detalle: string
}

/**
 * Cuenta de un inversor (con `inversorId`) o de todos: KPIs por moneda, calendario,
 * capital aprobado sin ingresar, movimientos y documentos. Solo lectura: no toca la Agenda.
 */
export async function cuentaDeInversiones(inversorId?: string) {
  const [docs, config, inversores] = await Promise.all([
    listInversionesDocs(inversorId),
    getConfigInversiones(),
    listInversoresDocs(),
  ])
  const hoy = hoyArgentina()
  const inscripto = new Map(inversores.map(({ id, data }) => [id, data.inscriptoGanancias]))
  const compromisos = await compromisosDeCuotas(docs)

  const paraCuenta: InversionParaCuenta[] = []
  const capitalSinIngresar: Array<{ id: string; numero: string; inversorNombre: string; moneda: MonedaInversion; faltaCentavos: number }> = []
  const movimientos: MovimientoCuenta[] = []
  const documentos: Array<ReturnType<typeof documentosVisibles>[number] & { inversionId: string; inversionNumero: string }> = []

  for (const { id, data: inv } of docs) {
    for (const d of documentosVisibles(inv)) documentos.push({ ...d, inversionId: id, inversionNumero: inv.numero })
    if (inv.estado !== 'vigente' && inv.estado !== 'cancelada' && inv.estado !== 'precancelada' && inv.estado !== 'renovada') continue

    const cuotas = cuotasVista(id, inv, compromisos.get(id) ?? new Map(), hoy, (c) =>
      retencionDeCuota(c, config.retencionGanancias, inscripto.get(inv.inversorId)),
    )
    paraCuenta.push({
      id,
      numero: inv.numero,
      estado: inv.estado,
      moneda: inv.moneda,
      capitalCentavos: inv.capitalCentavos,
      fechaFinal: alertasVista(inv, cuotas, hoy, config.diasAvisoPorVencer).fechaFinal,
      inversorNombre: inv.inversorNombre,
      cronograma: cuotas,
    })

    const base = { inversionId: id, inversionNumero: inv.numero, inversorNombre: inv.inversorNombre }
    for (const ing of inv.ingresos) {
      movimientos.push({ ...base, fecha: ing.fecha, tipo: 'ingreso_capital', moneda: inv.moneda, montoCentavos: ing.montoCentavos, retencionCentavos: 0, detalle: 'Ingreso de capital' })
    }
    for (const c of cuotas) {
      if (c.pagadoCentavos <= 0 || (c.estado !== 'pagada' && c.estado !== 'parcial')) continue
      movimientos.push({
        ...base,
        fecha: c.fechaVencimiento,
        tipo: c.estado === 'pagada' ? 'cuota_pagada' : 'cuota_parcial',
        moneda: c.monedaPago,
        montoCentavos: c.pagadoCentavos,
        retencionCentavos: c.estado === 'pagada' ? c.retencionCentavos : 0,
        detalle: `Cuota ${c.numero}`,
      })
    }

    if (inv.estado === 'vigente') {
      const falta = capitalEsperadoCentavos(inv) - ingresadoCentavos(inv.ingresos)
      if (falta > 0) capitalSinIngresar.push({ id, numero: inv.numero, inversorNombre: inv.inversorNombre, moneda: inv.moneda, faltaCentavos: falta })
    }
  }

  movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return { hoy, ...cuentaInversor(paraCuenta, hoy), capitalSinIngresar, movimientos, documentos }
}
