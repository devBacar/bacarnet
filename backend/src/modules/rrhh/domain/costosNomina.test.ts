import { describe, expect, it } from 'vitest'
import { AREA_AGRUPADA, construirCostosNomina } from './costosNomina.js'
import type { MesPersona, ResultadoResumen, ResumenPersona } from './resumenMensual.js'

const vacio = { hs: 0, monto: 0 }
function mes(cc: number, rem: number, empresa = 1): MesPersona {
  return {
    cc,
    empresa,
    horas: { he50: { hs: 10, monto: 50_000 }, he100: vacio, fer: vacio, noct: vacio, comp: vacio, jornal: vacio },
    totales: { rem, norem: 100_000, contrib: rem * 0.25, prov: rem * 0.1, costo: 0, desc: rem * 0.2, neto: rem * 0.8 + 100_000, adelantos: 10_000 },
    ausencias: {},
    horasNormales: 190,
  }
}
function persona(legajo: number, esquema: number, cc: number, empresa = 1): ResumenPersona {
  return {
    legajo,
    nombre: `P${legajo}`,
    cc,
    seccion: 0,
    puesto: 0,
    esquemaLiquidacion: esquema,
    fechaIngreso: null,
    fechaEgreso: null,
    vacaciones: [],
    meses: { '202609': mes(cc, 1_000_000 * legajo, empresa) },
  }
}

describe('costos de personal', () => {
  const personas = [persona(1, 6, 17), persona(2, 6, 17), persona(3, 6, 17), persona(4, 5, 13, 2)]
  const r: ResultadoResumen = {
    meses: ['202609'],
    ultimoMes: '202609',
    centrosCosto: [
      { mes: '202609', cc: 17, dotacion: 3 } as ResultadoResumen['centrosCosto'][number],
      { mes: '202609', cc: 13, dotacion: 1 } as ResultadoResumen['centrosCosto'][number],
    ],
    personas,
    feriadosPorMes: {},
    catalogos: {
      empresas: { 1: 'BACAR', 2: 'FILMEC' },
      centrosCosto: {},
      secciones: {},
      puestos: {},
      esquemasLiquidacion: { 5: 'Choferes de Camiones (40/89)', 6: 'Suvico' },
      tiposAusencia: {},
    },
    anomalias: [],
  }
  const c = construirCostosNomina(r)

  it('suma los recibos por área, empresa y convenio', () => {
    const suvico = c.filas.find((f) => f.convenio === 'suvico')!
    expect(suvico).toMatchObject({ cc: 17, empresa: 1, personas: 3, rem: 6_000_000, neto: 6_000_000 * 0.8 + 300_000, adelantos: 30_000, extras: 150_000 })
    expect(c.empresas).toEqual([{ id: 1, nombre: 'BACAR' }, { id: 2, nombre: 'FILMEC' }])
  })

  it('las áreas con menos de 3 personas van juntas, para no mostrar sueldos individuales', () => {
    const chica = c.filas.find((f) => f.convenio === 'camioneros')!
    expect(chica.cc).toBe(AREA_AGRUPADA)
    expect(chica.empresa).toBe(2)
  })
})
