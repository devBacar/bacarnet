import { describe, expect, it } from 'vitest'
import { armarTablero, type ChequeTablero, type EntradaTablero, type MovimientoTablero } from './calcular.js'
import { esMes, ultimoDiaMes, ultimoMesCompleto } from './fechas.js'

function mov(parcial: Partial<MovimientoTablero> & Pick<MovimientoTablero, 'tipo' | 'montoCentavos' | 'fechaProceso'>): MovimientoTablero {
  return {
    cuentaId: 'cc-cba',
    bancoNombre: 'Córdoba',
    categoriaId: null,
    moneda: 'ARS',
    ...parcial,
  }
}

function cheque(
  parcial: Partial<ChequeTablero> & Pick<ChequeTablero, 'id' | 'direccion' | 'estado' | 'fechaPago' | 'montoCentavos'>,
): ChequeTablero {
  return {
    numero: parcial.id,
    forma: 'fisico',
    banco: 'Córdoba',
    contraparte: 'Alguien',
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
  { id: 'fondo', nombre: 'Fondo común', grupo: 'Inversiones' },
  { id: 'cobro', nombre: 'Cobro de clientes', grupo: 'Cobros' },
  { id: 'prestamo', nombre: 'Préstamos', grupo: 'Financiación' },
  { id: 'comision', nombre: 'Comisiones bancarias', grupo: 'Gastos bancarios' },
  { id: 'cheque', nombre: 'Impuesto al cheque', grupo: 'Impuestos' },
  { id: 'iva', nombre: 'IVA', grupo: 'Impuestos' },
  { id: 'sueldos', nombre: 'Sueldos', grupo: 'Pagos' },
  { id: 'proveedores', nombre: 'Proveedores', grupo: 'Pagos' },
  { id: 'revisar', nombre: 'A confirmar', grupo: 'A revisar' },
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

describe('movimientos internos e inversiones', () => {
  it('no entran en entradas, salidas, grupos ni costo', () => {
    const tablero = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-02', tipo: 'credito', montoCentavos: 9_000_00, categoriaId: 'interno' }),
        mov({ fechaProceso: '2026-09-02', tipo: 'debito', montoCentavos: 9_000_00, categoriaId: 'interno' }),
        mov({ fechaProceso: '2026-09-03', tipo: 'debito', montoCentavos: 4_000_00, categoriaId: 'fondo' }),
        mov({ fechaProceso: '2026-09-04', tipo: 'credito', montoCentavos: 4_000_00, categoriaId: 'fondo' }),
        mov({ fechaProceso: '2026-09-10', tipo: 'credito', montoCentavos: 2_000_00, categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-09-11', tipo: 'debito', montoCentavos: 800_00 }),
        mov({ fechaProceso: '2026-08-05', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'fondo' }),
      ],
    })

    expect(tablero.resumen.entradasCentavos).toBe(2_000_00)
    expect(tablero.resumen.salidasCentavos).toBe(800_00)
    expect(tablero.resumen.costoBancarioCentavos).toBe(0)
    expect(tablero.porMes).toEqual([{ mes: '2026-09', entradasCentavos: 2_000_00, salidasCentavos: 800_00 }])
    expect(tablero.salidasPorGrupo.map((grupo) => grupo.grupo)).toEqual(['Sin categoría'])
    expect(tablero.entradasPorGrupo.map((grupo) => grupo.grupo)).toEqual(['Cobros'])
    expect(tablero).not.toHaveProperty('contrapartes')
    expect(tablero).not.toHaveProperty('alertas')
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

describe('de dónde vino la plata', () => {
  it('agrupa las entradas y deja A revisar y Sin categoría al final, con la cantidad', () => {
    const tablero = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-01', tipo: 'credito', montoCentavos: 1_000, categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-09-02', tipo: 'credito', montoCentavos: 400, categoriaId: 'prestamo' }),
        mov({ fechaProceso: '2026-09-02', tipo: 'credito', montoCentavos: 50, categoriaId: 'prestamo' }),
        mov({ fechaProceso: '2026-09-03', tipo: 'credito', montoCentavos: 80, categoriaId: 'revisar' }),
        mov({ fechaProceso: '2026-09-04', tipo: 'credito', montoCentavos: 10 }),
        mov({ fechaProceso: '2026-09-05', tipo: 'debito', montoCentavos: 200, categoriaId: 'proveedores' }),
      ],
    })

    expect(tablero.entradasPorGrupo.map((grupo) => grupo.grupo)).toEqual(['Cobros', 'Financiación', 'A revisar', 'Sin categoría'])
    expect(tablero.entradasPorGrupo.map((grupo) => grupo.faltaClasificar)).toEqual([false, false, true, true])
    const financiacion = tablero.entradasPorGrupo.find((grupo) => grupo.grupo === 'Financiación')
    expect(financiacion?.categorias).toEqual([
      { nombre: 'Préstamos', centavos: 450, porcentaje: 100, cantidad: 2 },
    ])
    expect(tablero.entradasPorGrupo.find((grupo) => grupo.grupo === 'Sin categoría')?.categorias[0]?.cantidad).toBe(1)
    expect(tablero.salidasPorGrupo.map((grupo) => grupo.grupo)).toEqual(['Pagos'])
  })
})

describe('costo bancario', () => {
  it('suma gastos bancarios e impuesto al cheque, con detalle por banco, y no los muestra en los grupos', () => {
    const tablero = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-03', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'comision', bancoNombre: 'Córdoba' }),
        mov({ fechaProceso: '2026-09-03', tipo: 'credito', montoCentavos: 20_00, categoriaId: 'comision', bancoNombre: 'Córdoba' }),
        mov({ fechaProceso: '2026-09-04', tipo: 'debito', montoCentavos: 50_00, categoriaId: 'cheque', bancoNombre: 'Patagonia' }),
        mov({ fechaProceso: '2026-09-04', tipo: 'debito', montoCentavos: 80_00, categoriaId: 'iva', bancoNombre: 'Córdoba' }),
        mov({ fechaProceso: '2026-09-04', tipo: 'debito', montoCentavos: 200_00, categoriaId: 'sueldos', bancoNombre: 'Julio' }),
        mov({ fechaProceso: '2026-08-04', tipo: 'debito', montoCentavos: 80_00, categoriaId: 'comision', bancoNombre: 'Córdoba' }),
        mov({ fechaProceso: '2026-08-04', tipo: 'debito', montoCentavos: 40_00, categoriaId: 'cheque', bancoNombre: 'Patagonia' }),
      ],
    })

    expect(tablero.resumen.salidasCentavos).toBe(430_00)
    expect(tablero.resumen.entradasCentavos).toBe(20_00)
    expect(tablero.resumen.costoBancarioCentavos).toBe(130_00)
    expect(tablero.resumen.costoBancarioPorcentaje).toBe(30.2)
    expect(tablero.resumen.costoBancarioMesAnteriorCentavos).toBe(120_00)
    expect(tablero.resumen.costoBancarioVariacionPorcentaje).toBe(8.3)
    expect(tablero.costoPorBanco).toEqual([
      {
        banco: 'Córdoba',
        centavos: 80_00,
        mesAnteriorCentavos: 80_00,
        variacionPorcentaje: 0,
        categorias: [{ nombre: 'Comisiones bancarias', centavos: 80_00, cantidad: 2 }],
      },
      {
        banco: 'Patagonia',
        centavos: 50_00,
        mesAnteriorCentavos: 40_00,
        variacionPorcentaje: 25,
        categorias: [{ nombre: 'Impuesto al cheque', centavos: 50_00, cantidad: 1 }],
      },
    ])
    expect(tablero.salidasPorGrupo.map((grupo) => grupo.grupo)).toEqual(['Pagos', 'Impuestos'])
    expect(tablero.salidasPorGrupo.find((grupo) => grupo.grupo === 'Impuestos')?.categorias).toEqual([
      { nombre: 'IVA', centavos: 80_00, porcentaje: 100, cantidad: 1 },
    ])
    expect(tablero.salidasPorGrupo.some((grupo) => grupo.grupo === 'Gastos bancarios')).toBe(false)
    expect(tablero.entradasPorGrupo).toEqual([])
    expect(tablero.salidasPorGrupo.find((grupo) => grupo.grupo === 'Pagos')?.categorias[0]).toMatchObject({
      nombre: 'Sueldos',
      cantidad: 1,
    })
  })

  it('mide la variación del total contra el mes anterior', () => {
    const tablero = armar({
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-08-01', tipo: 'debito', montoCentavos: 130_00, categoriaId: 'comision' }),
        mov({ fechaProceso: '2026-09-01', tipo: 'debito', montoCentavos: 150_00, categoriaId: 'comision' }),
      ],
    })
    expect(tablero.resumen.costoBancarioVariacionPorcentaje).toBe(15.4)
    expect(tablero).not.toHaveProperty('alertas')
  })
})

describe('próximos 30 días', () => {
  it('suma cheques y agenda de la ventana, sin doble contar ni mezclar estados', () => {
    const tablero = armar({
      cuentas: [{ id: 'cc-cba', bancoNombre: 'Córdoba', moneda: 'ARS', saldoActualCentavos: 10_000 }],
      cheques: [
        cheque({ id: 'p1', direccion: 'emitido', estado: 'pendiente', fechaPago: '2026-10-20', montoCentavos: 1_000, contraparte: 'Proveedor' }),
        cheque({ id: 'p2', direccion: 'emitido', estado: 'pendiente', fechaPago: '2026-12-01', montoCentavos: 9_000, contraparte: 'Lejos' }),
        cheque({ id: 'p3', direccion: 'emitido', estado: 'debitado', fechaPago: '2026-10-08', montoCentavos: 500, contraparte: 'Debitado hoy' }),
        cheque({ id: 'p4', direccion: 'emitido', estado: 'debitado', fechaPago: '2026-10-15', montoCentavos: 300, contraparte: 'Debitado con fecha futura' }),
        cheque({ id: 'c1', direccion: 'recibido', estado: 'en_cartera', fechaPago: '2026-10-15', montoCentavos: 400, contraparte: 'Cliente' }),
        cheque({ id: 'c2', direccion: 'recibido', estado: 'depositado', fechaPago: '2026-10-15', montoCentavos: 700, contraparte: 'Depositado' }),
        cheque({ id: 'r1', direccion: 'recibido', estado: 'rechazado', fechaPago: '2026-09-18', montoCentavos: 250, contraparte: 'Rechazado' }),
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
    // El debitado con fecha futura sigue por debitar; el debitado hoy ya está en el saldo.
    expect(tablero.proximos30.totalADebitarCentavos).toBe(1_300)
    expect(tablero.proximos30.totalACobrarCentavos).toBe(400)
    expect(tablero.proximos30.compromisosCantidad).toBe(1)
    expect(tablero.proximos30.compromisosCentavos).toBe(300)
    expect(tablero.proximos30.cobrosCantidad).toBe(1)
    expect(tablero.proximos30.cobrosCentavos).toBe(700)
    expect(tablero.proximos30.saldoEstimadoCentavos).toBe(10_000 + 400 + 700 - 1_000 - 300 - 300)
    expect(tablero.proximos30.cheques.map((item) => item.id)).toEqual(['p4', 'c1', 'p1'])
    expect(tablero).not.toHaveProperty('alertas')
  })

  it('devuelve todos los cheques, con fecha efectiva de finde y de feriado', () => {
    const muchos = Array.from({ length: 12 }, (_, i) =>
      cheque({
        id: `m${i}`,
        direccion: 'emitido',
        estado: 'pendiente',
        fechaPago: '2026-10-21',
        montoCentavos: 10 + i,
        numero: String(i + 1),
        contraparte: `Proveedor ${i}`,
      }),
    )
    const tablero = armar({
      cheques: [
        cheque({
          id: 'finde',
          direccion: 'emitido',
          estado: 'pendiente',
          fechaPago: '2026-10-10',
          montoCentavos: 1_000,
          numero: '111',
          banco: 'Nación',
          contraparte: 'Proveedor SA',
          forma: 'fisico',
        }),
        cheque({
          id: 'viernes',
          direccion: 'recibido',
          estado: 'en_cartera',
          fechaPago: '2026-10-09',
          montoCentavos: 2_000,
          numero: '222',
          banco: 'Galicia',
          contraparte: 'Cliente SA',
          forma: 'echeq',
        }),
        cheque({
          id: 'feriado',
          direccion: 'emitido',
          estado: 'pendiente',
          fechaPago: '2026-10-12',
          montoCentavos: 300,
          numero: '333',
          banco: 'Córdoba',
          contraparte: 'Taller',
          forma: 'fisico',
        }),
        cheque({
          id: 'hoy-debitado',
          direccion: 'emitido',
          estado: 'debitado',
          fechaPago: '2026-10-08',
          montoCentavos: 50,
        }),
        ...muchos,
      ],
    })

    const porId = new Map(tablero.proximos30.cheques.map((item) => [item.id, item]))
    expect(porId.get('viernes')).toMatchObject({
      id: 'viernes',
      tipo: 'a_cobrar',
      fechaPago: '2026-10-09',
      fechaEfectiva: '2026-10-13',
      banco: 'Galicia',
      contraparte: 'Cliente SA',
      numero: '222',
      forma: 'echeq',
      montoCentavos: 2_000,
    })
    expect(porId.get('finde')).toMatchObject({
      tipo: 'a_debitar',
      fechaPago: '2026-10-10',
      fechaEfectiva: '2026-10-13',
      banco: 'Nación',
      contraparte: 'Proveedor SA',
      numero: '111',
      forma: 'fisico',
      montoCentavos: 1_000,
    })
    expect(porId.get('feriado')).toMatchObject({
      tipo: 'a_debitar',
      fechaPago: '2026-10-12',
      fechaEfectiva: '2026-10-13',
    })
    expect(porId.has('hoy-debitado')).toBe(false)
    expect(tablero.proximos30.cheques).toHaveLength(15)
    expect(tablero.proximos30.cheques.map((item) => item.fechaEfectiva).every((fecha, i, todas) => i === 0 || todas[i - 1] <= fecha)).toBe(true)

    const semana13 = tablero.proximos30.porSemana.find((semana) => semana.desde === '2026-10-12')
    expect(semana13).toEqual({
      desde: '2026-10-12',
      debitarCentavos: 1_300,
      acreditarCentavos: 2_000,
      netoCentavos: 700,
    })
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
      ],
      movimientos: [
        mov({ fechaProceso: '2026-09-10', tipo: 'credito', montoCentavos: 1_000, moneda: 'ARS', categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-09-10', tipo: 'credito', montoCentavos: 9_999, moneda: 'USD', categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-09-10', tipo: 'debito', montoCentavos: 400, moneda: 'USD', categoriaId: 'comision', bancoNombre: 'Córdoba' }),
      ],
      cheques: [cheque({ id: 'p1', direccion: 'emitido', estado: 'pendiente', fechaPago: '2026-10-13', montoCentavos: 200 })],
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
    expect(pesos.proximos30.compromisosCentavos).toBe(0)
    expect(pesos.proximos30.totalADebitarCentavos).toBe(200)
    expect(pesos.proximos30.saldoEstimadoCentavos).toBe(4_800)
    expect(pesos.monedas).toEqual(['ARS', 'USD'])
    expect(pesos).not.toHaveProperty('alertas')

    const dolares = armar({ ...compartido, moneda: 'USD' })
    expect(dolares.resumen.entradasCentavos).toBe(9_999)
    expect(dolares.resumen.salidasCentavos).toBe(400)
    expect(dolares.resumen.costoBancarioCentavos).toBe(400)
    expect(dolares.resumen.saldoHoyCentavos).toBe(8_000)
    expect(dolares.resumen.variacion30Centavos).toBe(7_900)
    expect(dolares.proximos30.totalADebitarCentavos).toBe(0)
    expect(dolares.proximos30.cheques).toEqual([])
    expect(dolares.proximos30.compromisosCentavos).toBe(50)
    expect(dolares.proximos30.saldoEstimadoCentavos).toBe(7_950)
  })
})

describe('saldo de hace 30 días', () => {
  it('no compara si falta el saldo previo de alguna cuenta', () => {
    const tablero = armar({
      cuentas: [
        { id: 'cc-cba', bancoNombre: 'Córdoba', moneda: 'ARS', saldoActualCentavos: 100 },
        { id: 'cc-jul', bancoNombre: 'Julio', moneda: 'ARS', saldoActualCentavos: 50 },
      ],
      saldosDiarios: [{ cuentaId: 'cc-cba', fecha: '2026-09-08', saldoFinCentavos: 80, moneda: 'ARS' }],
      categorias,
      movimientos: [
        mov({ fechaProceso: '2026-09-10', tipo: 'credito', montoCentavos: 100, categoriaId: 'cobro' }),
        mov({ fechaProceso: '2026-09-10', tipo: 'debito', montoCentavos: 250, categoriaId: 'sueldos' }),
      ],
    })

    expect(tablero.resumen.variacion30Centavos).toBeNull()
    expect(tablero.resumen.cuentasSinSaldoPrevio).toEqual(['Julio'])
    expect(tablero).not.toHaveProperty('alertas')
    expect(tablero).not.toHaveProperty('contrapartes')
  })
})
