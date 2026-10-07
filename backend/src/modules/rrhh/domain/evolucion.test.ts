import { describe, expect, it } from 'vitest'
import { construirEvolucion, unidadDeArea } from './evolucion.js'
import { AcumuladorSalario, type HorasPorGrupo, type ResultadoResumen } from './resumenMensual.js'

function horas(he50 = 0, he100 = 0, fer = 0): HorasPorGrupo {
  return {
    he50: { hs: he50, monto: he50 * 10_000 },
    he100: { hs: he100, monto: he100 * 13_000 },
    fer: { hs: fer, monto: fer * 6_000 },
    noct: { hs: 0, monto: 0 },
    comp: { hs: 0, monto: 0 },
    jornal: { hs: 0, monto: 0 },
  }
}

describe('unidad de negocio', () => {
  it('agrupa los centros de costo de Salario por servicio', () => {
    expect(unidadDeArea('SERVICIO DE SEGURIDAD PRIVADA - Personal Permanente')).toBe('seguridad')
    expect(unidadDeArea('SERVICIO DE SEGURIDAD PRIVADA - Eventuales Bacar')).toBe('seguridad')
    expect(unidadDeArea('SEGURIDAD PLANTA')).toBe('seguridad')
    expect(unidadDeArea('PROTECCION DE VALORES')).toBe('caudales')
    expect(unidadDeArea('SERVICIOS DE TESORERIA TERCERIZADOS')).toBe('tesoreria')
    expect(unidadDeArea('CAJEROS')).toBe('tesoreria')
    expect(unidadDeArea('GRUAS')).toBe('gruas')
    expect(unidadDeArea('CAPITAL HUMANO')).toBe('estructura')
  })
})

describe('horas normales trabajadas', () => {
  const fila = (legajo: number, concepto: string, cant: number, monto: number) => ({
    LEGAJO: String(legajo),
    MES: '202609',
    TIPOLIQ: '3',
    CONCEPTO: concepto,
    CANT: String(cant),
    MONTO: String(monto),
    CCOSTO: '17',
  })

  it('son los días presentes por la jornada del convenio, o las horas de jornal', () => {
    const acc = new AcumuladorSalario({ mesesHistoria: 12, anioDesde: 2026 })
    acc.onFila('tablas', { COTAB: '17', CODIGO: '6', DESCR: 'Suvico' })
    acc.onFila('empleado', { LEGAJO: '1', NOMBRE: 'UNO', CCOSTO: '17', ESQLIQ: '6' })
    acc.onFila('empleado', { LEGAJO: '2', NOMBRE: 'DOS', CCOSTO: '17', ESQLIQ: '6' })
    // Legajo 1: mes completo con 10 días de vacaciones y 2 de enfermedad → 18 días × 204 h / 30.
    acc.onFila('liq2026', fila(1, 'DSTRAB', 0, 30))
    acc.onFila('liq2026', fila(1, 'DSVAME', 0, 10))
    acc.onFila('liq2026', fila(1, 'DSENFE', 0, 2))
    acc.onFila('liq2026', fila(1, 'HEX050', 5, 50_000))
    // Legajo 2: eventual por hora → 28 h de jornal.
    acc.onFila('liq2026', fila(2, 'DSTRAB', 0, 30))
    acc.onFila('liq2026', fila(2, 'HSTRAB', 28, 140_000))
    const r = acc.resultado()
    const uno = r.personas.find((p) => p.legajo === 1)!.meses['202609']
    expect(uno.horasNormales).toBeCloseTo((18 * 204) / 30, 1)
    expect(r.personas.find((p) => p.legajo === 2)!.meses['202609'].horasNormales).toBe(28)
    expect(r.centrosCosto[0].horasNormales).toBeCloseTo((18 * 204) / 30 + 28, 1)
  })
})

describe('construirEvolucion', () => {
  const r: ResultadoResumen = {
    meses: ['202608', '202609'],
    ultimoMes: '202609',
    centrosCosto: ['202608', '202609'].flatMap((mes) => [
      {
        mes,
        cc: 16,
        dotacion: 2,
        conHorasExtra: 1,
        horas: horas(10, 30),
        totales: { rem: 0, norem: 0, contrib: 0, prov: 0, costo: 0, desc: 0, neto: 0, adelantos: 0 },
        ausencias: { Vacaciones: 5, Enfermedad: 1 },
        horasNormales: 340,
      },
    ]),
    personas: [
      {
        legajo: 1,
        nombre: 'UNO',
        cc: 16,
        seccion: 0,
        puesto: 0,
        esquemaLiquidacion: 5,
        fechaIngreso: null,
        fechaEgreso: null,
        vacaciones: [],
        meses: Object.fromEntries(
          ['202608', '202609'].map((mes) => [
            mes,
            {
              cc: 16,
              horas: horas(10, 30),
              totales: { rem: 0, norem: 0, contrib: 0, prov: 0, costo: 0, desc: 0, neto: 0, adelantos: 0 },
              ausencias: { Vacaciones: 5, Enfermedad: 1 },
              horasNormales: 150,
            },
          ]),
        ),
      },
    ],
    feriadosPorMes: {},
    catalogos: { centrosCosto: { 16: 'PROTECCION DE VALORES' }, secciones: {}, puestos: {}, esquemasLiquidacion: { 5: 'Choferes de Camiones (40/89)' }, tiposAusencia: {} },
    anomalias: [],
  }
  const e = construirEvolucion(r, [], 1.5, () => 'Protección de Valores', () => ({ horas: 0, monto: 0 }))

  it('arma una fila por área y mes con el costo empresa', () => {
    expect(e.filas).toHaveLength(2)
    expect(e.filas[0]).toMatchObject({ mes: '202608', cc: 16, horasNormales: 340, he50: 10, he100: 30, mas30: 1, diasVacaciones: 5, diasLicencia: 1 })
    expect(e.filas[0].costoExtra).toBe((10 * 10_000 + 30 * 13_000) * 1.5)
    expect(e.areas).toEqual([{ cc: 16, nombre: 'Protección de Valores', unidad: 'caudales' }])
  })

  it('suma las horas trabajadas por convenio', () => {
    expect(e.porConvenio.find((f) => f.mes === '202609')).toMatchObject({ convenio: 'camioneros', personas: 1, horasNormales: 150, horasExtra: 40 })
    expect(e.convenios.map((c) => c.id)).toEqual(['camioneros'])
  })
})
