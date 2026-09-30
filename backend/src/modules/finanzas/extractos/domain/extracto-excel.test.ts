import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  centavosAPesos,
  generarExcelExtracto,
  nombreArchivoExtracto,
  serialExcel,
  type ExtractoExcelInput,
} from './extracto-excel.js'
import type { FilaExtractoVista, ResultadoControl } from './extracto.types.js'

function controlLimpio(): ResultadoControl {
  return {
    coincide: true,
    faltanEnBacarnet: [],
    sobranEnBacarnet: [],
    porDia: [
      {
        fecha: '2026-09-01',
        debitosExtractoCentavos: 150_000,
        creditosExtractoCentavos: 50_000,
        debitosBacarnetCentavos: 150_000,
        creditosBacarnetCentavos: 50_000,
        coincide: true,
      },
    ],
    categoriaIdPorFila: [],
  }
}

function base(filas: FilaExtractoVista[], control: ResultadoControl): ExtractoExcelInput {
  return {
    bancoNombre: 'Julio',
    numeroCuenta: '00010101000130345',
    tipoLabel: 'Cuenta corriente',
    desde: '2026-09-01',
    hasta: '2026-09-30',
    descargadoEl: '2026-09-30',
    resumen: {
      saldoInicialCentavos: 1_000_000,
      saldoFinalCentavos: 900_000,
      totalDebitosCentavos: 150_000,
      totalCreditosCentavos: 50_000,
      cantidad: filas.length,
    },
    filas,
    control,
  }
}

const filas: FilaExtractoVista[] = [
  {
    fecha: '2026-09-01',
    concepto: 'Pago de haberes',
    categoria: 'Sueldos',
    tipo: 'debito',
    debitoCentavos: 150_000,
    creditoCentavos: 0,
    saldoCentavos: 850_000,
  },
  {
    fecha: '2026-09-02',
    concepto: 'Cobro cliente',
    categoria: 'Ventas',
    tipo: 'credito',
    debitoCentavos: 0,
    creditoCentavos: 50_000,
    saldoCentavos: 900_000,
  },
]

function libro(buffer: Buffer) {
  return XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: true, cellStyles: true })
}

function celda(sheet: XLSX.WorkSheet, c: number, r: number) {
  return sheet[XLSX.utils.encode_cell({ c, r })] as { t?: string; v?: unknown; z?: string } | undefined
}

function filaDonde(sheet: XLSX.WorkSheet, columna: number, valor: string): number {
  const ref = sheet['!ref']
  if (!ref) throw new Error('la hoja no tiene rango')
  const range = XLSX.utils.decode_range(ref)
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    if (celda(sheet, columna, r)?.v === valor) return r
  }
  throw new Error(`no está «${valor}»`)
}

describe('excel del extracto', () => {
  it('arma el nombre como un extracto del mes', () => {
    expect(nombreArchivoExtracto({ bancoNombre: 'Julio', tipo: 'CC', desde: '2026-09-01', hasta: '2026-09-30' })).toBe(
      'Extracto Julio CC 2026-09.xlsx',
    )
    expect(
      nombreArchivoExtracto({ bancoNombre: 'Córdoba', tipo: 'CC', desde: '2026-08-01', hasta: '2026-09-15' }),
    ).toBe('Extracto Cordoba CC 2026-08-01_2026-09-15.xlsx')
  })

  it('tiene las columnas, los importes como número y la fila de totales', () => {
    const wb = libro(generarExcelExtracto(base(filas, controlLimpio())))
    expect(wb.SheetNames).toEqual(['Extracto'])
    const sheet = wb.Sheets.Extracto
    expect(sheet).toBeTruthy()
    if (!sheet) return

    expect(sheet['!cols']?.map((col) => col.wch)).toEqual([22, 52, 24, 18, 18, 18])
    expect(celda(sheet, 0, 2)?.v).toBe('Banco')
    expect(celda(sheet, 1, 2)?.v).toBe('Julio')
    expect(celda(sheet, 0, 9)?.v).toBe('Fuente')
    expect(celda(sheet, 1, 9)?.v).toBe('extracto oficial vía Interbanking')

    const saldoInicial = celda(sheet, 1, 5)
    expect(saldoInicial?.t).toBe('n')
    expect(saldoInicial?.z).toBe('#,##0.00')
    expect(saldoInicial?.v).toBe(centavosAPesos(1_000_000))

    const encabezado = filaDonde(sheet, 0, 'Fecha')
    expect([0, 1, 2, 3, 4, 5].map((c) => celda(sheet, c, encabezado)?.v)).toEqual([
      'Fecha',
      'Concepto del banco',
      'Categoría',
      'Débito',
      'Crédito',
      'Saldo',
    ])

    const fecha = celda(sheet, 0, encabezado + 1)
    expect(fecha?.t).toBe('n')
    expect(fecha?.z).toBe('dd/mm/yyyy')
    expect(fecha?.v).toBe(serialExcel('2026-09-01'))
    expect(celda(sheet, 1, encabezado + 1)?.v).toBe('Pago de haberes')
    expect(celda(sheet, 2, encabezado + 1)?.v).toBe('Sueldos')

    const debito = celda(sheet, 3, encabezado + 1)
    expect(debito?.t).toBe('n')
    expect(debito?.z).toBe('#,##0.00')
    expect(debito?.v).toBe(1500)
    expect(celda(sheet, 4, encabezado + 1)).toBeUndefined()

    const credito = celda(sheet, 4, encabezado + 2)
    expect(credito?.t).toBe('n')
    expect(credito?.v).toBe(500)

    const totales = filaDonde(sheet, 0, 'Totales')
    expect(celda(sheet, 3, totales)?.t).toBe('n')
    expect(celda(sheet, 3, totales)?.v).toBe(1500)
    expect(celda(sheet, 4, totales)?.v).toBe(500)
    expect(celda(sheet, 5, totales)?.v).toBe(centavosAPesos(900_000))
  })

  it('agrega la hoja Control cuando hay diferencias', () => {
    const control = controlLimpio()
    control.coincide = false
    control.faltanEnBacarnet = [
      { fecha: '2026-09-03', concepto: 'Comisión de cuenta', tipo: 'debito', montoCentavos: 2_500 },
    ]
    const wb = libro(generarExcelExtracto(base(filas, control)))
    expect(wb.SheetNames).toEqual(['Extracto', 'Control'])
    const sheet = wb.Sheets.Control
    expect(sheet).toBeTruthy()
    if (!sheet) return
    const texto = Object.values(sheet)
      .map((cell) => (cell && typeof cell === 'object' && 'v' in cell ? String(cell.v) : ''))
      .join(' ')
    expect(texto).toContain('Estos movimientos están en el extracto del banco y no en BacarNet:')
    expect(texto).toContain('Comisión de cuenta')
  })
})
