import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import {
  REVISAR_FUERA_DE_LO_HABITUAL_PREFIJO,
  REVISAR_SUGERENCIA_PREFIJO,
  aplicarPatrones,
  aprenderPatron,
  chequesDeLaMismaOperacion,
  formaObs,
  numerosDeChequeEnObs,
  validarClasificacion,
  type PatronOcasional,
} from './patrones-ocasionales.js'

function cheque(overrides: Partial<ChequeOcasionalDoc> = {}): ChequeOcasionalDoc {
  return {
    numeroCheque: '020-923-5000-39111588',
    beneficiario: 'MANA',
    beneficiarioNormalizado: 'mana',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 590050000,
    fechaVencimiento: '2026-06-08',
    fechaEmision: '2026-03-10',
    estadoCodigo: 10,
    estado: '',
    pagado: true,
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    esRenovacion: false,
    renovacionDe: [],
    renovadoPor: [],
    operacionUsd: null,
    tasaExplicita: null,
    rolEnOperacion: null,
    obsOriginal: '65000 TC1435',
    revisar: [],
    proveedorFinancieroId: 'provfin-mana',
    vientriId: 1,
    fechaConciliado: null,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

const usd = (montoUsd: number, cotizacion: number) => ({ usd: { montoUsd, cotizacion } })

describe('formaObs', () => {
  it('ignora los números, mayúsculas y espacios de más', () => {
    expect(formaObs('65000 TC1435')).toBe(formaObs('30000  tc1440'))
    expect(formaObs('u$30.076,43 TC $1570')).toBe('u$# tc $#')
    expect(formaObs('65000 TC1435')).not.toBe(formaObs('u$65000 TC1435'))
  })
})

describe('chequesDeLaMismaOperacion', () => {
  it('agrupa por beneficiario + fecha de emisión + OBS idéntico, sin bajas', () => {
    const elegido = cheque()
    const todos = [
      elegido,
      cheque({ numeroCheque: 'b' }),
      cheque({ numeroCheque: 'otra fecha', fechaEmision: '2026-03-11' }),
      cheque({ numeroCheque: 'otro obs', obsOriginal: '65000 TC1436' }),
      cheque({ numeroCheque: 'otro benef', beneficiarioNormalizado: 'duran' }),
      cheque({ numeroCheque: 'baja', baja: true }),
    ]
    expect(chequesDeLaMismaOperacion(elegido, todos).map((d) => d.numeroCheque)).toEqual([
      '020-923-5000-39111588',
      'b',
    ])
  })
})

describe('validarClasificacion', () => {
  it('USD: si no vienen los números los lee del OBS', () => {
    expect(validarClasificacion('usd', undefined, '65000 TC1435')).toEqual({ ok: true, datos: usd(65000, 1435) })
    expect(validarClasificacion('usd', usd(1, 2), 'nada')).toEqual({ ok: true, datos: usd(1, 2) })
    expect(validarClasificacion('usd', undefined, 'nada').ok).toBe(false)
  })

  it('renovación pide al menos un número de cheque válido', () => {
    expect(validarClasificacion('renovacion', { chequeIds: [' 39111588 ', '39111588'] }, '')).toEqual({
      ok: true,
      datos: { chequeIds: ['39111588'] },
    })
    expect(validarClasificacion('renovacion', { chequeIds: [] }, '').ok).toBe(false)
    expect(validarClasificacion('renovacion', { chequeIds: ['abc'] }, '').ok).toBe(false)
  })

  it('rol solo acepta capital, interés o mixto', () => {
    expect(validarClasificacion('rol', { rol: 'interes' }, '')).toEqual({ ok: true, datos: { rol: 'interes' } })
    expect(validarClasificacion('rol', { rol: 'otro' }, '').ok).toBe(false)
    expect(validarClasificacion('otro', {}, '').ok).toBe(false)
  })
})

describe('numerosDeChequeEnObs', () => {
  it('toma números de 6 dígitos o más, sin repetir', () => {
    expect(numerosDeChequeEnObs('cambio 39111588 y 39.111.589, 39111588 TC 1435')).toEqual(['39111588', '39111589'])
  })

  it('completa los números abreviados con el anterior', () => {
    expect(numerosDeChequeEnObs('39585299/300/1/2')).toEqual(['39585299', '39585300', '39585301', '39585302'])
    expect(numerosDeChequeEnObs('39585299 / 300')).toEqual(['39585299', '39585300'])
  })

  it('no toma montos con decimales ni números cortos sueltos', () => {
    expect(numerosDeChequeEnObs('65.000,00 TC1435')).toEqual([])
    expect(numerosDeChequeEnObs('300/1/2')).toEqual([])
  })
})

describe('aprenderPatron', () => {
  it('cuenta confirmaciones y va ampliando los valores habituales', () => {
    const uno = aprenderPatron(null, cheque(), 'usd', usd(65000, 1435))
    const dos = aprenderPatron(uno, cheque({ obsOriginal: '30000 TC1500' }), 'usd', usd(30000, 1500))
    expect(dos).toMatchObject({
      beneficiarioNormalizado: 'mana',
      tipo: 'usd',
      forma: '# tc#',
      ejemplo: '30000 TC1500',
      confirmaciones: 2,
      cotizacionMin: 1435,
      cotizacionMax: 1500,
      montoUsdMin: 30000,
      montoUsdMax: 65000,
    })
  })
})

describe('aplicarPatrones', () => {
  const patronUsd = (confirmaciones: number): PatronOcasional => ({
    beneficiarioNormalizado: 'mana',
    tipo: 'usd',
    forma: '# tc#',
    ejemplo: '65000 TC1435',
    confirmaciones,
    rol: null,
    cotizacionMin: 1435,
    cotizacionMax: 1500,
    montoUsdMin: 30000,
    montoUsdMax: 65000,
  })

  it('propone USD a un cheque del mismo beneficiario con el mismo formato, sin aplicarlo', () => {
    const r = aplicarPatrones(cheque({ obsOriginal: '40000 TC1450' }), [patronUsd(2)])
    expect(r.operacionUsd).toBeNull()
    expect(r.sugerencia).toEqual({ tipo: 'usd', datos: usd(40000, 1450), confirmaciones: 2 })
    expect(r.revisar.some((t) => t.startsWith(REVISAR_SUGERENCIA_PREFIJO))).toBe(true)
  })

  it('no propone a otro beneficiario ni a un cheque que ya tiene USD', () => {
    expect(aplicarPatrones(cheque({ beneficiarioNormalizado: 'duran' }), [patronUsd(2)]).sugerencia).toBeNull()
    expect(aplicarPatrones(cheque({ operacionUsd: { montoUsd: 1, cotizacion: 1450 } }), [patronUsd(2)]).sugerencia).toBeNull()
  })

  it('avisa si la cotización se sale de lo habitual, recién con 3 confirmaciones', () => {
    const fuera = cheque({ operacionUsd: { montoUsd: 1000, cotizacion: 2000 } })
    expect(aplicarPatrones(fuera, [patronUsd(2)]).revisar).toEqual([])
    const r = aplicarPatrones(fuera, [patronUsd(3)])
    expect(r.revisar).toHaveLength(1)
    expect(r.revisar[0]).toMatch(new RegExp(`^${REVISAR_FUERA_DE_LO_HABITUAL_PREFIJO}`))
    const dentro = cheque({ operacionUsd: { montoUsd: 1000, cotizacion: 1550 } })
    expect(aplicarPatrones(dentro, [patronUsd(3)]).revisar).toEqual([])
  })

  it('es idempotente y conserva los demás avisos', () => {
    const base = cheque({ obsOriginal: '40000 TC1450', revisar: ['Importe cero o negativo'] })
    const una = aplicarPatrones(base, [patronUsd(2)])
    expect(aplicarPatrones(una, [patronUsd(2)])).toEqual(una)
    expect(una.revisar[0]).toBe('Importe cero o negativo')
    expect(aplicarPatrones(una, []).revisar).toEqual(['Importe cero o negativo'])
  })

  it('para interés/capital propone el rol aprendido', () => {
    const rol: PatronOcasional = { ...patronUsd(1), tipo: 'rol', forma: 'cuota #', rol: 'interes' }
    const r = aplicarPatrones(cheque({ obsOriginal: 'cuota 3' }), [rol])
    expect(r.sugerencia).toEqual({ tipo: 'rol', datos: { rol: 'interes' }, confirmaciones: 1 })
  })
})
