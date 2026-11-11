import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import {
  REVISAR_SIN_DESTINATARIO,
  beneficiarioDesdeObs,
  completarBeneficiarioDesdeObs,
  nombresConocidos,
} from './beneficiario-desde-obs.js'

const conocido = (beneficiario: string) => ({ beneficiario, beneficiarioNormalizado: beneficiario.toLowerCase(), baja: false })

const conocidos = nombresConocidos(
  [conocido('MANA'), conocido('MANA'), conocido('Mana'), conocido('LIO'), conocido('CONTA II'), conocido('PATIO')],
  new Map([['hna claudia', { id: 'pf-1', nombre: 'HERMANA CLAUDIA' }]]),
)

function cheque(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '020-923-5000-1',
    beneficiario: '',
    beneficiarioNormalizado: '',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100_00,
    fechaVencimiento: '2026-10-25',
    fechaEmision: '2026-09-08',
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
    revisar: [REVISAR_SIN_DESTINATARIO],
    fechaConciliado: null,
    proveedorFinancieroId: null,
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  } as ChequeOcasionalDoc
}

describe('beneficiarioDesdeObs', () => {
  it('toma el nombre del comienzo del OBS hasta el primer dato, con la forma más usada', () => {
    expect(beneficiarioDesdeObs('Mana usd60.000 TC1460', conocidos)).toEqual({ beneficiario: 'MANA', beneficiarioNormalizado: 'mana' })
    expect(beneficiarioDesdeObs('Lio usd20.000 TC1460', conocidos)).toEqual({ beneficiario: 'LIO', beneficiarioNormalizado: 'lio' })
    expect(beneficiarioDesdeObs('Conta II', conocidos)).toEqual({ beneficiario: 'CONTA II', beneficiarioNormalizado: 'conta ii' })
    expect(beneficiarioDesdeObs('MANA u$70.000 TC1525', conocidos)?.beneficiario).toBe('MANA')
    expect(beneficiarioDesdeObs('Mana - op 30/10', conocidos)?.beneficiario).toBe('MANA')
  })

  it('un proveedor cargado (o su alias) manda sobre cómo está escrito', () => {
    expect(beneficiarioDesdeObs('Hna Claudia u$5.000 TC1500', conocidos)).toEqual({ beneficiario: 'HERMANA CLAUDIA', beneficiarioNormalizado: 'hna claudia' })
  })

  it('prueba del nombre más largo al más corto', () => {
    expect(beneficiarioDesdeObs('Patio Olmos semana 20.08', conocidos)).toEqual({ beneficiario: 'PATIO', beneficiarioNormalizado: 'patio' })
  })

  it('no inventa: si el comienzo es un dato o un nombre desconocido, null', () => {
    expect(beneficiarioDesdeObs('Op', conocidos)).toBeNull()
    expect(beneficiarioDesdeObs('Renovacion cheques n° 38842742, 38842744', conocidos)).toBeNull()
    expect(beneficiarioDesdeObs('usd 70.000 TC1540', conocidos)).toBeNull()
    expect(beneficiarioDesdeObs('Juan Perez u$1.000 TC1400', conocidos)).toBeNull()
    expect(beneficiarioDesdeObs('', conocidos)).toBeNull()
  })
})

describe('completarBeneficiarioDesdeObs', () => {
  it('completa un cheque sin destinatario y saca el aviso "Sin destinatario"', () => {
    const r = completarBeneficiarioDesdeObs(cheque({ obsOriginal: 'Mana usd60.000 TC1460', revisar: [REVISAR_SIN_DESTINATARIO, 'Otro aviso'] }), conocidos)
    expect(r).toMatchObject({ beneficiario: 'MANA', beneficiarioNormalizado: 'mana', beneficiarioDesdeObs: true, revisar: ['Otro aviso'] })
  })

  it('no toca un cheque que ya trae destinatario, aunque el OBS nombre a otro', () => {
    const d = cheque({ beneficiario: 'LIO', beneficiarioNormalizado: 'lio', obsOriginal: 'Mana usd60.000 TC1460', revisar: [] })
    expect(completarBeneficiarioDesdeObs(d, conocidos)).toBe(d)
  })

  it('si el OBS no da un nombre conocido, el cheque queda como estaba', () => {
    const d = cheque({ obsOriginal: 'Op' })
    expect(completarBeneficiarioDesdeObs(d, conocidos)).toBe(d)
  })

  it('uno completado antes que deja de encontrarse vuelve a quedar sin destinatario', () => {
    const antes = cheque({ beneficiario: 'MANA', beneficiarioNormalizado: 'mana', beneficiarioDesdeObs: true, obsOriginal: 'Mana usd60.000 TC1460', revisar: [] })
    const r = completarBeneficiarioDesdeObs(antes, new Map())
    expect(r).toMatchObject({ beneficiario: '', beneficiarioNormalizado: '', beneficiarioDesdeObs: false, revisar: [REVISAR_SIN_DESTINATARIO] })
  })
})
