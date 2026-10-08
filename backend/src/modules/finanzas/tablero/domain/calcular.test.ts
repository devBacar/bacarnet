import { describe, expect, it } from 'vitest'
import { armarTablero, type EntradaTablero, type MovimientoTablero } from './calcular.js'
import { esMes, ultimoDiaMes, ultimoMesCompleto } from './fechas.js'

function mov(parcial: Partial<MovimientoTablero> & Pick<MovimientoTablero, 'tipo' | 'montoCentavos' | 'fechaProceso'>): MovimientoTablero {
  return {
    cuentaId: 'cc-cba',
    bancoNombre: 'Córdoba',
    categoriaId: null,
    contraparteNombre: null,
    contraparteCuit: null,
    moneda: 'ARS',
    ...parcial,
  }
}

function armar(parcial: Partial<EntradaTablero> = {}) {
  return armarTablero({
    mes: '2026-09',
    moneda: 'ARS',
    hoy: '2026-10-08',
    generadoEn: '2026-10-08T15:00:00.000Z',
    movimientos: [],
    categorias: [],
    cuentas: [],
    saldosDiarios: [],
    cheques: [],
    compromisos: [],
    cobros: [],
    ...parcial,
  })
}

const categorias = [
  { id: 'interno', nombre: 'Movimiento interno', grupo: 'Movimientos internos' },
  { id: 'cobro', nombre: 'Cobro de clientes', grupo: 'Cobros' },
  { id: 'comision', nombre: 'Comisiones bancarias', grupo: 'Gastos bancarios' },
  { id: 'cheque', nombre: 'Impuesto al cheque', grupo: 'Impuestos' },
  { id: 'iva', nombre: 'IVA', grupo: 'Impuestos' },
  { id: 'sueldos', nombre: 'Sueldos', grupo: 'Pagos' },
  { id: 'proveedores', nombre: 'Proveedores', grupo: 'Pagos' },
]

describe('fechas del tablero', () => {
  it('el último mes completo es el anterior, aunque sea el día 1', () => {
    expect(ultimoMesCompleto('2026-10-08')).toBe('2026-09')
    expect(ultimoMesCompleto('2026-10-01')).toBe('2026-09')
    expect(ultimoMesCompleto('2026-01-15')).toBe('2025-12')
  })

  it('conoce el último día, incluso en febrero', () => {
    expect(ultimoDiaMes('2026-09')).toBe('2026-09-30')
    expect(ultimoDiaMes('2024-02')).toBe('2024-02-29')
    expect(ultimoDiaMes('2026-02')).toBe('2026-02-28')
    expect(esMes('2026-09')).toBe(true)
    expect(esMes('2026-13')).toBe(false)
  })
})

describe('movimientos internos', () => {
  it('no entran en entradas, salidas, grupos, contrapartes ni costo', () => {
    const tablero = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-02', tipo: 'credito', montoCentavos: 9_000_00, categoriaId: 'interno', contraparteNombre: 'Bacar' }),
        mov({ fechaProceso: '2026-09-02', tipo: 'debito', montoCentavos: 9_000_00, categoriaId: 'interno', contraparteNombre: 'Bacar' }),
        mov({ fechaProceso: '2026-09-10', tipo: 'credito', montoCentavos: 2_000_00, categoriaId: 'cobro', contraparteNombre: 'Cliente A', contraparteCuit: '20-1' }),
        mov({ fechaProceso: '2026-09-11', tipo: 'debito', montoCentavos: 800_00, contraparteNombre: 'Proveedor' }),
        mov({ fechaProceso: '2026-08-05', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'interno' }),
      ],
    })

    expect(tablero.resumen.entradasCentavos).toBe(2_000_00)
    expect(tablero.resumen.salidasCentavos).toBe(800_00)
    expect(tablero.resumen.costoBancarioCentavos).toBe(0)
    expect(tablero.porMes).toEqual([
      { mes: '2026-09', entradasCentavos: 2_000_00, salidasCentavos: 800_00 },
    ])
    expect(tablero.salidasPorGrupo.map((grupo) => grupo.grupo)).toEqual(['Sin categoría'])
    expect(tablero.contrapartes.entradas.map((item) => item.nombre)).toEqual(['Cliente A'])
    expect(tablero.contrapartes.salidas.map((item) => item.nombre)).toEqual(['Proveedor'])
  })
})

describe('gráfico de meses', () => {
  it('muestra los meses con datos hasta el mes en curso, sin mezclarlos con el mes elegido', () => {
    const tablero = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-10', tipo: 'credito', montoCentavos: 100, categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-10-02', tipo: 'credito', montoCentavos: 999, categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-10-02', tipo: 'debito', montoCentavos: 5_000, categoriaId: 'interno' }),
      ],
    })

    expect(tablero.resumen.entradasCentavos).toBe(100)
    expect(tablero.porMes).toEqual([
      { mes: '2026-09', entradasCentavos: 100, salidasCentavos: 0 },
      { mes: '2026-10', entradasCentavos: 999, salidasCentavos: 0 },
    ])
  })
})

describe('costo bancario', () => {
  it('suma gastos bancarios e impuesto al cheque, y deja afuera el IVA', () => {
    const tablero = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-03', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'comision', bancoNombre: 'Córdoba' }),
        mov({ fechaProceso: '2026-09-03', tipo: 'credito', montoCentavos: 20_00, categoriaId: 'comision', bancoNombre: 'Córdoba' }),
        mov({ fechaProceso: '2026-09-04', tipo: 'debito', montoCentavos: 50_00, categoriaId: 'cheque', bancoNombre: 'Patagonia' }),
        mov({ fechaProceso: '2026-09-04', tipo: 'debito', montoCentavos: 80_00, categoriaId: 'iva', bancoNombre: 'Córdoba' }),
        mov({ fechaProceso: '2026-09-04', tipo: 'debito', montoCentavos: 200_00, categoriaId: 'sueldos', bancoNombre: 'Julio' }),
        mov({ fechaProceso: '2026-08-04', tipo: 'debito', montoCentavos: 80_00, categoriaId: 'comision', bancoNombre: 'Córdoba' }),
        mov({ fechaProceso: '2026-08-04', tipo: 'debito', montoCentavos: 50_00, categoriaId: 'cheque', bancoNombre: 'Patagonia' }),
      ],
    })

    expect(tablero.resumen.salidasCentavos).toBe(430_00)
    expect(tablero.resumen.entradasCentavos).toBe(20_00)
    expect(tablero.resumen.costoBancarioCentavos).toBe(130_00)
    expect(tablero.resumen.costoBancarioPorcentaje).toBe(30.2)
    expect(tablero.costoPorBanco).toEqual([
      { banco: 'Córdoba', centavos: 80_00, mesAnteriorCentavos: 80_00, variacionPorcentaje: 0 },
      { banco: 'Patagonia', centavos: 50_00, mesAnteriorCentavos: 50_00, variacionPorcentaje: 0 },
    ])
    expect(tablero.salidasPorGrupo.find((grupo) => grupo.grupo === 'Impuestos')?.categorias.map((c) => c.nombre).sort()).toEqual([
      'IVA',
      'Impuesto al cheque',
    ])
    expect(tablero.alertas.some((alerta) => alerta.tipo === 'costo_bancario')).toBe(false)
  })

  it('avisa si el costo subió más del 15% y no avisa si subió justo 15%', () => {
    const base = [
      mov({ fechaProceso: '2026-08-01', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'comision' }),
    ]
    const justo = armar({
      categorias,
      movimientos: [...base, mov({ fechaProceso: '2026-09-01', tipo: 'debito', montoCentavos: 115_00, categoriaId: 'comision' })],
    })
    const deMas = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-08-01', tipo: 'debito', montoCentavos: 130_00, categoriaId: 'comision' }),
        mov({ fechaProceso: '2026-09-01', tipo: 'debito', montoCentavos: 150_00, categoriaId: 'comision' }),
      ],
    })

    expect(justo.alertas.some((alerta) => alerta.tipo === 'costo_bancario')).toBe(false)
    const alerta = deMas.alertas.find((item) => item.tipo === 'costo_bancario')
    expect(alerta).toMatchObject({ tipo: 'costo_bancario', porcentaje: 15.4 })
  })
})

describe('contrapartes', () => {
  it('arma el top, junta por CUIT, deja afuera Sin identificar y los sueldos', () => {
    const tablero = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-01', tipo: 'credito', montoCentavos: 400, categoriaId: 'cobro', contraparteNombre: 'Alfa SA', contraparteCuit: '30-1' }),
        mov({ fechaProceso: '2026-09-02', tipo: 'credito', montoCentavos: 50, categoriaId: 'cobro', contraparteNombre: 'Alfa', contraparteCuit: '301' }),
        mov({ fechaProceso: '2026-09-03', tipo: 'credito', montoCentavos: 300, categoriaId: 'cobro', contraparteNombre: 'Beta', contraparteCuit: '30-2' }),
        mov({ fechaProceso: '2026-09-04', tipo: 'credito', montoCentavos: 200, categoriaId: 'cobro', contraparteNombre: 'Gamma' }),
        mov({ fechaProceso: '2026-09-05', tipo: 'credito', montoCentavos: 40, categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-09-06', tipo: 'credito', montoCentavos: 10, categoriaId: 'cobro', contraparteNombre: 'Delta' }),
        mov({ fechaProceso: '2026-09-07', tipo: 'debito', montoCentavos: 90, categoriaId: 'proveedores', contraparteNombre: 'Taller Norte' }),
        mov({ fechaProceso: '2026-09-08', tipo: 'debito', montoCentavos: 500, categoriaId: 'sueldos', contraparteNombre: 'Sueldos de 3 empleados: PEREZ' }),
        mov({ fechaProceso: '2026-09-09', tipo: 'debito', montoCentavos: 10, categoriaId: 'proveedores' }),
      ],
    })

    expect(tablero.contrapartes.entradas.map((item) => [item.nombre, item.centavos])).toEqual([
      ['Alfa SA', 450],
      ['Beta', 300],
      ['Gamma', 200],
      ['Delta', 10],
    ])
    expect(tablero.contrapartes.entradasSinIdentificarPorcentaje).toBe(4)
    expect(tablero.contrapartes.concentracionCobros).toBe(true)
    expect(tablero.contrapartes.concentracionPorcentaje).toBe(95)
    expect(tablero.contrapartes.salidas).toEqual([{ nombre: 'Taller Norte', centavos: 90, porcentaje: 90 }])
    expect(tablero.contrapartes.salidasSinIdentificarPorcentaje).toBe(10)
  })

  it('no avisa si las 3 primeras concentran justo el 35%', () => {
    const chicos = Array.from({ length: 13 }, (_, i) =>
      mov({
        fechaProceso: '2026-09-01',
        tipo: 'credito',
        montoCentavos: 5,
        categoriaId: 'cobro',
        contraparteNombre: `Chico ${i}`,
      }),
    )
    const tablero = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-01', tipo: 'credito', montoCentavos: 15, categoriaId: 'cobro', contraparteNombre: 'A' }),
        mov({ fechaProceso: '2026-09-01', tipo: 'credito', montoCentavos: 12, categoriaId: 'cobro', contraparteNombre: 'B' }),
        mov({ fechaProceso: '2026-09-01', tipo: 'credito', montoCentavos: 8, categoriaId: 'cobro', contraparteNombre: 'C' }),
        ...chicos,
      ],
    })
    expect(tablero.contrapartes.concentracionPorcentaje).toBe(35)
    expect(tablero.contrapartes.concentracionCobros).toBe(false)
  })
})

describe('próximos 30 días', () => {
  it('suma cheques y agenda de la ventana, sin doble contar ni mezclar estados', () => {
    const tablero = armar({
      cuentas: [{ id: 'cc-cba', bancoNombre: 'Córdoba', moneda: 'ARS', saldoActualCentavos: 10_000 }],
      cheques: [
        { id: 'p1', direccion: 'emitido', estado: 'pendiente', fechaPago: '2026-10-20', montoCentavos: 1_000, etiqueta: 'Proveedor' },
        { id: 'p2', direccion: 'emitido', estado: 'pendiente', fechaPago: '2026-12-01', montoCentavos: 9_000, etiqueta: 'Lejos' },
        { id: 'p3', direccion: 'emitido', estado: 'debitado', fechaPago: '2026-10-08', montoCentavos: 500, etiqueta: 'Debitado hoy' },
        { id: 'p4', direccion: 'emitido', estado: 'debitado', fechaPago: '2026-10-12', montoCentavos: 300, etiqueta: 'Debitado con fecha futura' },
        { id: 'c1', direccion: 'recibido', estado: 'en_cartera', fechaPago: '2026-10-15', montoCentavos: 400, etiqueta: 'Cliente' },
        { id: 'c2', direccion: 'recibido', estado: 'depositado', fechaPago: '2026-10-15', montoCentavos: 700, etiqueta: 'Depositado' },
        { id: 'r1', direccion: 'recibido', estado: 'rechazado', fechaPago: '2026-09-18', montoCentavos: 250, etiqueta: 'Rechazado' },
      ],
      compromisos: [
        { id: 'k1', nombre: 'Alquiler', concepto: 'Local', fecha: '2026-10-12', restanteCentavos: 300, moneda: 'ARS', estado: 'pendiente', chequeId: null },
        { id: 'k2', nombre: 'Proveedor', concepto: 'Factura', fecha: '2026-10-20', restanteCentavos: 1_000, moneda: 'ARS', estado: 'pendiente', chequeId: 'p1' },
        { id: 'k3', nombre: 'Pagado', concepto: 'Listo', fecha: '2026-10-11', restanteCentavos: 50, moneda: 'ARS', estado: 'pagado', chequeId: null },
        { id: 'k4', nombre: 'Dólares', concepto: 'Fee', fecha: '2026-10-11', restanteCentavos: 80, moneda: 'USD', estado: 'pendiente', chequeId: null },
      ],
      cobros: [
        { id: 'b1', nombre: 'Cliente Z', fecha: '2026-10-18', montoCentavos: 700, moneda: 'ARS', estado: 'esperado', chequeId: null },
        { id: 'b2', nombre: 'Cliente', fecha: '2026-10-15', montoCentavos: 400, moneda: 'ARS', estado: 'esperado', chequeId: 'c1' },
        { id: 'b3', nombre: 'Confirmado', fecha: '2026-10-16', montoCentavos: 100, moneda: 'ARS', estado: 'confirmado', chequeId: null },
      ],
    })

    expect(tablero.proximos30.desde).toBe('2026-10-08')
    expect(tablero.proximos30.hasta).toBe('2026-11-07')
    // El "debitado" con fecha futura sigue por debitar; el debitado hoy ya está en el saldo.
    expect(tablero.proximos30.chequesADebitar).toMatchObject({ cantidad: 2, centavos: 1_300 })
    expect(tablero.proximos30.chequesACobrar).toMatchObject({ cantidad: 1, centavos: 400 })
    expect(tablero.proximos30.compromisos).toMatchObject({
      cantidad: 1,
      centavos: 300,
      items: [{ etiqueta: 'Alquiler · Local', centavos: 300 }],
    })
    expect(tablero.proximos30.cobros).toMatchObject({ cantidad: 1, centavos: 700 })
    expect(tablero.proximos30.saldoEstimadoCentavos).toBe(10_000 + 400 + 700 - 1_000 - 300 - 300)
    const rechazados = tablero.alertas.find((alerta) => alerta.tipo === 'cheques_rechazados')
    expect(rechazados).toEqual({ id: 'cheques-rechazados', tipo: 'cheques_rechazados', cantidad: 1, centavos: 250 })
  })
})

describe('monedas separadas', () => {
  it('los dólares no se suman con los pesos', () => {
    const compartido = {
      categorias,
      cuentas: [
        { id: 'cc-cba', bancoNombre: 'Córdoba', moneda: 'ARS' as const, saldoActualCentavos: 5_000 },
        { id: 'usd-cba', bancoNombre: 'Córdoba', moneda: 'USD' as const, saldoActualCentavos: 8_000 },
      ],
      saldosDiarios: [
        { cuentaId: 'cc-cba', fecha: '2026-09-08', saldoFinCentavos: 3_000, moneda: 'ARS' as const },
        { cuentaId: 'usd-cba', fecha: '2026-09-08', saldoFinCentavos: 100, moneda: 'USD' as const },
        { cuentaId: 'cc-cba', fecha: '2026-09-01', saldoFinCentavos: -50, moneda: 'ARS' as const },
        { cuentaId: 'usd-cba', fecha: '2026-09-02', saldoFinCentavos: -20, moneda: 'USD' as const },
      ],
      movimientos: [
        mov({ fechaProceso: '2026-09-10', tipo: 'credito', montoCentavos: 1_000, moneda: 'ARS', categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-09-10', tipo: 'credito', montoCentavos: 9_999, moneda: 'USD', categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-09-10', tipo: 'debito', montoCentavos: 400, moneda: 'USD', categoriaId: 'comision', bancoNombre: 'Córdoba' }),
      ],
      cheques: [
        { id: 'p1', direccion: 'emitido' as const, estado: 'pendiente', fechaPago: '2026-10-10', montoCentavos: 200, etiqueta: 'Proveedor' },
      ],
      compromisos: [
        { id: 'k4', nombre: 'Fee', concepto: 'Fee', fecha: '2026-10-11', restanteCentavos: 50, moneda: 'USD' as const, estado: 'pendiente', chequeId: null },
      ],
    }

    const pesos = armar(compartido)
    expect(pesos.resumen.entradasCentavos).toBe(1_000)
    expect(pesos.resumen.salidasCentavos).toBe(0)
    expect(pesos.resumen.costoBancarioCentavos).toBe(0)
    expect(pesos.resumen.saldoHoyCentavos).toBe(5_000)
    expect(pesos.resumen.variacion30Centavos).toBe(2_000)
    expect(pesos.proximos30.compromisos.centavos).toBe(0)
    expect(pesos.proximos30.chequesADebitar.centavos).toBe(200)
    expect(pesos.proximos30.saldoEstimadoCentavos).toBe(4_800)
    expect(pesos.alertas.filter((alerta) => alerta.tipo === 'descubierto')).toEqual([
      { id: 'descubierto-cc-cba', tipo: 'descubierto', banco: 'Córdoba', dias: 1 },
    ])
    expect(pesos.monedas).toEqual(['ARS', 'USD'])

    const dolares = armar({ ...compartido, moneda: 'USD' })
    expect(dolares.resumen.entradasCentavos).toBe(9_999)
    expect(dolares.resumen.salidasCentavos).toBe(400)
    expect(dolares.resumen.costoBancarioCentavos).toBe(400)
    expect(dolares.resumen.saldoHoyCentavos).toBe(8_000)
    expect(dolares.resumen.variacion30Centavos).toBe(7_900)
    expect(dolares.proximos30.chequesADebitar.centavos).toBe(0)
    expect(dolares.proximos30.compromisos.centavos).toBe(50)
    expect(dolares.proximos30.saldoEstimadoCentavos).toBe(7_950)
    expect(dolares.alertas.filter((alerta) => alerta.tipo === 'descubierto')).toEqual([
      { id: 'descubierto-usd-cba', tipo: 'descubierto', banco: 'Córdoba', dias: 1 },
    ])
    expect(dolares.alertas.some((alerta) => alerta.tipo === 'cheques_rechazados')).toBe(false)
  })
})

describe('para mirar', () => {
  it('marca descubierto, salidas mayores que entradas y un mes sin saldo previo', () => {
    const tablero = armar({
      cuentas: [
        { id: 'cc-cba', bancoNombre: 'Córdoba', moneda: 'ARS', saldoActualCentavos: 100 },
        { id: 'cc-jul', bancoNombre: 'Julio', moneda: 'ARS', saldoActualCentavos: 50 },
      ],
      saldosDiarios: [
        { cuentaId: 'cc-cba', fecha: '2026-09-08', saldoFinCentavos: 80, moneda: 'ARS' },
        { cuentaId: 'cc-cba', fecha: '2026-09-01', saldoFinCentavos: -10, moneda: 'ARS' },
        { cuentaId: 'cc-cba', fecha: '2026-09-01', saldoFinCentavos: -10, moneda: 'ARS' },
        { cuentaId: 'cc-cba', fecha: '2026-09-02', saldoFinCentavos: -5, moneda: 'ARS' },
        { cuentaId: 'cc-cba', fecha: '2026-09-03', saldoFinCentavos: 20, moneda: 'ARS' },
      ],
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-10', tipo: 'credito', montoCentavos: 100, categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-09-10', tipo: 'debito', montoCentavos: 250, categoriaId: 'sueldos' }),
      ],
    })

    expect(tablero.resumen.variacion30Centavos).toBeNull()
    expect(tablero.resumen.cuentasSinSaldoPrevio).toEqual(['Julio'])
    expect(tablero.alertas).toEqual([
      { id: 'descubierto-cc-cba', tipo: 'descubierto', banco: 'Córdoba', dias: 2 },
      { id: 'salidas-mayores', tipo: 'salidas_mayores' },
    ])
  })
})
