import { describe, expect, it } from 'vitest'
import { controlarExtracto } from './control-extracto.js'
import type { MovimientoControlable } from './extracto.types.js'

function mov(partial: Partial<MovimientoControlable> = {}): MovimientoControlable {
  return {
    fechaProceso: '2026-09-01',
    tipo: 'debito',
    montoCentavos: 10_000,
    descripcion: 'PAGO PROVEEDOR',
    codeDescriptionIb: null,
    customerCuit: null,
    operationCodeBank: '500',
    operationCodeIb: 'TRF',
    voucherNumber: 44,
    correlativeNumber: 3,
    depositorDescription: 'ACME',
    categoriaId: 'cat-pagos',
    ...partial,
  }
}

function diasDe(debitos: number, creditos = 0, fecha = '2026-09-01') {
  return [{ fecha, debitosCentavos: debitos, creditosCentavos: creditos }]
}

describe('control del extracto', () => {
  it('si todo coincide, no falta ni sobra nada', () => {
    const fila = mov()
    const resultado = controlarExtracto({
      filas: [fila],
      movimientosBacarnet: [fila],
      dias: diasDe(10_000),
    })
    expect(resultado.coincide).toBe(true)
    expect(resultado.faltanEnBacarnet).toEqual([])
    expect(resultado.sobranEnBacarnet).toEqual([])
    expect(resultado.porDia[0]?.coincide).toBe(true)
    expect(resultado.categoriaIdPorFila).toEqual(['cat-pagos'])
  })

  it('marca el movimiento que está en el extracto y no en BacarNet', () => {
    const comun = mov()
    const soloBanco = mov({
      descripcion: 'COMISION',
      montoCentavos: 300,
      correlativeNumber: 4,
      voucherNumber: 45,
      categoriaId: null,
    })
    const resultado = controlarExtracto({
      filas: [comun, soloBanco],
      movimientosBacarnet: [comun],
      dias: diasDe(10_300),
    })
    expect(resultado.coincide).toBe(false)
    expect(resultado.sobranEnBacarnet).toEqual([])
    expect(resultado.faltanEnBacarnet.map((item) => item.concepto)).toEqual(['COMISION'])
    expect(resultado.categoriaIdPorFila).toEqual(['cat-pagos', null])
  })

  it('marca el movimiento que está en BacarNet y no en el extracto', () => {
    const comun = mov()
    const soloNuestro = mov({
      descripcion: 'AJUSTE',
      montoCentavos: 800,
      correlativeNumber: 9,
      voucherNumber: 90,
    })
    const resultado = controlarExtracto({
      filas: [comun],
      movimientosBacarnet: [comun, soloNuestro],
      dias: diasDe(10_000),
    })
    expect(resultado.faltanEnBacarnet).toEqual([])
    expect(resultado.sobranEnBacarnet.map((item) => item.concepto)).toEqual(['AJUSTE'])
    expect(resultado.coincide).toBe(false)
  })

  it('empareja si solo cambió la descripción, y si no, por fecha monto tipo y comprobante', () => {
    const delBanco = mov({ descripcion: 'IMPUESTO LEY 25413' })
    const enBacarnet = mov({ descripcion: 'NO INFORMADO', categoriaId: 'cat-imp' })
    const porDescripcion = controlarExtracto({
      filas: [delBanco],
      movimientosBacarnet: [enBacarnet],
      dias: diasDe(10_000),
    })
    expect(porDescripcion.faltanEnBacarnet).toEqual([])
    expect(porDescripcion.categoriaIdPorFila).toEqual(['cat-imp'])

    const otroCodigo = mov({
      descripcion: 'OTRO TEXTO',
      operationCodeBank: '999',
      operationCodeIb: 'XXX',
      categoriaId: 'cat-respaldo',
    })
    const porComprobante = controlarExtracto({
      filas: [mov({ descripcion: 'TEXTO DEL BANCO', operationCodeBank: '1', operationCodeIb: '2' })],
      movimientosBacarnet: [otroCodigo],
      dias: diasDe(10_000),
    })
    expect(porComprobante.faltanEnBacarnet).toEqual([])
    expect(porComprobante.categoriaIdPorFila).toEqual(['cat-respaldo'])
  })

  it('no junta dos filas iguales con un solo movimiento de BacarNet', () => {
    const fila = mov()
    const resultado = controlarExtracto({
      filas: [fila, fila],
      movimientosBacarnet: [fila],
      dias: diasDe(20_000),
    })
    expect(resultado.faltanEnBacarnet).toHaveLength(1)
    expect(resultado.sobranEnBacarnet).toEqual([])
    expect(resultado.categoriaIdPorFila).toEqual(['cat-pagos', null])
  })

  it('avisa si los totales del día no cierran aunque los movimientos emparejen', () => {
    const fila = mov()
    const resultado = controlarExtracto({
      filas: [fila],
      movimientosBacarnet: [fila],
      dias: diasDe(25_000),
    })
    expect(resultado.faltanEnBacarnet).toEqual([])
    expect(resultado.sobranEnBacarnet).toEqual([])
    expect(resultado.porDia[0]).toMatchObject({
      debitosExtractoCentavos: 25_000,
      debitosBacarnetCentavos: 10_000,
      coincide: false,
    })
    expect(resultado.coincide).toBe(false)
  })
})
