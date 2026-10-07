import { describe, expect, it } from 'vitest'
import { ventanaLiquidacion } from './convenios.js'
import { construirIndicadores, episodiosDeLicencia, grupoAusencia, motivoBaja } from './indicadores.js'
import { AcumuladorSalario } from './resumenMensual.js'

describe('corte de liquidación', () => {
  it('SUVICO y Camioneros van del 26 al 25; el resto, mes calendario', () => {
    expect(ventanaLiquidacion('202609', 'suvico')).toEqual({ desde: '2026-08-26', hasta: '2026-09-25' })
    expect(ventanaLiquidacion('202601', 'camioneros')).toEqual({ desde: '2025-12-26', hasta: '2026-01-25' })
    expect(ventanaLiquidacion('202602', 'comercio')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(ventanaLiquidacion('202609', 'fuera')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
  })
})

describe('clasificaciones', () => {
  it('agrupa las ausencias y los motivos de baja', () => {
    expect(grupoAusencia('Vacaciones')).toBeNull()
    expect(grupoAusencia('Accidente ART')).toBe('accidentes')
    expect(grupoAusencia('No trabajados')).toBe('injustificadas')
    expect(grupoAusencia('Matrimonio')).toBe('especiales')
    expect(motivoBaja('Renuncia del trabajador / ART.240 - LCT')).toBe('renuncia')
    expect(motivoBaja('Despido / ART. 245 - LCT')).toBe('despido')
    expect(motivoBaja('Vencimiento de contrato a plazo fijo o determinado')).toBe('finContrato')
    expect(motivoBaja('Voluntad concurrente de las partes - ART.241 - LCT')).toBe('acuerdo')
    expect(motivoBaja('Baja por fallecimiento')).toBe('otras')
  })

  it('une los registros seguidos de una misma licencia', () => {
    const ep = episodiosDeLicencia(
      [
        { legajo: 1, desde: '2026-08-01', hasta: '2026-08-31', dias: 31, tipo: 14 },
        { legajo: 1, desde: '2026-09-01', hasta: '2026-09-30', dias: 30, tipo: 14 },
        { legajo: 1, desde: '2026-09-10', hasta: '2026-09-11', dias: 2, tipo: 3 },
      ],
      (t) => (t === 14 ? 'Reserva de Puesto' : t === 3 ? 'Enfermedad' : undefined),
    )
    expect(ep).toEqual([
      { legajo: 1, tipo: 'reserva', desde: '2026-08-01', hasta: '2026-09-30' },
      { legajo: 1, tipo: 'enfermedad', desde: '2026-09-10', hasta: '2026-09-11' },
    ])
  })
})

describe('construirIndicadores', () => {
  const fila = (legajo: number, concepto: string, monto: number) => ({
    LEGAJO: String(legajo),
    MES: '202609',
    TIPOLIQ: '3',
    CONCEPTO: concepto,
    CANT: '0',
    MONTO: String(monto),
    CCOSTO: '17',
  })
  const acc = new AcumuladorSalario({ mesesHistoria: 12, anioDesde: 2026 })
  acc.onFila('tablas', { COTAB: '17', CODIGO: '6', DESCR: 'Suvico' })
  acc.onFila('tablas', { COTAB: '17', CODIGO: '3', DESCR: 'Comercio' })
  acc.onFila('tablas', { COTAB: '30', CODIGO: '3', DESCR: 'Enfermedad' })
  acc.onFila('tablas', { COTAB: '27', CODIGO: '21', DESCR: 'Renuncia del trabajador' })
  acc.onFila('empleado', { LEGAJO: '1', NOMBRE: 'UNO', CCOSTO: '17', ESQLIQ: '6', FECEGR: '2500-01-01' })
  acc.onFila('empleado', { LEGAJO: '2', NOMBRE: 'DOS', CCOSTO: '17', ESQLIQ: '6', FECEGR: '2026-08-28', MOTEGR: '21' })
  acc.onFila('empleado', { LEGAJO: '3', NOMBRE: 'TRES', CCOSTO: '17', ESQLIQ: '3', FECEGR: '2500-01-01' })
  acc.onFila('liq2026', fila(1, 'DSTRAB', 30))
  acc.onFila('liq2026', fila(1, 'DSENFE', 3))
  acc.onFila('liq2026', fila(2, 'DSTRAB', 3))
  acc.onFila('liq2026', fila(3, 'DSTRAB', 30))
  // Enfermedad del legajo 1 el 27/08: para SUVICO cae en septiembre (26/08 al 25/09).
  acc.onFila('asist', { LEGAJO: '1', FECINI: '2026-08-27', FECFIN: '2026-08-29', DIAS: '3', TIPO: '3' })
  // Alta el 1/07 y renuncia el 28/08: baja temprana de septiembre (SUVICO).
  acc.onFila('ingegr', { LEGAJO: '2', FECING: '2026-07-01', FECEGR: '2026-08-28' })
  // Comercio: alta el 28/08 cae en agosto (mes calendario), fuera del período liquidado.
  acc.onFila('ingegr', { LEGAJO: '3', FECING: '2026-08-28', FECEGR: '2500-01-01' })
  // Alta anulada (baja el mismo día): no cuenta.
  acc.onFila('ingegr', { LEGAJO: '1', FECING: '2026-09-02', FECEGR: '2026-09-02' })
  const { indicadores, detalle } = construirIndicadores(acc.resultado(), () => 'Seguridad Privada')

  it('cuenta ausencias, avisos de enfermedad y bajas con el corte de cada convenio', () => {
    const suvico = indicadores.filas.find((f) => f.convenio === 'suvico')!
    expect(suvico).toMatchObject({ personas: 2, diasLiquidados: 33, personasEnfermedad: 1, altas: 0, bajas: 1, bajasTempranas: 1 })
    expect(suvico.dias.enfermedad).toBe(3)
    expect(suvico.episodios).toEqual({ corta: 1, media: 0, larga: 0 })
    expect(suvico.bajasPorMotivo.renuncia).toBe(1)
    const comercio = indicadores.filas.find((f) => f.convenio === 'comercio')!
    expect(comercio.altas).toBe(0)
    expect(detalle.bajasTempranas).toMatchObject([{ legajo: 2, diasTrabajados: 59, motivo: 'renuncia' }])
  })
})
