import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { leerDumpMysql } from './sqlDumpParser.js'
import { AcumuladorSalario, sumarMeses, type ResultadoResumen } from './resumenMensual.js'

const MUESTRA = join(__dirname, '__fixtures__', 'salario-muestra.sql')

async function resumirMuestra(): Promise<{ r: ResultadoResumen; filas: Record<string, number> }> {
  const acc = new AcumuladorSalario({ mesesHistoria: 24, anioDesde: 2025, vacacionesDesde: '2025-06-01' })
  const lectura = await leerDumpMysql(createReadStream(MUESTRA), {
    quiereTabla: acc.quiereTabla,
    onFila: acc.onFila,
  })
  return { r: acc.resultado(), filas: lectura.filasPorTabla }
}

describe('sumarMeses', () => {
  it('cruza años en ambos sentidos', () => {
    expect(sumarMeses('202601', -1)).toBe('202512')
    expect(sumarMeses('202609', -23)).toBe('202410')
    expect(sumarMeses('202612', 1)).toBe('202701')
  })
})

describe('AcumuladorSalario con la muestra ficticia', () => {
  it('lee solo las tablas necesarias y los años pedidos', async () => {
    const { filas } = await resumirMuestra()
    expect(filas).toEqual({ empleado: 3, liq2026: 19, tablas: 7, vac: 3 })
  })

  it('arma el resumen por centro de costo y mes', async () => {
    const { r } = await resumirMuestra()
    expect(r.meses).toEqual(['202608', '202609'])
    expect(r.ultimoMes).toBe('202609')

    const seg = r.centrosCosto.find((c) => c.mes === '202608' && c.cc === 17)!
    // El legajo 2 tiene una fila con CCOSTO 12: cuenta en el mayor (17).
    expect(seg.dotacion).toBe(2)
    expect(seg.conHorasExtra).toBe(1)
    expect(seg.horas.he50).toEqual({ hs: 10, monto: 15000 })
    expect(seg.horas.he100).toEqual({ hs: 4, monto: 8000 })
    expect(seg.horas.fer).toEqual({ hs: 8, monto: 12000 })
    expect(seg.totales.rem).toBe(1900000)
    expect(seg.ausencias).toEqual({ Enfermedad: 2, Vacaciones: 14 })

    const pv = r.centrosCosto.find((c) => c.mes === '202608' && c.cc === 16)!
    // AHE100 con cantidad = importe: se descartan las horas y queda el importe.
    expect(pv.horas.he100).toEqual({ hs: 50, monto: 105000 })
    expect(pv.horas.noct).toEqual({ hs: 20, monto: 9000 })

    const sep = r.centrosCosto.filter((c) => c.mes === '202609')
    expect(sep.find((c) => c.cc === 17)!.horas.he50).toEqual({ hs: 8, monto: 12000 })
    // Más de 400 horas en el mes: dato mal cargado.
    const pvSep = sep.find((c) => c.cc === 16)!
    expect(pvSep.horas.he100).toEqual({ hs: 0, monto: 900000 })
    expect(pvSep.conHorasExtra).toBe(0)
  })

  it('ignora la liquidación informativa (tipo 9) y registra las anomalías', async () => {
    const { r } = await resumirMuestra()
    const total50 = r.centrosCosto.reduce((s, c) => s + c.horas.he50.hs, 0)
    expect(total50).toBe(18)
    expect(r.anomalias.map((a) => `${a.mes}-${a.legajo}-${a.concepto}`).sort()).toEqual([
      '202608-3-AHE100',
      '202609-3-HEX100',
    ])
  })

  it('cuenta los feriados del mes con FERIAD', async () => {
    const { r } = await resumirMuestra()
    expect(r.feriadosPorMes).toEqual({ '202608': 1, '202609': 0 })
  })

  it('arma la ficha por persona con su último centro de costo y vacaciones desde la fecha de corte', async () => {
    const { r } = await resumirMuestra()
    expect(r.personas.map((p) => p.legajo)).toEqual([1, 2, 3])
    const dos = r.personas.find((p) => p.legajo === 2)!
    expect(dos.nombre).toBe('PERSONA O\'DOS, "PRUEBA"')
    expect(dos.meses['202608'].ausencias).toEqual({ Vacaciones: 14 })
    expect(dos.vacaciones).toEqual([{ desde: '2026-08-03', hasta: '2026-08-16', dias: 14, anio: 2025 }])

    const uno = r.personas.find((p) => p.legajo === 1)!
    expect(uno.fechaIngreso).toBe('2015-03-01')
    expect(uno.fechaEgreso).toBeNull()
    expect(uno.vacaciones).toEqual([{ desde: '2026-11-02', hasta: '2026-11-15', dias: 14, anio: 2026 }])

    const tres = r.personas.find((p) => p.legajo === 3)!
    expect(tres.cc).toBe(16)
    expect(tres.fechaIngreso).toBe('2012-02-01')
    expect(tres.fechaEgreso).toBe('2026-09-30')
  })

  it('carga los catálogos de códigos', async () => {
    const { r } = await resumirMuestra()
    expect(r.catalogos.centrosCosto).toEqual({ 16: 'PROTECCION DE VALORES', 17: 'SERVICIO DE SEGURIDAD PRIVADA' })
    expect(r.catalogos.esquemasLiquidacion).toEqual({ 6: 'Suvico' })
    expect(r.catalogos.tiposAusencia).toEqual({ 3: 'Enfermedad' })
  })
})
