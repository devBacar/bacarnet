import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { compararViejos, medirMarcasManuales, medirVinculoAutomatico } from './medir-aciertos.js'

function doc(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '',
    beneficiario: 'MANA',
    beneficiarioNormalizado: 'mana',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 0,
    fechaVencimiento: null,
    fechaEmision: null,
    estadoCodigo: null,
    estado: '',
    pagado: false,
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    esRenovacion: false,
    renovacionDe: [],
    renovadoPor: [],
    operacionUsd: null,
    tasaExplicita: null,
    rolEnOperacion: null,
    obsOriginal: '',
    revisar: [],
    fechaConciliado: null,
    proveedorFinancieroId: null,
    vientriId: 0,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

const marcaUsd = (fecha: string) => ({ tipo: 'usd' as const, uid: 'u1', fecha })

describe('medirMarcasManuales', () => {
  it('la primera marca no tenía propuesta; la siguiente con el mismo formato de OBS sí', () => {
    const docs = [
      doc({ numeroCheque: '1', obsOriginal: '65000 TC1435', operacionUsd: { montoUsd: 65000, cotizacion: 1435 }, clasificacionManual: marcaUsd('2026-10-01T10:00:00.000Z') }),
      doc({ numeroCheque: '2', obsOriginal: '30000 TC1440', operacionUsd: { montoUsd: 30000, cotizacion: 1440 }, clasificacionManual: marcaUsd('2026-10-02T10:00:00.000Z') }),
    ]
    const m = medirMarcasManuales(docs)
    expect(m.marcas.map((x) => [x.numeroCheque, x.porPatron, x.confirmacionesPrevias])).toEqual([
      ['1', 'sin_propuesta', 0],
      ['2', 'acierto', 1],
    ])
    expect(m.porPatron).toMatchObject({ acierto: 1, sin_propuesta: 1, total: 2 })
    expect(m.porConfirmaciones['1']).toMatchObject({ acierto: 1, total: 1 })
    // Leyendo el OBS directo (sin aprender) las dos salían bien.
    expect(m.porLecturaDirecta).toMatchObject({ acierto: 2, total: 2 })
  })

  it('las cuotas marcadas juntas cuentan como una sola confirmación', () => {
    const fecha = '2026-10-01T10:00:00.000Z'
    const docs = [
      doc({ numeroCheque: '1', obsOriginal: '65000 TC1435', operacionUsd: { montoUsd: 65000, cotizacion: 1435 }, clasificacionManual: marcaUsd(fecha) }),
      doc({ numeroCheque: '2', obsOriginal: '65000 TC1435', operacionUsd: { montoUsd: 65000, cotizacion: 1435 }, clasificacionManual: marcaUsd(fecha) }),
      doc({ numeroCheque: '3', obsOriginal: '10000 TC1500', operacionUsd: { montoUsd: 10000, cotizacion: 1500 }, clasificacionManual: marcaUsd('2026-10-05T10:00:00.000Z') }),
    ]
    const m = medirMarcasManuales(docs)
    expect(m.marcas.find((x) => x.numeroCheque === '3')).toMatchObject({ porPatron: 'acierto', confirmacionesPrevias: 1 })
    expect(m.porPatron).toMatchObject({ acierto: 1, sin_propuesta: 2 })
  })

  it('avisa cuando Finanzas cargó otro dato que el que se proponía', () => {
    const docs = [
      doc({ numeroCheque: '1', obsOriginal: '65000 TC1435', operacionUsd: { montoUsd: 65000, cotizacion: 1435 }, clasificacionManual: marcaUsd('2026-10-01T10:00:00.000Z') }),
      // El OBS dice 1440 pero se cargó 1450 a mano.
      doc({ numeroCheque: '2', obsOriginal: '30000 TC1440', operacionUsd: { montoUsd: 30000, cotizacion: 1450 }, clasificacionManual: marcaUsd('2026-10-02T10:00:00.000Z') }),
    ]
    const m = medirMarcasManuales(docs)
    expect(m.marcas[1]).toMatchObject({ porPatron: 'dato_distinto', porLecturaDirecta: 'dato_distinto' })
  })

  it('renovación marcada a mano: compara los números de cheque sin importar el banco', () => {
    const docs = [
      doc({
        numeroCheque: '9',
        obsOriginal: 'cambio 39585299/300',
        esRenovacion: true,
        renovacionDe: ['020-923-5000-39585299', '39585300'],
        clasificacionManual: { tipo: 'renovacion', uid: 'u1', fecha: '2026-10-01T10:00:00.000Z' },
      }),
    ]
    const m = medirMarcasManuales(docs)
    expect(m.marcas[0]).toMatchObject({ porPatron: 'sin_propuesta', porLecturaDirecta: 'acierto' })
  })

  it('ignora cheques sin marca y dados de baja', () => {
    const m = medirMarcasManuales([
      doc({ numeroCheque: '1', obsOriginal: 'x' }),
      doc({ numeroCheque: '2', baja: true, operacionUsd: { montoUsd: 1, cotizacion: 1 }, clasificacionManual: marcaUsd('2026-10-01T10:00:00.000Z') }),
    ])
    expect(m.porPatron.total).toBe(0)
  })
})

describe('compararViejos', () => {
  it('distingue igual, parcial, equivocado y sin vínculo', () => {
    expect(compararViejos(['020-1-2-111', '222'], ['222', '111'])).toBe('igual')
    expect(compararViejos(['111', '222'], ['111'])).toBe('parcial')
    expect(compararViejos(['111'], ['333'])).toBe('equivocado')
    expect(compararViejos(['111'], [])).toBe('sin_vinculo')
  })
})

describe('medirVinculoAutomatico', () => {
  const viejos = [
    doc({ numeroCheque: '020-923-5000-39584794', montoCentavos: 600000000, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', fechaConciliado: '2026-06-10', pagado: true, estadoCodigo: 5, obsOriginal: 'int+cap' }),
    doc({ numeroCheque: '020-923-5000-39584795', montoCentavos: 600000000, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', fechaConciliado: '2026-06-10', pagado: true, estadoCodigo: 5, obsOriginal: 'int+cap' }),
  ]
  const nuevos = [
    doc({ numeroCheque: '020-923-5000-39585362', montoCentavos: 700000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', esRenovacion: true, renovacionDe: ['39584794', '39584795'], obsOriginal: 'Renovacion cheques 39584794/95' }),
    doc({ numeroCheque: '020-923-5000-39585363', montoCentavos: 700000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', esRenovacion: true, renovacionDe: ['39584794', '39584795'], obsOriginal: 'Renovacion cheques 39584794/95' }),
  ]

  it('escondiendo los números del OBS, el vínculo automático llega a los mismos cheques', () => {
    const m = medirVinculoAutomatico([...viejos, ...nuevos])
    expect(m.conteo).toMatchObject({ igual: 1, total: 1 })
    expect(m.operaciones[0]!.viejosAutomaticos).toHaveLength(2)
  })

  it('si los viejos no están pagados no hay de dónde vincular: queda sin vínculo', () => {
    const sinPagar = viejos.map((v) => ({ ...v, pagado: false, fechaConciliado: null }))
    const m = medirVinculoAutomatico([...sinPagar, ...nuevos])
    expect(m.conteo).toMatchObject({ sin_vinculo: 1, total: 1 })
  })

  it('si ese día hay otra renovación con números escritos, se cuenta aparte (el sistema las junta)', () => {
    const otroViejo = doc({ numeroCheque: '020-923-5000-39584700', montoCentavos: 300000000, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', fechaConciliado: '2026-06-10', pagado: true, estadoCodigo: 5, obsOriginal: 'otro lote' })
    const otroNuevo = doc({ numeroCheque: '020-923-5000-39585400', montoCentavos: 330000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', esRenovacion: true, renovacionDe: ['39584700'], obsOriginal: 'Renovacion cheque 39584700' })
    const m = medirVinculoAutomatico([...viejos, otroViejo, ...nuevos, otroNuevo])
    expect(m.conteo).toMatchObject({ se_junta_con_otra: 2, total: 2 })
  })

  it('no mide las operaciones anteriores a `desde` ni toca los docs originales', () => {
    const m = medirVinculoAutomatico([...viejos, ...nuevos], { desde: '2026-07-01' })
    expect(m.conteo.total).toBe(0)
    expect(nuevos[0]!.renovacionDe).toHaveLength(2)
  })
})
