import { describe, expect, it } from 'vitest'
import { inferEstadoEmitidoVientri, parseEmitidosVientriSheet } from './cheques.service.js'
import { matchBusqueda, matchMontoCentavos } from './cheques.repository.js'

describe('inferEstadoEmitidoVientri', () => {
  it('mapea Renovado a estado renovado (ya no lo descarta)', () => {
    expect(inferEstadoEmitidoVientri('Renovado')).toBe('renovado')
    expect(inferEstadoEmitidoVientri('RENOVADO')).toBe('renovado')
    expect(inferEstadoEmitidoVientri('Cheque renovado')).toBe('renovado')
  })

  it('sigue mapeando los demás estados conocidos', () => {
    expect(inferEstadoEmitidoVientri('Rechazado')).toBe('rechazado')
    expect(inferEstadoEmitidoVientri('Pago a proveedor')).toBe('pendiente')
    expect(inferEstadoEmitidoVientri('Diferido')).toBe('pendiente')
    expect(inferEstadoEmitidoVientri('Abonado')).toBe('debitado')
    expect(inferEstadoEmitidoVientri('')).toBe('pendiente')
  })
})

describe('parseEmitidosVientriSheet', () => {
  const header = [
    'Destinatario',
    'Numero de Cheque',
    'Fecha OP',
    'FecVto',
    'Importe',
    'Banco',
    'Estado',
  ]

  it('carga una fila Renovado como cheque con estado renovado (no la ignora)', () => {
    const rows: unknown[][] = [
      header,
      ['Proveedor SA', '12345678', '2026-09-01', '2026-10-15', 1500.5, 'Galicia', 'Renovado'],
      ['Otro SA', '87654321', '2026-09-02', '2026-10-20', 2000, 'Macro', 'Pago a proveedor'],
    ]

    const result = parseEmitidosVientriSheet(rows, 0)

    expect(result.parsed).toHaveLength(2)
    expect(result.parsed[0]).toMatchObject({
      numero: '12345678',
      direccion: 'emitido',
      origen: 'propio',
      montoCentavos: 150_050,
      estado: 'renovado',
      utilizado: false,
      destinatario: 'Proveedor SA',
    })
    expect(result.parsed[1].estado).toBe('pendiente')
    expect(result.ignorados).toBe(0)
    expect(result.avisos).toEqual([
      '1 cheques quedaron como Renovado (no se van a pagar, fueron reemplazados)',
    ])
  })
})

describe('matchBusqueda y matchMontoCentavos', () => {
  it('encuentra por monto entero, con puntos de miles, con decimales o con signo $', () => {
    const doc = {
      numero: '00012345',
      emisor: 'Proveedor Sur SA',
      emisorCuit: '30712345678',
      cliente: null,
      destinatario: null,
      montoCentavos: 150_000_050,
    }
    expect(matchBusqueda(doc, '1500000')).toBe(true)
    expect(matchBusqueda(doc, '1.500.000')).toBe(true)
    expect(matchBusqueda(doc, '1.500.000,50')).toBe(true)
    expect(matchBusqueda(doc, '$ 1.500.000,50')).toBe(true)
    expect(matchBusqueda(doc, '1500000,50')).toBe(true)
    expect(matchBusqueda(doc, '1500000.50')).toBe(true)
    expect(matchBusqueda(doc, '999999')).toBe(false)
    expect(matchMontoCentavos(150_000_050, '.')).toBe(false)
  })
})
