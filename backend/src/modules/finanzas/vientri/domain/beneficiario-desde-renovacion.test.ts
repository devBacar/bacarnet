import { describe, expect, it } from 'vitest'
import { REVISAR_SIN_DESTINATARIO } from './beneficiario-desde-obs.js'
import { completarBeneficiariosDesdeRenovacion, sinBeneficiarioHeredado } from './beneficiario-desde-renovacion.js'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'

let id = 1
function cheque(numero: string, overrides: Partial<ChequeOcasionalDoc> = {}): ChequeOcasionalDoc {
  return {
    numeroCheque: `020-923-5000-${numero}`,
    beneficiario: '',
    beneficiarioNormalizado: '',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100_00,
    fechaVencimiento: '2026-03-10',
    fechaEmision: '2026-01-23',
    estadoCodigo: 0,
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
    vientriId: id++,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

const mana = (numero: string) => cheque(numero, { beneficiario: 'MANA', beneficiarioNormalizado: 'mana' })
const renovacion = (numero: string, de: string[], extra: Partial<ChequeOcasionalDoc> = {}) =>
  cheque(numero, { esRenovacion: true, renovacionDe: de, revisar: [REVISAR_SIN_DESTINATARIO, 'Otro aviso'], obsOriginal: `Renovacion cheques n° ${de.join(', ')}`, ...extra })

describe('completarBeneficiariosDesdeRenovacion', () => {
  it('hereda el beneficiario de los cheques que renueva y saca "Sin destinatario" (MANA 23/01/2026)', () => {
    const r = completarBeneficiariosDesdeRenovacion([mana('38842742'), mana('38842744'), renovacion('38843107', ['38842742', '38842744'])])
    expect(r[2]).toMatchObject({ beneficiario: 'MANA', beneficiarioNormalizado: 'mana', beneficiarioDesdeRenovacion: true, revisar: ['Otro aviso'] })
  })

  it('no hereda si los viejos son de beneficiarios distintos o alguno no tiene', () => {
    const otro = cheque('2', { beneficiario: 'LIO', beneficiarioNormalizado: 'lio' })
    const sinNombre = cheque('3')
    const r = completarBeneficiariosDesdeRenovacion([mana('1'), otro, sinNombre, renovacion('10', ['1', '2']), renovacion('11', ['1', '3'])])
    expect(r[3]!.beneficiarioNormalizado).toBe('')
    expect(r[4]!.beneficiarioNormalizado).toBe('')
    expect(r[3]!.revisar).toContain(REVISAR_SIN_DESTINATARIO)
  })

  it('no hereda si no encuentra ninguno de los viejos, ni toca un cheque que ya tiene destinatario', () => {
    const conNombre = renovacion('11', ['1'], { beneficiario: 'POVO', beneficiarioNormalizado: 'povo' })
    const r = completarBeneficiariosDesdeRenovacion([mana('1'), renovacion('10', ['999']), conNombre])
    expect(r[1]!.beneficiarioNormalizado).toBe('')
    expect(r[2]).toBe(conNombre)
  })

  it('se encadena: la renovación de una renovación que heredó también hereda', () => {
    const r = completarBeneficiariosDesdeRenovacion([renovacion('20', ['10']), renovacion('10', ['1']), mana('1')])
    expect(r.map((d) => d.beneficiario)).toEqual(['MANA', 'MANA', 'MANA'])
  })

  it('se recalcula desde cero: si el viejo cambia de beneficiario, el nuevo cambia; si ya no se puede, vuelve a "Sin destinatario"', () => {
    const heredado = renovacion('10', ['1'], { beneficiario: 'MANA', beneficiarioNormalizado: 'mana', beneficiarioDesdeRenovacion: true, revisar: ['Otro aviso'] })
    const ahoraLio = completarBeneficiariosDesdeRenovacion([cheque('1', { beneficiario: 'LIO', beneficiarioNormalizado: 'lio' }), heredado])
    expect(ahoraLio[1]).toMatchObject({ beneficiario: 'LIO', beneficiarioDesdeRenovacion: true })
    const sinViejo = completarBeneficiariosDesdeRenovacion([heredado])
    expect(sinViejo[0]).toMatchObject({ beneficiario: '', beneficiarioDesdeRenovacion: false, revisar: ['Otro aviso', REVISAR_SIN_DESTINATARIO] })
  })

  it('un cheque dado de baja no se toca ni sirve de viejo', () => {
    const r = completarBeneficiariosDesdeRenovacion([cheque('1', { beneficiario: 'MANA', beneficiarioNormalizado: 'mana', baja: true }), renovacion('10', ['1'])])
    expect(r[1]!.beneficiarioNormalizado).toBe('')
  })
})

describe('sinBeneficiarioHeredado', () => {
  it('deja como vino de Vientri solo a los que heredaron', () => {
    const propio = mana('1')
    expect(sinBeneficiarioHeredado(propio)).toBe(propio)
  })
})
