import { M, nf1, pct, signo, suma } from './formato'
import { VENTAS_DESDE, type ModeloNegocio } from './modelo'

/** Cálculos del Resumen para un período. */
export function calcularResumen(modelo: ModeloNegocio, ms: string[]) {
  const { D, INF, CL, sv, mesesBase, completos, negocios, costosDe, sinSueldos } = modelo
  const mb = mesesBase(ms)
  const fN = suma(CL, (c) => sv(c.f, ms))
  const fNb = mb.length && mb[0] >= VENTAS_DESDE ? suma(CL, (c) => sv(c.f, mb)) : null
  const fT = suma(CL, (c) => sv(c.t, ms))
  const cob = suma(ms, (m) => D.cobTot[m] || 0)
  const msc = completos(ms)
  const ng = negocios(msc.length ? msc : ms)
  const gastoTot = suma(costosDe(msc), (r) => r.imp)
  const res = ng.ingTot + ng.otrosIng - gastoTot
  const ordenadas = ng.lineas.slice().sort((a, b) => a.res - b.res)
  const peor = ordenadas[0]
  const mejor = ng.lineas.slice().sort((a, b) => b.res - a.res)[0]
  const real = fNb ? fN / fNb / (1 + INF) - 1 : null
  const atender: string[] = []
  if (real != null && fNb) {
    atender.push(`Facturación ${signo(fN / fNb - 1)} contra el mismo período del año anterior; descontando inflación (~${pct(INF)}), ${signo(real)}.`)
  }
  atender.push(`Se cobró ${M(cob)} contra ${M(fT)} facturados con IVA (${pct(cob / fT)}).`)
  ng.lineas
    .filter((l) => l.res < 0)
    .forEach((l) =>
      atender.push(
        `${l.nombre} pierde ${M(-l.res)} en el período: la estructura se lleva ${pct(l.asign / l.ing)} de lo que factura y sus costos directos ${pct(l.dir / l.ing)}.`,
      ),
    )
  const fi = costosDe(ms, (r) => r.cuenta === 'INTERESES FISCALES')
  if (suma(fi, (r) => r.imp) > 0) atender.push(`${M(suma(fi, (r) => r.imp))} de intereses por pagar impuestos tarde.`)
  return {
    fN,
    fNb,
    fT,
    cob,
    gastoTot,
    res,
    ingTotal: ng.ingTot + ng.otrosIng,
    hayMesesCompletos: msc.length > 0,
    faltanSueldos: sinSueldos(ms).length > 0,
    peor,
    mejor,
    real,
    atender,
    clientesFacturados: D.clientes.filter((c) => sv(c.f, ms) > 0).length,
    diasCobro: nf1.format(D.cob.diasCobro),
  }
}
