import { describe, expect, it } from 'vitest'
import {
  armarCashflow,
  calcularFaltanteCentavos,
  elegirSaldoInicio,
  esFinDeSemana,
  textoAvisoFaltante,
  ultimoDiaHabil,
  validarFechaCashflow,
} from './cashflow.js'

const categorias = [
  { id: 'impuestos', nombre: 'Impuestos', color: '#b45309', grupo: null },
  { id: 'cobros', nombre: 'Cobros de clientes', color: '#0f766e', grupo: null },
]

describe('armarCashflow', () => {
  it('suma entradas y salidas por categoría y deja afuera la otra moneda', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-28',
      moneda: 'ARS',
      saldoInicial: { fechaId: '2026-09-25', centavos: 1_000_00 },
      saldoCierre: { centavos: 1_500_00 },
      categorias,
      movimientos: [
        { moneda: 'ARS', tipo: 'credito', montoCentavos: 800_00, categoriaId: 'cobros' },
        { moneda: 'ARS', tipo: 'credito', montoCentavos: 200_00, categoriaId: null },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 300_00, categoriaId: 'impuestos' },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'impuestos' },
        { moneda: 'USD', tipo: 'credito', montoCentavos: 50_00, categoriaId: 'cobros' },
      ],
    })

    expect(cashflow.entradasCentavos).toBe(1_000_00)
    expect(cashflow.salidasCentavos).toBe(400_00)
    expect(cashflow.entradas.map((item) => [item.grupo, item.porcentaje, item.sinCategoria])).toEqual([
      ['Cobros de clientes', 80, false],
      ['Sin categoría', 20, true],
    ])
    expect(cashflow.entradas[1]?.categorias).toEqual([
      expect.objectContaining({ categoriaId: null, nombre: 'Sin categoría', porcentaje: 100, color: null }),
    ])
    expect(cashflow.salidas).toEqual([
      expect.objectContaining({
        grupo: 'Impuestos',
        centavos: 400_00,
        porcentaje: 100,
        sinCategoria: false,
        color: '#b45309',
      }),
    ])
    expect(cashflow.saldoFinal).toEqual({ estado: 'cerrado', centavos: 1_500_00 })
  })

  it('sin cierre del día estima el saldo en vivo a partir del inicial', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-29',
      moneda: 'ARS',
      saldoInicial: { fechaId: '2026-09-28', centavos: 1_000_00 },
      saldoCierre: null,
      categorias,
      movimientos: [
        { moneda: 'ARS', tipo: 'credito', montoCentavos: 200_00, categoriaId: 'cobros' },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 50_00, categoriaId: 'impuestos' },
      ],
    })

    expect(cashflow.saldoFinal).toEqual({ estado: 'pendiente', centavos: 1_150_00 })
  })

  it('sin cierre anterior no inventa un saldo final', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-29',
      moneda: 'USD',
      saldoInicial: null,
      saldoCierre: null,
      categorias,
      movimientos: [],
    })

    expect(cashflow.saldoInicial).toBeNull()
    expect(cashflow.saldoFinal).toEqual({ estado: 'pendiente', centavos: null })
    expect(cashflow.entradas).toEqual([])
    expect(cashflow.salidas).toEqual([])
  })

  it('agrupa categorías, toma el color de la de mayor monto y el porcentaje es del grupo', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-29',
      moneda: 'ARS',
      saldoInicial: null,
      saldoCierre: null,
      categorias: [
        { id: 'iva', nombre: 'IVA', color: '#a16207', grupo: 'Impuestos' },
        { id: 'iibb', nombre: 'Ingresos Brutos', color: '#c2410c', grupo: 'Impuestos' },
        { id: 'sueldos', nombre: 'Sueldos', color: '#7c3aed', grupo: 'Pagos' },
        { id: 'cheques', nombre: 'Cheques pagados', color: '#9a3412', grupo: 'Cheques' },
      ],
      movimientos: [
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'iva' },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 200_00, categoriaId: 'iibb' },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'sueldos' },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'cheques' },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 50_00, categoriaId: 'borrada' },
      ],
    })

    expect(cashflow.salidas.map((item) => [item.grupo, item.porcentaje, item.color, item.sinCategoria])).toEqual([
      ['Impuestos', 54.5, '#c2410c', false],
      ['Cheques', 18.2, '#9a3412', false],
      ['Pagos', 18.2, '#7c3aed', false],
      ['Categoría eliminada', 9.1, null, false],
    ])
    const impuestos = cashflow.salidas[0]
    expect(impuestos?.categorias.map((item) => [item.nombre, item.porcentaje])).toEqual([
      ['Ingresos Brutos', 66.7],
      ['IVA', 33.3],
    ])
    expect(impuestos?.centavos).toBe(300_00)
    const eliminada = cashflow.salidas.find((item) => item.grupo === 'Categoría eliminada')
    expect(eliminada?.categorias[0]).toEqual(
      expect.objectContaining({ categoriaId: 'borrada', nombre: 'Categoría eliminada', color: null }),
    )
  })

  it('a igual monto ordena grupos y categorías por nombre', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-29',
      moneda: 'ARS',
      saldoInicial: null,
      saldoCierre: null,
      categorias: [
        { id: 'sellos', nombre: 'Sellos', color: '#111111', grupo: 'Impuestos' },
        { id: 'iva', nombre: 'IVA', color: '#222222', grupo: 'Impuestos' },
      ],
      movimientos: [
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'sellos' },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'iva' },
      ],
    })

    expect(cashflow.salidas[0]?.color).toBe('#222222')
    expect(cashflow.salidas[0]?.categorias.map((item) => item.nombre)).toEqual(['IVA', 'Sellos'])
  })

  it('detalla los textos del banco por cuenta y deja el resto afuera del máximo', () => {
    const base = { moneda: 'ARS' as const, categoriaId: null }
    const muchos = Array.from({ length: 16 }, (_, i) => ({
      moneda: 'ARS' as const,
      tipo: 'debito' as const,
      montoCentavos: (16 - i) * 100,
      categoriaId: 'impuestos',
      descripcion: `T${String(i).padStart(2, '0')}`,
      cuentaId: 'cc',
      bancoNombre: 'Córdoba',
    }))
    const cashflow = armarCashflow({
      fecha: '2026-09-29',
      moneda: 'ARS',
      saldoInicial: null,
      saldoCierre: null,
      categorias,
      movimientos: [
        { ...base, tipo: 'credito', montoCentavos: 100_00, descripcion: 'TRANS P PR', cuentaId: 'cordoba-cc', bancoNombre: 'Córdoba' },
        { ...base, tipo: 'credito', montoCentavos: 300_00, descripcion: 'TRANS P PR', cuentaId: 'cordoba-cc', bancoNombre: 'Córdoba' },
        { ...base, tipo: 'credito', montoCentavos: 50_00, descripcion: 'TRANS P PR', cuentaId: 'julio-cc', bancoNombre: 'Julio' },
        { ...base, tipo: 'credito', montoCentavos: 500_00, descripcion: 'DESC.DOC', cuentaId: 'cordoba-cc', bancoNombre: 'Córdoba' },
        { ...base, tipo: 'debito', montoCentavos: 10_00, descripcion: 'IVA 21%', cuentaId: 'cordoba-cc', bancoNombre: 'Córdoba' },
        { moneda: 'ARS', tipo: 'credito', montoCentavos: 999_00, categoriaId: 'cobros', descripcion: 'TRF.DATA' },
        ...muchos,
      ],
    })

    const sinCategoria = cashflow.entradas.find((item) => item.sinCategoria)
    expect(sinCategoria?.color).toBeNull()
    expect(sinCategoria?.categorias).toHaveLength(1)
    expect(sinCategoria?.categorias[0]?.detalle).toEqual([
      { descripcion: 'DESC.DOC', cuentaId: 'cordoba-cc', bancoNombre: 'Córdoba', centavos: 500_00, cantidad: 1 },
      { descripcion: 'TRANS P PR', cuentaId: 'cordoba-cc', bancoNombre: 'Córdoba', centavos: 400_00, cantidad: 2 },
      { descripcion: 'TRANS P PR', cuentaId: 'julio-cc', bancoNombre: 'Julio', centavos: 50_00, cantidad: 1 },
    ])
    expect(sinCategoria?.categorias[0]?.detalleRestantes).toBe(0)

    const cobros = cashflow.entradas.find((item) => item.grupo === 'Cobros de clientes')
    expect(cobros?.categorias[0]?.detalle).toEqual([
      { descripcion: 'TRF.DATA', cuentaId: '', bancoNombre: '', centavos: 999_00, cantidad: 1 },
    ])

    const salidaSinCategoria = cashflow.salidas.find((item) => item.sinCategoria)
    expect(salidaSinCategoria?.categorias[0]?.detalle).toEqual([
      { descripcion: 'IVA 21%', cuentaId: 'cordoba-cc', bancoNombre: 'Córdoba', centavos: 10_00, cantidad: 1 },
    ])

    const impuestos = cashflow.salidas.find((item) => item.grupo === 'Impuestos')
    expect(impuestos?.categorias[0]?.detalle).toHaveLength(15)
    expect(impuestos?.categorias[0]?.detalle[0]?.descripcion).toBe('T00')
    expect(impuestos?.categorias[0]?.detalle[14]?.descripcion).toBe('T14')
    expect(impuestos?.categorias[0]?.detalleRestantes).toBe(1)
  })
})

describe('fechas del cashflow', () => {
  it('el sábado y el domingo retroceden al viernes', () => {
    expect(esFinDeSemana('2026-09-26')).toBe(true)
    expect(ultimoDiaHabil('2026-09-26')).toBe('2026-09-25')
    expect(ultimoDiaHabil('2026-09-29')).toBe('2026-09-29')
  })

  it('rechaza futuro y más de un mes atrás', () => {
    expect(() => validarFechaCashflow('2026-09-30', '2026-09-29')).toThrow(/futura/)
    expect(() => validarFechaCashflow('2026-08-01', '2026-09-29')).toThrow(/un mes/)
    expect(() => validarFechaCashflow('2026-09-01', '2026-09-29')).not.toThrow()
  })
})

describe('faltante por cuenta', () => {
  it('es cero cuando el cierre del banco coincide al centavo con los movimientos', () => {
    expect(
      calcularFaltanteCentavos({
        saldoInicioCentavos: 1_000_00,
        saldoFinCentavos: 1_500_00,
        entradasCentavos: 800_00,
        salidasCentavos: 300_00,
      }),
    ).toBe(0)
  })

  it('absorbe menos de un peso y deja en cero', () => {
    expect(
      calcularFaltanteCentavos({
        saldoInicioCentavos: 1_000_00,
        saldoFinCentavos: 1_500_50,
        entradasCentavos: 800_00,
        salidasCentavos: 300_00,
      }),
    ).toBe(0)
    expect(
      calcularFaltanteCentavos({
        saldoInicioCentavos: 1_000_00,
        saldoFinCentavos: 1_501_00,
        entradasCentavos: 800_00,
        salidasCentavos: 300_00,
      }),
    ).toBe(100)
  })

  it('marca la plata que se movió si el banco no mandó el detalle', () => {
    expect(
      calcularFaltanteCentavos({
        saldoInicioCentavos: -100_000_00,
        saldoFinCentavos: -150_000_00,
        entradasCentavos: 0,
        salidasCentavos: 0,
      }),
    ).toBe(-50_000_00)
  })
})

describe('elección del saldo de arranque', () => {
  it('salta el fin de semana y toma el cierre del viernes, no el jueves', () => {
    const inicio = elegirSaldoInicio({
      fecha: '2026-09-28',
      hoy: '2026-09-29',
      docs: [
        {
          cuentaId: 'julio-cc',
          fecha: '2026-09-24',
          estado: 'cerrado',
          saldoInicioCentavos: null,
          saldoFinCentavos: 100_00,
        },
        {
          cuentaId: 'julio-cc',
          fecha: '2026-09-25',
          estado: 'cerrado',
          saldoInicioCentavos: null,
          saldoFinCentavos: 800_00,
        },
      ],
    })
    expect(inicio).toEqual({ fechaId: '2026-09-25', centavos: 800_00 })
  })

  it('si el día es hoy, usa el arranque que informa el banco', () => {
    const inicio = elegirSaldoInicio({
      fecha: '2026-09-29',
      hoy: '2026-09-29',
      docs: [
        {
          cuentaId: 'julio-cc',
          fecha: '2026-09-25',
          estado: 'cerrado',
          saldoInicioCentavos: null,
          saldoFinCentavos: -80_000,
        },
        {
          cuentaId: 'julio-cc',
          fecha: '2026-09-28',
          estado: 'cerrado',
          saldoInicioCentavos: null,
          saldoFinCentavos: -100_000,
        },
        {
          cuentaId: 'julio-cc',
          fecha: '2026-09-29',
          estado: 'en_curso',
          saldoInicioCentavos: -99_900,
          saldoFinCentavos: -150_000,
        },
      ],
    })
    expect(inicio).toEqual({ fechaId: '2026-09-28', centavos: -99_900 })
  })
})

describe('avisos de detalle faltante', () => {
  it('hoy explica que la plata sale y que mañana se completa', () => {
    expect(
      textoAvisoFaltante({
        bancoNombre: 'Julio',
        faltanteCentavos: -4_700_000_000,
        esHoy: true,
        moneda: 'ARS',
      }),
    ).toBe(
      'Banco Julio todavía no mandó el detalle de $\u00a047.000.000,00, plata que salió hoy. Llega mañana y este día se completa solo.',
    )
  })

  it('un día pasado dice si la plata entró', () => {
    expect(
      textoAvisoFaltante({
        bancoNombre: 'Julio',
        faltanteCentavos: 123_456,
        esHoy: false,
        moneda: 'ARS',
      }),
    ).toBe('Banco Julio no mandó el detalle de $\u00a01.234,56, plata que entró ese día.')
  })
})

describe('cashflow con cierre del banco', () => {
  const julio = { cuentaId: 'julio-cc', bancoNombre: 'Julio', moneda: 'ARS' as const }
  const patagonia = { cuentaId: 'patagonia-cc', bancoNombre: 'Patagonia', moneda: 'ARS' as const }

  it('hoy muestra el saldo de ahora y avisa si falta el detalle', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-29',
      hoy: '2026-09-29',
      moneda: 'ARS',
      saldoInicial: null,
      saldoCierre: null,
      categorias,
      cuentas: [julio],
      saldosDiarios: [
        {
          cuentaId: 'julio-cc',
          fecha: '2026-09-28',
          estado: 'cerrado',
          saldoInicioCentavos: null,
          saldoFinCentavos: -100_000_00,
        },
        {
          cuentaId: 'julio-cc',
          fecha: '2026-09-29',
          estado: 'en_curso',
          saldoInicioCentavos: -100_000_00,
          saldoFinCentavos: -147_000_00,
        },
      ],
      movimientos: [
        {
          moneda: 'ARS',
          tipo: 'credito',
          montoCentavos: 800_00,
          categoriaId: 'cobros',
          cuentaId: 'julio-cc',
          bancoNombre: 'Julio',
        },
      ],
    })

    expect(cashflow.origenSaldos).toBe('banco')
    // El saldo inicial "oficial" es -100_000_00; se le suma el faltante de Julio
    // (-47_800_00, plata que salió sin detalle) para que no se vea de menos.
    expect(cashflow.saldoInicial).toEqual({ fechaId: '2026-09-28', centavos: -147_800_00 })
    expect(cashflow.saldoFinal).toEqual({ estado: 'en_curso', centavos: -147_000_00 })
    expect(cashflow.entradasCentavos).toBe(800_00)
    expect(cashflow.entradas[0]?.grupo).toBe('Cobros de clientes')
    expect(cashflow.bancos).toEqual([
      {
        bancoNombre: 'Julio',
        saldoInicioCentavos: -100_000_00,
        entradasCentavos: 800_00,
        salidasCentavos: 0,
        saldoFinCentavos: -147_000_00,
        faltanteCentavos: -47_800_00,
      },
    ])
    expect(cashflow.avisos).toHaveLength(1)
    expect(cashflow.avisos[0]?.texto).toContain('plata que salió hoy')
    expect(cashflow.avisos[0]?.texto).toContain('Llega mañana')
  })

  it('si no hay cierre del banco, usa la foto de las 15 hs de cada cuenta', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-28',
      hoy: '2026-09-29',
      moneda: 'ARS',
      saldoInicial: { fechaId: '2026-09-25', centavos: 999_00 },
      saldoCierre: { centavos: 111_00 },
      categorias,
      cuentas: [julio, patagonia],
      saldosDiarios: [],
      cierre15Anterior: {
        fechaId: '2026-09-25',
        cuentas: [
          { cuentaId: 'julio-cc', saldoCentavos: 100_00 },
          { cuentaId: 'patagonia-cc', saldoCentavos: 200_00 },
        ],
      },
      cierre15Dia: {
        cuentas: [
          { cuentaId: 'julio-cc', saldoCentavos: 150_00 },
          { cuentaId: 'patagonia-cc', saldoCentavos: 250_00 },
        ],
      },
      movimientos: [],
    })

    expect(cashflow.origenSaldos).toBe('cierre15')
    expect(cashflow.saldoInicial).toEqual({ fechaId: '2026-09-25', centavos: 300_00 })
    expect(cashflow.saldoFinal).toEqual({ estado: 'cerrado', centavos: 400_00 })
    expect(cashflow.avisos).toEqual([])
    expect(cashflow.bancos.map((banco) => banco.bancoNombre)).toEqual(['Julio', 'Patagonia'])
  })

  it('si una sola cuenta no tiene cierre del banco, el origen queda en la foto de las 15', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-28',
      hoy: '2026-09-29',
      moneda: 'ARS',
      saldoInicial: null,
      saldoCierre: null,
      categorias,
      cuentas: [julio, patagonia],
      saldosDiarios: [
        {
          cuentaId: 'julio-cc',
          fecha: '2026-09-25',
          estado: 'cerrado',
          saldoInicioCentavos: null,
          saldoFinCentavos: 1_000_00,
        },
        {
          cuentaId: 'julio-cc',
          fecha: '2026-09-28',
          estado: 'cerrado',
          saldoInicioCentavos: null,
          saldoFinCentavos: 1_000_00,
        },
      ],
      cierre15Anterior: {
        fechaId: '2026-09-25',
        cuentas: [{ cuentaId: 'patagonia-cc', saldoCentavos: 50_00 }],
      },
      cierre15Dia: {
        cuentas: [{ cuentaId: 'patagonia-cc', saldoCentavos: 50_00 }],
      },
      movimientos: [],
    })

    expect(cashflow.origenSaldos).toBe('cierre15')
    expect(cashflow.saldoInicial?.centavos).toBe(1_050_00)
    expect(cashflow.saldoFinal).toEqual({ estado: 'cerrado', centavos: 1_050_00 })
    expect(cashflow.avisos).toEqual([])
  })
})
