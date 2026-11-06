import { describe, expect, it } from 'vitest'
import { bucketDeDias, calcularTableroCobros, clasificarComprobante, diasEntre } from './calcular.js'
import type { VientriPendienteDoc } from '../../vientri/domain/tipos.js'

function pendiente(overrides: Partial<VientriPendienteDoc> & { pendienteCentavos: number }): VientriPendienteDoc {
  return {
    clave: `cmp-${overrides.vientriId ?? 1}`,
    vientriId: 1,
    lado: 'cobrar',
    tipoId: null,
    tipo: 'Factura A',
    comprobante: 'FAA 0001-00000001',
    persona: { vientriId: 10, nombre: 'Cliente Uno', cuit: null },
    fecha: '2026-09-01',
    fechaVencimiento: '2026-09-15',
    totalCentavos: overrides.pendienteCentavos,
    divisaId: 1,
    moneda: 'ARS',
    cotizacion: null,
    fechaProntoPago: null,
    descuentoProntoPago: null,
    cuotas: null,
    prestamo: false,
    obs: null,
    revisar: [],
    fecsys: null,
    ...overrides,
  }
}

describe('diasEntre', () => {
  it('cuenta días calendario entre dos fechas', () => {
    expect(diasEntre('2026-09-01', '2026-09-15')).toBe(14)
    expect(diasEntre('2026-09-15', '2026-09-01')).toBe(-14)
    expect(diasEntre('2026-01-01', '2026-01-01')).toBe(0)
  })
})

describe('bucketDeDias', () => {
  it('clasifica en los 4 buckets, en los bordes', () => {
    expect(bucketDeDias(1)).toBe('0-30')
    expect(bucketDeDias(30)).toBe('0-30')
    expect(bucketDeDias(31)).toBe('31-60')
    expect(bucketDeDias(60)).toBe('31-60')
    expect(bucketDeDias(61)).toBe('61-90')
    expect(bucketDeDias(90)).toBe('61-90')
    expect(bucketDeDias(91)).toBe('mas90')
    expect(bucketDeDias(400)).toBe('mas90')
  })
})

describe('clasificarComprobante', () => {
  it('un saldo a favor (pendiente <= 0) nunca está vencido', () => {
    expect(clasificarComprobante('2026-01-01', '2026-01-01', 0, '2026-09-01')).toEqual({ diasVencido: null, bucket: null })
    expect(clasificarComprobante('2026-01-01', '2026-01-01', -500, '2026-09-01')).toEqual({ diasVencido: null, bucket: null })
  })

  it('deuda con vencimiento futuro: a vencer, no vencida', () => {
    expect(clasificarComprobante('2026-09-01', '2026-09-30', 1000, '2026-09-15')).toEqual({ diasVencido: null, bucket: null })
  })

  it('deuda con vencimiento hoy: todavía no vencida (vence hoy, no "ya pasó")', () => {
    expect(clasificarComprobante('2026-09-01', '2026-09-15', 1000, '2026-09-15')).toEqual({ diasVencido: null, bucket: null })
  })

  it('deuda vencida hace 10 días: bucket 0-30', () => {
    expect(clasificarComprobante('2026-09-01', '2026-09-05', 1000, '2026-09-15')).toEqual({ diasVencido: 10, bucket: '0-30' })
  })

  it('sin fecha de vencimiento, usa la fecha de emisión como referencia', () => {
    expect(clasificarComprobante('2026-08-01', null, 1000, '2026-09-15')).toEqual({ diasVencido: 45, bucket: '31-60' })
  })

  it('sin ninguna fecha, no se puede clasificar', () => {
    expect(clasificarComprobante(null, null, 1000, '2026-09-15')).toEqual({ diasVencido: null, bucket: null })
  })
})

describe('calcularTableroCobros', () => {
  const hoy = '2026-09-15'
  const periodo = { desde: '2026-08-16', hasta: '2026-09-15' }

  it('separa deuda vencida, a vencer y a favor, y arma la antigüedad', () => {
    const pendientes: VientriPendienteDoc[] = [
      pendiente({ vientriId: 1, pendienteCentavos: 100_00, fechaVencimiento: '2026-09-01' }), // vencida hace 14 días
      pendiente({ vientriId: 2, pendienteCentavos: 50_00, fechaVencimiento: '2026-10-01' }), // a vencer
      pendiente({ vientriId: 3, pendienteCentavos: -20_00, fechaVencimiento: '2026-09-01' }), // a favor
    ]
    const tablero = calcularTableroCobros({ pendientesCobrar: pendientes, cobradas: [], hoy, periodo, moneda: 'ARS', sinClasificarHoy: { cantidad: 0, montoCentavos: 0 } })
    expect(tablero.totalACobrarCentavos).toBe(150_00)
    expect(tablero.totalFavorCentavos).toBe(20_00)
    expect(tablero.totalVencidoCentavos).toBe(100_00)
    expect(tablero.totalAVencerCentavos).toBe(50_00)
    expect(tablero.antiguedad['0-30']).toBe(100_00)
    expect(tablero.antiguedad['31-60']).toBe(0)
    expect(tablero.cantidadClientesConDeuda).toBe(1) // mismo personaId (10) para los 3, un único cliente agregado
  })

  it('agrega por cliente distinto cuando el personaId difiere', () => {
    const pendientes: VientriPendienteDoc[] = [
      pendiente({ vientriId: 1, pendienteCentavos: 100_00, persona: { vientriId: 10, nombre: 'Cliente A', cuit: null } }),
      pendiente({ vientriId: 2, pendienteCentavos: 200_00, persona: { vientriId: 20, nombre: 'Cliente B', cuit: null } }),
    ]
    const tablero = calcularTableroCobros({ pendientesCobrar: pendientes, cobradas: [], hoy, periodo, moneda: 'ARS', sinClasificarHoy: { cantidad: 0, montoCentavos: 0 } })
    expect(tablero.clientes).toHaveLength(2)
    expect(tablero.cantidadClientesConDeuda).toBe(2)
  })

  it('suma lo cobrado en el período aparte de la deuda vigente', () => {
    const tablero = calcularTableroCobros({
      pendientesCobrar: [],
      cobradas: [
        { clave: 'apl-5', idCmpFactura: 5, comprobante: 'FAA 1', persona: { vientriId: 10, nombre: 'Cliente A' }, fechaCobro: '2026-09-01', importeCobradoCentavos: 300_00, fuente: 'vientri' },
        { clave: 'apl-6', idCmpFactura: 6, comprobante: 'FAA 2', persona: { vientriId: 10, nombre: 'Cliente A' }, fechaCobro: '2026-09-02', importeCobradoCentavos: 150_00, fuente: 'vientri' },
      ],
      hoy,
      periodo,
      moneda: 'ARS',
      sinClasificarHoy: { cantidad: 0, montoCentavos: 0 },
    })
    expect(tablero.cobradoEnPeriodoCentavos).toBe(450_00)
    expect(tablero.cantidadFacturasCobradasEnPeriodo).toBe(2)
    expect(tablero.totalACobrarCentavos).toBe(0)
  })

  it('"Total a cobrar/Vencido/A vencer" solo cuentan facturas emitidas dentro del período', () => {
    const pendientes: VientriPendienteDoc[] = [
      pendiente({ vientriId: 1, pendienteCentavos: 100_00, fecha: '2026-08-20' }), // dentro del período
      pendiente({ vientriId: 2, pendienteCentavos: 50_00, fecha: '2026-07-01' }), // antes del período: afuera
      pendiente({ vientriId: 3, pendienteCentavos: 30_00, fecha: null }), // sin fecha: afuera (no se puede ubicar)
    ]
    const tablero = calcularTableroCobros({ pendientesCobrar: pendientes, cobradas: [], hoy, periodo, moneda: 'ARS', sinClasificarHoy: { cantidad: 0, montoCentavos: 0 } })
    expect(tablero.totalACobrarCentavos).toBe(100_00)
  })

  it('pasa "sin clasificar hoy" tal cual, para que la pantalla avise que puede faltar información', () => {
    const tablero = calcularTableroCobros({
      pendientesCobrar: [],
      cobradas: [],
      hoy,
      periodo,
      moneda: 'ARS',
      sinClasificarHoy: { cantidad: 3, montoCentavos: 500_00 },
    })
    expect(tablero.sinClasificarHoy).toEqual({ cantidad: 3, montoCentavos: 500_00 })
  })
})
