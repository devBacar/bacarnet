/**
 * Cálculo puro del tablero de Cobros: a partir de los pendientes "a cobrar" (mismos datos que la
 * cuenta corriente de Vientri, ver finanzas/vientri/domain/saldos-cliente.ts) arma vencido/a vencer,
 * antigüedad de saldos (aging) y los KPI generales. Las facturas ya cobradas en el período se calculan
 * aparte (vienen de otra colección) y se combinan acá.
 */
import { armarSaldosCliente } from '../../vientri/domain/saldos-cliente.js'
import type { VientriPendienteDoc } from '../../vientri/domain/tipos.js'
import type {
  BucketAntiguedad,
  ClienteCobro,
  ComprobanteCobro,
  FacturaCobrada,
  TableroCobros,
} from './tipos.js'

const BUCKETS: BucketAntiguedad[] = ['0-30', '31-60', '61-90', 'mas90']

/** Días calendario entre dos fechas AAAA-MM-DD (positivo si `hasta` es posterior a `desde`). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)))
  const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)))
  return Math.round((b - a) / 86_400_000)
}

export function bucketDeDias(dias: number): BucketAntiguedad {
  if (dias <= 30) return '0-30'
  if (dias <= 60) return '31-60'
  if (dias <= 90) return '61-90'
  return 'mas90'
}

/**
 * Clasifica un comprobante con deuda (pendienteCentavos > 0): vencido si su fecha de referencia
 * (vencimiento, o la fecha de emisión si no tiene vencimiento cargado) ya pasó respecto de `hoy`.
 */
export function clasificarComprobante(
  fecha: string | null,
  fechaVencimiento: string | null,
  pendienteCentavos: number,
  hoy: string,
): { diasVencido: number | null; bucket: BucketAntiguedad | null } {
  if (pendienteCentavos <= 0) return { diasVencido: null, bucket: null }
  const referencia = fechaVencimiento ?? fecha
  if (!referencia) return { diasVencido: null, bucket: null }
  const dias = diasEntre(referencia, hoy)
  if (dias <= 0) return { diasVencido: null, bucket: null }
  return { diasVencido: dias, bucket: bucketDeDias(dias) }
}

/**
 * "Total a cobrar / Vencido / A vencer / antigüedad" se calculan solo sobre las facturas EMITIDAS
 * dentro de `periodo` (fecha de emisión, no de vencimiento ni de cobro) — no es "cómo estaba la
 * cartera en esa fecha", es "cuánto se debe hoy de lo facturado en ese rango". Las que no tienen
 * fecha cargada quedan afuera: no se puede ubicarlas en ningún período.
 */
function pendientesEmitidasEnPeriodo(
  pendientesCobrar: VientriPendienteDoc[],
  periodo: { desde: string; hasta: string },
): VientriPendienteDoc[] {
  return pendientesCobrar.filter((p) => p.fecha !== null && p.fecha >= periodo.desde && p.fecha <= periodo.hasta)
}

export function calcularTableroCobros(input: {
  pendientesCobrar: VientriPendienteDoc[]
  cobradas: FacturaCobrada[]
  hoy: string
  periodo: { desde: string; hasta: string }
  moneda: string
}): TableroCobros {
  const saldos = armarSaldosCliente(pendientesEmitidasEnPeriodo(input.pendientesCobrar, input.periodo))

  const antiguedad: Record<BucketAntiguedad, number> = { '0-30': 0, '31-60': 0, '61-90': 0, mas90: 0 }
  let totalACobrar = 0
  let totalFavor = 0
  let totalVencido = 0
  let totalAVencer = 0

  const clientes: ClienteCobro[] = saldos.map((s) => {
    let vencidoCliente = 0
    let aVencerCliente = 0
    const comprobantes: ComprobanteCobro[] = s.comprobantes.map((c) => {
      const { diasVencido, bucket } = clasificarComprobante(c.fecha, c.fechaVencimiento, c.pendienteCentavos, input.hoy)
      if (c.pendienteCentavos > 0) {
        if (bucket) {
          vencidoCliente += c.pendienteCentavos
          antiguedad[bucket] += c.pendienteCentavos
        } else {
          aVencerCliente += c.pendienteCentavos
        }
      }
      return { ...c, diasVencido, bucket }
    })
    totalACobrar += s.deudaCentavos
    totalFavor += s.favorCentavos
    totalVencido += vencidoCliente
    totalAVencer += aVencerCliente
    return {
      personaId: s.personaId,
      nombre: s.nombre,
      cuit: s.cuit,
      deudaCentavos: s.deudaCentavos,
      favorCentavos: s.favorCentavos,
      saldoCentavos: s.saldoCentavos,
      vencidoCentavos: vencidoCliente,
      aVencerCentavos: aVencerCliente,
      comprobantes,
    }
  })

  return {
    moneda: input.moneda,
    generadoEn: new Date().toISOString(),
    hoy: input.hoy,
    periodo: input.periodo,
    totalACobrarCentavos: totalACobrar,
    totalFavorCentavos: totalFavor,
    totalVencidoCentavos: totalVencido,
    totalAVencerCentavos: totalAVencer,
    antiguedad,
    cantidadClientesConDeuda: clientes.filter((c) => c.deudaCentavos > 0).length,
    cobradoEnPeriodoCentavos: input.cobradas.reduce((acc, f) => acc + f.importeCobradoCentavos, 0),
    cantidadFacturasCobradasEnPeriodo: input.cobradas.length,
    clientes,
  }
}

export { BUCKETS }
