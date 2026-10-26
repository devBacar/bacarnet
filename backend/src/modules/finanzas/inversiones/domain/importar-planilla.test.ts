import { describe, expect, it } from 'vitest'
import { generarCronograma } from './cronograma.js'
import {
  capitalNuevoSumaACaja,
  encadenar,
  fechaDeCelda,
  historialDe,
  idInversionImportada,
  interpretar,
  leerCuota,
  leerInversoresDeHoja,
  montoDeCelda,
} from './importar-planilla.js'
import { CONFIG_INVERSIONES_DEFAULT } from './inversion.types.js'

/** Serial de Excel de una fecha (para armar encabezados como los guarda Excel). */
const serial = (ymd: string) => Math.round((Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000)

/** Hoja sintética (nombres y montos inventados). filas: [concepto, deuda, importe, cuota, obs, díaA, díaB] */
function hoja(mes: string, filas: unknown[][]) {
  const [a, m] = mes.split('-')
  return [
    ['COMPROMISOS', null, null, null, null, 1500],
    ['CONCEPTO', 'DEUDA', 'IMPORTE A PAGAR', 'CUOTA', 'OBSERVACION', serial(`${a}-${m}-05`), 'Finde', 'Acumulado', 'Diferencia'],
    ['INVERSORES DOLARES'],
    ...filas.filter((f) => f[7] === 'USD').map((f) => f.slice(0, 7)),
    ['SUBTOTALES INVERSORES USD', null, 1],
    ['INVERSORES PESOS'],
    ...filas.filter((f) => f[7] === 'ARS').map((f) => f.slice(0, 7)),
    ['SUBTOTALES INVERSORES PESOS', null, 1],
    ['PRESTAMOS BANCARIOS'],
    ['Credito X', 100, 10, '1 de 6', 'Debito'],
  ]
}

const meses = [
  hoja('2026-08', [
    ['Gomez Ana', 1000, 100, '9 de 20', 'Acuerdo', 100, null, 'USD'],
    ['Gomez Ana', 500, 50, '1 de 10', 'Pagare', 50, null, 'USD'],
    ['Ruiz', 300, 30, '2 de 5', 'Pagare', 30, null, 'USD'],
    ['Lopez Juan', 10000, 0, '-', 'Mutuo - Cobra 1,5%', null, 150, 'ARS'],
  ]),
  hoja('2026-09', [
    ['Gomez Ana', 900, 100, '10 de 20', 'Acuerdo', 100, null, 'USD'],
    ['Gomez Ana', 450, 50, '2 de 10', 'Pagare', 50, null, 'USD'],
    ['Lopez Juan', 10000, 0, '-', 'Mutuo - Cobra 1,5%', null, 150, 'ARS'],
  ]),
  hoja('2026-10', [
    ['Gomez Ana', 400, 50, '3 de 10', 'Pagare', 50, null, 'USD'],
    ['Gomez Ana', 800, 100, '11 de 20', 'Acuerdo', 100, null, 'USD'],
    ['Ruiz', 200, 50, '1 de 4', 'Pagare', 50, null, 'USD'],
    ['Lopez Juan', 10000, 0, '-', 'Mutuo - Cobra 1,5%', null, 150, 'ARS'],
    ['Perez', 600, 0, '-', 'Mutuo - Capitaliza 1,25', null, null, 'ARS'],
    ['Diaz', 900, 300, '', 'Acuerdo - recibio cheques', 300, null, 'ARS'],
    ['Sin datos', 700, 0, '-', '-', null, null, 'USD'],
  ]),
].map((celdas, i) => leerInversoresDeHoja(celdas, ['Compromisos 08.2026', 'Compromisos 09.2026', 'Compromisos 10.2026'][i]))

describe('lectura de celdas', () => {
  it('fechas, montos y cuotas', () => {
    expect(fechaDeCelda(serial('2026-10-15'))).toBe('2026-10-15')
    expect(fechaDeCelda('05/10/26')).toBe('2026-10-05')
    expect(montoDeCelda('1.234,56')).toBe(1234.56)
    expect(montoDeCelda('Variable')).toBeNull()
    expect(leerCuota('41-42 de 67')).toEqual({ desde: 41, hasta: 42, total: 67 })
    expect(leerCuota('5 y 6 de 18')).toEqual({ desde: 5, hasta: 6, total: 18 })
    expect(leerCuota('14/15/16 de 20')).toEqual({ desde: 14, hasta: 16, total: 20 })
    expect(leerCuota('17 - 18 de 40')).toEqual({ desde: 17, hasta: 18, total: 40 })
    expect(leerCuota('27 de ..')).toEqual({ desde: 27, hasta: 27, total: null })
    expect(leerCuota('-')).toBeNull()
  })

  it('toma solo los grupos de inversores, con moneda, montos en centavos y pagos por día ("Finde" = día siguiente)', () => {
    const oct = meses[2]
    expect(oct.mes).toBe('2026-10')
    expect(oct.filas).toHaveLength(7)
    expect(oct.filas.some((f) => f.concepto === 'Credito X')).toBe(false)
    const lopez = oct.filas.find((f) => f.concepto === 'Lopez Juan')!
    expect(lopez.moneda).toBe('ARS')
    expect(lopez.deudaCentavos).toBe(1_000_000)
    expect(lopez.pagos).toEqual([{ fecha: '2026-10-06', montoCentavos: 15_000 }])
  })
})

describe('historial: seguir cada inversión hacia atrás', () => {
  const cadenas = encadenar(meses)
  const de = (nombre: string, cuota: string) => cadenas.find((c) => c.meses.at(-1)!.concepto === nombre && c.meses.at(-1)!.cuotaTexto === cuota)!

  it('separa dos inversiones con el mismo nombre por la cuota', () => {
    expect(de('Gomez Ana', '11 de 20').meses.map((m) => m.cuotaTexto)).toEqual(['9 de 20', '10 de 20', '11 de 20'])
    expect(de('Gomez Ana', '3 de 10').meses.map((m) => m.cuotaTexto)).toEqual(['1 de 10', '2 de 10', '3 de 10'])
  })

  it('si desaparece un mes y vuelve, es una inversión nueva', () => {
    expect(de('Ruiz', '1 de 4').meses).toHaveLength(1)
  })

  it('capitalNuevoSumaACaja: solo 1 mes y sin importaciones previas del inversor', () => {
    expect(capitalNuevoSumaACaja(de('Ruiz', '1 de 4'), false)).toBe(true)
    expect(capitalNuevoSumaACaja(de('Ruiz', '1 de 4'), true)).toBe(false)
    expect(capitalNuevoSumaACaja(de('Gomez Ana', '11 de 20'), false)).toBe(false)
    expect(capitalNuevoSumaACaja(de('Lopez Juan', '-'), false)).toBe(false)
  })

  it('junta los pagos de todos los meses y arma un id fijo', () => {
    const lopez = de('Lopez Juan', '-')
    expect(historialDe(lopez).map((p) => p.mes)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(idInversionImportada(lopez)).toBe(idInversionImportada(encadenar(meses).find((c) => c.meses.at(-1)!.concepto === 'Lopez Juan')!))
    expect(idInversionImportada(lopez)).toMatch(/^pla-ars-lopez-juan-2026-08-f\d+$/)
  })
})

describe('interpretar cada fila', () => {
  const oct = meses[2].filas
  const fila = (n: string, cuota?: string) => oct.find((f) => f.concepto === n && (cuota === undefined || f.cuotaTexto === cuota))!

  it('"Cobra 1,5%" → paga intereses por mes, sin vencimiento; las cuotas empiezan el mes siguiente', () => {
    const r = interpretar(fila('Lopez Juan'), CONFIG_INVERSIONES_DEFAULT)
    expect(r.errores).toEqual([])
    expect(r.condiciones).toMatchObject({ sistema: 'americano', sinVencimiento: true, tasa: { tnaPct: 18, expresada: 'mensual' } })
    expect(r.texto).toContain('1,5 % por mes')
    const cuotas = generarCronograma(r.condiciones!, {}, null, { hasta: '2026-12-31' })
    expect(cuotas[0].fechaVencimiento).toBe('2026-11-06')
  })

  it('"Capitaliza 1,25" (sin %) → capitaliza sin vencimiento', () => {
    expect(interpretar(fila('Perez'), CONFIG_INVERSIONES_DEFAULT).condiciones).toMatchObject({ sistema: 'capitaliza', sinVencimiento: true })
  })

  it('"3 de 10" → 7 cuotas fijas por la deuda, con 3 ya pagadas', () => {
    const r = interpretar(fila('Gomez Ana', '3 de 10'), CONFIG_INVERSIONES_DEFAULT)
    expect(r.condiciones).toMatchObject({ sistema: 'frances', cantidadCuotas: 7, cuotasPrevias: 3, capitalCentavos: 40_000 })
    expect(r.cuotasPagadas).toBe(3)
  })

  it('importe mensual sin "k de N" → cuotas iguales hasta cubrir la deuda (con aviso) y devolución en cheque', () => {
    const r = interpretar(fila('Diaz'), CONFIG_INVERSIONES_DEFAULT)
    expect(r.condiciones).toMatchObject({ cantidadCuotas: 3, mediosDevolucion: ['cheque'] })
    expect(r.avisos[0]).toContain('no dice cuántas cuotas')
  })

  it('sin importe ni tasa → no se puede deducir: hay que cargarla a mano', () => {
    const r = interpretar(fila('Sin datos'), CONFIG_INVERSIONES_DEFAULT)
    expect(r.condiciones).toBeNull()
    expect(r.errores[0]).toContain('cargarla a mano')
  })
})
