import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { construirIndicadores } from './indicadores.js'
import { construirPersonal, personasIndicadoresUltimoCierre, type PersonalAgregado } from './personal.js'
import { leerDumpMysql } from './sqlDumpParser.js'
import { AcumuladorSalario, type MesPersona, type ResultadoResumen, type ResumenPersona } from './resumenMensual.js'

const MUESTRA = join(__dirname, '__fixtures__', 'salario-muestra.sql')

function mes(cc: number): MesPersona {
  return {
    cc,
    horas: {
      he50: { hs: 0, monto: 0 },
      he100: { hs: 0, monto: 0 },
      fer: { hs: 0, monto: 0 },
      noct: { hs: 0, monto: 0 },
      comp: { hs: 0, monto: 0 },
      jornal: { hs: 0, monto: 0 },
    },
    totales: { rem: 0, norem: 0, contrib: 0, prov: 0, costo: 0, desc: 0, neto: 0, adelantos: 0 },
    ausencias: {},
    horasNormales: 0,
    dias: 30,
  }
}

function persona(parcial: Partial<ResumenPersona> & { legajo: number }): ResumenPersona {
  return {
    nombre: `PERSONA ${parcial.legajo}`,
    cc: 10,
    seccion: 0,
    puesto: 0,
    esquemaLiquidacion: 1,
    fechaIngreso: '2015-01-01',
    fechaEgreso: null,
    sexo: 'M',
    estadoCivil: 2,
    estudio: 4,
    contrato: 1,
    jornadaParcial: false,
    meses: { '202609': mes(parcial.cc ?? 10) },
    vacaciones: [],
    ...parcial,
  }
}

function resultado(personas: ResumenPersona[], extra: Partial<ResultadoResumen> = {}): ResultadoResumen {
  return {
    meses: ['202608', '202609'],
    ultimoMes: '202609',
    centrosCosto: [],
    personas,
    feriadosPorMes: {},
    catalogos: {
      centrosCosto: { 10: 'PLANTA', 99: 'OFICINA CHICA' },
      secciones: {},
      puestos: {},
      esquemasLiquidacion: { 1: 'Suvico', 2: 'Fuera de convenio', 3: 'Bancarios' },
      tiposAusencia: {},
      estudios: { 4: 'Titulo secundario' },
      contratos: { 1: 'Tiempo indeterminado' },
      estadosCiviles: { 2: 'Casado' },
    },
    anomalias: [],
    ...extra,
  }
}

const nombre = (cc: number) => (cc === 99 ? 'Oficina chica' : 'Planta')

describe('personal: población igual a Indicadores', () => {
  it('en la muestra coincide con Toda la empresa · Personas del último mes', async () => {
    const acc = new AcumuladorSalario({ mesesHistoria: 24, anioDesde: 2025, vacacionesDesde: '2025-01-01' })
    await leerDumpMysql(createReadStream(MUESTRA), { quiereTabla: acc.quiereTabla, onFila: acc.onFila })
    const r = acc.resultado()
    const personal = construirPersonal(r, (cc) => r.catalogos.centrosCosto[cc] ?? `Área ${cc}`)
    const { indicadores } = construirIndicadores(r, () => '')
    const mes = r.ultimoMes!
    const todaLaEmpresa = indicadores.filas.filter((f) => f.mes === mes).reduce((s, f) => s + f.personas, 0)
    expect(personal.agregado.dotacion).toBe(todaLaEmpresa)
    expect(personal.agregado.dotacion).toBe(personasIndicadoresUltimoCierre(r, () => ''))
    expect(personal.detalle.personas.some((p) => p.legajo === 2 || p.legajo === 9)).toBe(false)
    expect(personal.detalle.personas.map((p) => p.legajo).sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 6, 7, 8])
  })

  it('si un convenio cerró antes, cuenta el último mes de ese convenio', () => {
    const atrasado = persona({
      legajo: 50,
      nombre: 'ATRASADO',
      esquemaLiquidacion: 3,
      meses: { '202608': mes(10) },
    })
    const actual = persona({ legajo: 1, meses: { '202609': mes(10) } })
    const r = resultado([actual, atrasado])
    const personal = construirPersonal(r, nombre)
    expect(personal.agregado.dotacion).toBe(2)
    expect(personal.agregado.dotacion).toBe(personasIndicadoresUltimoCierre(r, nombre))
    expect(personal.agregado.porConvenio.find((c) => c.id === 'bancarios')?.mes).toBe('202608')
  })
})

describe('personal: rangos, jubilación y aniversarios', () => {
  const fichas: ResumenPersona[] = [
    persona({ legajo: 1, fecNac: '2005-01-01', fechaIngreso: '2026-03-01', sexo: 'M', estudio: 0, jornadaParcial: true }),
    persona({ legajo: 2, fecNac: '1996-01-01', fechaIngreso: '2022-01-01', sexo: 'M', estudio: 0 }),
    persona({ legajo: 3, fecNac: '1984-01-01', fechaIngreso: '2018-01-01', sexo: 'M' }),
    persona({ legajo: 4, fecNac: '1974-01-01', fechaIngreso: '2010-01-01', sexo: 'M' }),
    persona({ legajo: 5, fecNac: '1964-01-01', fechaIngreso: '1999-01-01', sexo: 'F' }),
    persona({ legajo: 6, fecNac: '1958-01-01', fechaIngreso: null, sexo: 'M' }),
    persona({ legajo: 7, nombre: 'CUMPLE DIEZ', fecNac: null, fechaIngreso: '2016-10-15', sexo: 'F' }),
    persona({ legajo: 8, fecNac: '2012-01-01', sexo: 'M' }),
    persona({ legajo: 9, fecNac: '1930-01-01', sexo: 'M' }),
    persona({ legajo: 10, fecNac: '1968-01-01', sexo: 'F' }),
    persona({ legajo: 11, fecNac: '1963-01-01', sexo: 'M' }),
  ]
  const { agregado, detalle } = construirPersonal(
    resultado(fichas, {
      familiares: [
        { legajo: 1, relacion: 2, fecNac: '2015-05-01', discapacidad: false },
        { legajo: 1, relacion: 2, fecNac: '2024-01-01', discapacidad: false },
        { legajo: 2, relacion: 1, fecNac: '1996-01-01', discapacidad: false },
      ],
    }),
    nombre,
  )

  function rango(lista: PersonalAgregado['rangosEdad'], id: string): number {
    return lista.find((r) => r.id === id)?.cantidad ?? -1
  }

  it('clasifica edad y antigüedad, con Sin dato', () => {
    expect(agregado.dotacion).toBe(11)
    expect(rango(agregado.rangosEdad, 'menos25')).toBe(1)
    expect(rango(agregado.rangosEdad, '25a34')).toBe(1)
    expect(rango(agregado.rangosEdad, '35a44')).toBe(1)
    expect(rango(agregado.rangosEdad, '45a54')).toBe(1)
    expect(rango(agregado.rangosEdad, '55a64')).toBe(3)
    expect(rango(agregado.rangosEdad, '65mas')).toBe(1)
    expect(rango(agregado.rangosEdad, 'sinDato')).toBe(3)
    expect(rango(agregado.rangosAntiguedad, 'menos1')).toBe(1)
    expect(rango(agregado.rangosAntiguedad, '1a5')).toBe(1)
    expect(rango(agregado.rangosAntiguedad, '5a10')).toBe(2)
    expect(rango(agregado.rangosAntiguedad, '10a20')).toBe(5)
    expect(rango(agregado.rangosAntiguedad, 'mas20')).toBe(1)
    expect(rango(agregado.rangosAntiguedad, 'sinDato')).toBe(1)
    expect(agregado.estudios.some((e) => e.nombre === 'Sin dato' && e.cantidad === 2)).toBe(true)
    expect(agregado.calidad.estudios).toBeCloseTo(9 / 11, 3)
    expect(agregado.jornadaParcial).toBe(1)
  })

  it('cuenta quién ya se jubila, quién llega en 2 años y los aniversarios', () => {
    expect(agregado.enEdadDeJubilarse).toBe(2)
    expect(agregado.jubilacionProximos2Anios).toBe(2)
    expect(agregado.aniversarios.mes).toBe('202610')
    expect(agregado.aniversarios.cantidad).toBe(1)
    expect(agregado.aniversarios.porAnios.find((a) => a.anios === 10)?.cantidad).toBe(1)
    expect(JSON.stringify(agregado)).not.toContain('CUMPLE DIEZ')
    expect(detalle.aniversarios).toEqual([expect.objectContaining({ nombre: 'CUMPLE DIEZ', anios: 10, legajo: 7 })])
  })

  it('cuenta hijos cargados y la edad escolar', () => {
    expect(agregado.familia.personasConHijos).toBe(1)
    expect(agregado.familia.totalHijos).toBe(2)
    expect(agregado.familia.hijosEdadEscolar).toBe(1)
    expect(agregado.familia.familiaresConDiscapacidad).toBe(0)
  })
})

describe('personal: privacidad de celdas chicas', () => {
  const r = resultado(
    [
      persona({ legajo: 1, nombre: 'EMPLEADA UNO', cc: 99, sexo: 'F', esquemaLiquidacion: 2, meses: { '202609': mes(99) } }),
      persona({ legajo: 2, nombre: 'EMPLEADA DOS', cc: 99, sexo: 'F', esquemaLiquidacion: 2, meses: { '202609': mes(99) } }),
    ],
    {
      familiares: [{ legajo: 1, relacion: 2, fecNac: '2014-01-01', discapacidad: true }],
    },
  )
  const { agregado, detalle } = construirPersonal(r, nombre)

  it('muestra menos de 3 en sexo y discapacidad por área o convenio', () => {
    const area = agregado.porArea[0]
    expect(area.personas).toBe(2)
    expect(area.pctMujeres).toBe('menos de 3')
    expect(area.discapacidad).toBe('menos de 3')
    expect(agregado.porConvenio[0].pctMujeres).toBe('menos de 3')
    expect(agregado.porConvenio[0].discapacidad).toBe('menos de 3')
    const textoAgregado = JSON.stringify(agregado)
    expect(textoAgregado).not.toContain('HIJO SECRETO')
    expect(textoAgregado).not.toContain('"legajo"')
    expect(detalle.personas.map((p) => p.nombre).sort()).toEqual(['EMPLEADA DOS', 'EMPLEADA UNO'])
    expect(JSON.stringify(detalle)).not.toContain('HIJO SECRETO')
    expect(Object.keys(r.familiares?.[0] ?? {}).sort()).toEqual(['discapacidad', 'fecNac', 'legajo', 'relacion'])
  })
})
