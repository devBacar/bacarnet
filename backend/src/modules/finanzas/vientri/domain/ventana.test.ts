import { describe, expect, it } from 'vitest'
import type { VientriChequeDoc, VientriPendienteDoc } from './tipos.js'
import { aplicarVentana, restarDias, restarMeses } from './ventana.js'

function cheque(p: Partial<VientriChequeDoc>): VientriChequeDoc {
  return {
    clave: 'x', direccion: 'recibido', tipo: 'echeq', numero: '1', serie: '1', bancoId: 1, bancoNombre: 'Banco Ficticio',
    montoCentavos: 100_00, fechaEmision: null, fechaVencimiento: '2026-10-01', fechaRecibido: null, fechaDeposito: null,
    fechaEntregado: null, fechaConciliado: null, estado: 'en_cartera', estadoVientri: 'En cartera', estadoVientriId: 1,
    librador: { vientriId: 9, nombre: 'Cliente Ficticio SA', cuit: '30000000007' }, entregadoPor: null, entregadoA: null,
    destinatario: null, idCmpIngreso: null, cmpIngresoDesc: null, idCmpSalida: null, cmpSalidaDesc: null, idCmpNdRechazo: null, idCmpPagoBanco: null,
    estadoPrevioId: null, motivoRechazoId: null,
    fuentes: ['Chq'], vientriChqId: 1, vientriChqocaId: null, baja: false, revisar: [], fecsys: null,
    ...p,
  }
}

function pendiente(p: Partial<VientriPendienteDoc>): VientriPendienteDoc {
  return {
    clave: 'p', vientriId: 1, lado: 'pagar', tipoId: 1, tipo: 'FCG', comprobante: 'FCG 1', persona: null,
    fecha: '2026-09-01', fechaVencimiento: '2026-10-01', totalCentavos: 1, pendienteCentavos: 1, divisaId: 1,
    moneda: '$', cotizacion: 1, fechaProntoPago: null, descuentoProntoPago: null, cuotas: null, prestamo: false,
    revisar: [], fecsys: null, ...p,
  }
}

describe('fechas', () => {
  it('resta meses y días', () => {
    expect(restarMeses('2026-10-19T10:55:35', 12)).toBe('2025-10-19')
    expect(restarMeses('2026-03-31', 1)).toBe('2026-02-28')
    expect(restarDias('2026-10-19', 30)).toBe('2026-09-19')
  })
})

describe('aplicarVentana', () => {
  const fechaDatos = '2026-10-19T10:55:35'

  it('deja solo los cheques que vencen desde hace 12 meses', () => {
    const r = aplicarVentana(
      [
        cheque({ clave: 'nuevo', fechaVencimiento: '2026-11-01' }),
        cheque({ clave: 'viejo-depositado', fechaVencimiento: '2024-01-01', estado: 'depositado' }),
        cheque({ clave: 'sin-fecha', fechaVencimiento: null }),
      ],
      [],
      fechaDatos,
    )
    expect(r.cheques.map((c) => c.clave)).toEqual(['nuevo', 'sin-fecha'])
    expect(r.fuera.cheques).toBe(1)
    expect(r.limpieza).toEqual([])
  })

  it('manda a limpieza los viejos que siguen abiertos en Vientri', () => {
    const r = aplicarVentana(
      [
        cheque({ clave: 'cartera-2020', fechaVencimiento: '2020-04-13' }),
        cheque({ clave: 'sin-debitar-2019', direccion: 'emitido', estado: 'pendiente_debito', fechaVencimiento: '2019-05-01' }),
        cheque({ clave: 'baja-vieja', estado: 'en_cartera', fechaVencimiento: '2019-05-01', baja: true }),
      ],
      [],
      fechaDatos,
    )
    expect(r.cheques).toEqual([])
    expect(r.limpieza.map((c) => c.clave)).toEqual(['sin-debitar-2019', 'cartera-2020'])
  })

  it('marca los cheques en cartera vencidos para depositar', () => {
    const r = aplicarVentana(
      [cheque({ clave: 'a', fechaVencimiento: '2026-08-01' }), cheque({ clave: 'b', fechaVencimiento: '2026-10-10' })],
      [],
      fechaDatos,
    )
    expect(r.cheques.find((c) => c.clave === 'a')?.revisar[0]).toContain('Vencido para depositar')
    expect(r.cheques.find((c) => c.clave === 'b')?.revisar).toEqual([])
    expect(r.limpieza.map((c) => c.clave)).toEqual(['a'])
  })

  it('lista los cheques propios sin débito con la fecha de pago pasada hace más de 7 días', () => {
    const r = aplicarVentana(
      [
        cheque({ clave: 'viejo', direccion: 'emitido', estado: 'pendiente_debito', fechaVencimiento: '2026-10-01' }),
        cheque({ clave: 'reciente', direccion: 'emitido', estado: 'pendiente_debito', fechaVencimiento: '2026-10-15' }),
      ],
      [],
      fechaDatos,
    )
    expect(r.cheques).toHaveLength(2)
    expect(r.limpieza.map((c) => c.clave)).toEqual(['viejo'])
  })

  it('deja solo los compromisos que vencen desde hace 12 meses', () => {
    const r = aplicarVentana(
      [],
      [
        pendiente({ clave: 'ok', fechaVencimiento: '2026-01-01' }),
        pendiente({ clave: 'viejo', fechaVencimiento: '2023-01-01' }),
        pendiente({ clave: 'sin-vto', fechaVencimiento: null, fecha: '2026-02-01' }),
      ],
      fechaDatos,
    )
    expect(r.pendientes.map((p) => p.clave)).toEqual(['ok', 'sin-vto'])
    expect(r.fuera.pendientes).toBe(1)
  })
})
