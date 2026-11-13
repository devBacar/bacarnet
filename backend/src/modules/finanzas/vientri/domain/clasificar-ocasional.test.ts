import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import {
  REVISAR_INTERES_SIN_ORIGEN,
  REVISAR_PROVEEDOR_NO_CARGADO,
  REVISAR_SIN_DATOS_FINANCIEROS,
  claveGrupoOtroPago,
  clasificarOcasional,
  esCompraIva,
  esOtroPago,
  marcarOtrosPagos,
  reclasificarDoc,
} from './clasificar-ocasional.js'

const PROVEEDORES = new Map([['presta plata', { id: 'provfin-presta plata' }]])
const CON_SENAL = { esRenovacion: true, esRenovadoPorOtro: false, tieneUsd: false, tieneTasaExplicita: false, tieneRol: false, esSoloInteres: false, tieneOrigen: false }
const SIN_SENAL = { esRenovacion: false, esRenovadoPorOtro: false, tieneUsd: false, tieneTasaExplicita: false, tieneRol: false, esSoloInteres: false, tieneOrigen: false }

function doc(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '020-111-2222-1',
    beneficiario: 'Presta Plata',
    beneficiarioNormalizado: 'presta plata',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100,
    fechaVencimiento: '2026-11-10',
    fechaEmision: '2026-10-10',
    estadoCodigo: null,
    estado: '',
    pagado: false,
    esProveedorFinanciero: false,
    tipoProveedor: null,
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
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

describe('clasificarOcasional', () => {
  it('siempre es financiero', () => {
    const c = clasificarOcasional('quien sea', SIN_SENAL, PROVEEDORES)
    expect(c.esProveedorFinanciero).toBe(true)
    expect(c.tipoProveedor).toBe('financiero')
  })

  it('proveedor cargado con señales: usa su id y no queda a revisar', () => {
    const c = clasificarOcasional('presta plata', CON_SENAL, PROVEEDORES)
    expect(c.proveedorFinancieroId).toBe('provfin-presta plata')
    expect(c.revisarAgregados).toEqual([])
  })

  it('proveedor no cargado: queda a revisar y sin id', () => {
    const c = clasificarOcasional('otro', CON_SENAL, PROVEEDORES)
    expect(c.proveedorFinancieroId).toBeNull()
    expect(c.revisarAgregados).toEqual([REVISAR_PROVEEDOR_NO_CARGADO])
  })

  it('sin ninguna señal en el OBS: queda a revisar', () => {
    const c = clasificarOcasional('presta plata', SIN_SENAL, PROVEEDORES)
    expect(c.revisarAgregados).toEqual([REVISAR_SIN_DATOS_FINANCIEROS])
  })

  it('interés solo, sin saber de qué cheque viene: queda a revisar', () => {
    const interes = { ...SIN_SENAL, tieneRol: true, esSoloInteres: true }
    expect(clasificarOcasional('presta plata', interes, PROVEEDORES).revisarAgregados).toEqual([REVISAR_INTERES_SIN_ORIGEN])
  })

  it('interés con origen (renueva a otro cheque, USD o tasa) no queda a revisar', () => {
    const interes = { ...SIN_SENAL, tieneRol: true, esSoloInteres: true, tieneOrigen: true }
    expect(clasificarOcasional('presta plata', interes, PROVEEDORES).revisarAgregados).toEqual([])
  })

  it('sin destinatario no se marca como proveedor no cargado', () => {
    const c = clasificarOcasional('', CON_SENAL, PROVEEDORES)
    expect(c.revisarAgregados).toEqual([])
  })

  it('cualquier señal alcanza (USD, tasa o rol)', () => {
    for (const senal of [{ tieneUsd: true }, { tieneTasaExplicita: true }, { tieneRol: true }, { esRenovadoPorOtro: true }]) {
      const c = clasificarOcasional('presta plata', { ...SIN_SENAL, ...senal }, PROVEEDORES)
      expect(c.revisarAgregados).toEqual([])
    }
  })
})

describe('compra de IVA', () => {
  it('detecta "IVA" como palabra suelta en el OBS', () => {
    expect(esCompraIva('presta plata', 'compra iva 21%')).toBe(true)
    expect(esCompraIva('presta plata', 'IVA')).toBe(true)
    expect(esCompraIva('presta plata', 'Privado, saliva')).toBe(false)
  })

  it('detecta los beneficiarios CONTA con número', () => {
    for (const b of ['conta i', 'conta ii', 'conta iii', 'conta iiii', 'conta iv', 'conta 1']) expect(esCompraIva(b, '')).toBe(true)
    expect(esCompraIva('conta', '')).toBe(false)
    expect(esCompraIva('contable sa', '')).toBe(false)
  })

  it('una compra de IVA no queda a revisar por proveedor ni por falta de datos financieros', () => {
    const c = clasificarOcasional('conta i', SIN_SENAL, PROVEEDORES, '')
    expect(c.esCompraIva).toBe(true)
    expect(c.revisarAgregados).toEqual([])
  })

  it('reclasificarDoc marca el doc y saca avisos viejos', () => {
    const r = reclasificarDoc(
      doc({ beneficiario: 'CONTA IV', beneficiarioNormalizado: 'conta iv', revisar: [REVISAR_PROVEEDOR_NO_CARGADO, REVISAR_SIN_DATOS_FINANCIEROS] }),
      PROVEEDORES,
    )
    expect(r.esCompraIva).toBe(true)
    expect(r.revisar).toEqual([])
  })
})

describe('reclasificarDoc', () => {
  it('corrige un doc viejo que no era financiero y lo deja a revisar', () => {
    const r = reclasificarDoc(doc({ beneficiario: 'Nuevo', beneficiarioNormalizado: 'nuevo' }), PROVEEDORES)
    expect(r.esProveedorFinanciero).toBe(true)
    expect(r.tipoProveedor).toBe('financiero')
    expect(r.revisar).toEqual([REVISAR_PROVEEDOR_NO_CARGADO, REVISAR_SIN_DATOS_FINANCIEROS])
  })

  it('un doc con rol interés y sin renovacionDe queda a revisar, y deja de estarlo si gana origen', () => {
    const interes = doc({ rolEnOperacion: 'interes', obsOriginal: 'Interes' })
    const r = reclasificarDoc(interes, PROVEEDORES)
    expect(r.revisar).toEqual([REVISAR_INTERES_SIN_ORIGEN])
    expect(reclasificarDoc({ ...r, renovacionDe: ['020-111-2222-0'] }, PROVEEDORES).revisar).toEqual([])
  })

  it('capital con interés ("INTERESES Y CAP") es operación inicial: no queda a revisar por falta de origen', () => {
    const mixto = doc({ rolEnOperacion: 'mixto', obsOriginal: 'INTERESES Y CAP' })
    expect(reclasificarDoc(mixto, PROVEEDORES).revisar).toEqual([])
    const capital = doc({ rolEnOperacion: 'capital', obsOriginal: 'Capital' })
    expect(reclasificarDoc(capital, PROVEEDORES).revisar).toEqual([])
  })

  it('conserva los otros textos de revisar', () => {
    const r = reclasificarDoc(doc({ revisar: ['Importe cero o negativo'], esRenovacion: true }), PROVEEDORES)
    expect(r.revisar).toEqual(['Importe cero o negativo'])
  })

  it('un cheque viejo que otro renueva no queda a revisar por tener el OBS vacío', () => {
    const r = reclasificarDoc(doc({ renovadoPor: ['020-111-2222-2'], obsOriginal: '' }), PROVEEDORES)
    expect(r.revisar).toEqual([])
  })

  it('es idempotente: aplicarlo dos veces da lo mismo', () => {
    const una = reclasificarDoc(doc({ beneficiarioNormalizado: 'nuevo' }), PROVEEDORES)
    const dos = reclasificarDoc(una, PROVEEDORES)
    expect(dos).toEqual(una)
  })

  it('saca el aviso de proveedor no cargado cuando el proveedor ya se cargó', () => {
    const viejo = doc({ esRenovacion: true, revisar: [REVISAR_PROVEEDOR_NO_CARGADO] })
    const r = reclasificarDoc(viejo, PROVEEDORES)
    expect(r.revisar).toEqual([])
    expect(r.proveedorFinancieroId).toBe('provfin-presta plata')
  })

  it('no toca el resto del doc', () => {
    const original = doc({ pagado: true, montoCentavos: 555, renovadoPor: ['x'] })
    const r = reclasificarDoc(original, PROVEEDORES)
    expect(r.pagado).toBe(true)
    expect(r.montoCentavos).toBe(555)
    expect(r.renovadoPor).toEqual(['x'])
  })
})

describe('esOtroPago', () => {
  it('Iván Barrera solo cuando el OBS dice retiro, en cualquier orden del nombre', () => {
    expect(esOtroPago('ivan barrera', 'RETIRO 10/11')).toBe(true)
    expect(esOtroPago('barrera ivan', 'retiros socio')).toBe(true)
    expect(esOtroPago('ivan barrera', 'RENOV CHQ 123')).toBe(false)
  })
  it('Fabrega Gabriela y Cavazza siempre', () => {
    expect(esOtroPago('fabrega gabriela', '')).toBe(true)
    expect(esOtroPago('gabriela fabrega', 'lo que sea')).toBe(true)
    expect(esOtroPago('cavazza', '')).toBe(true)
    expect(esOtroPago('cavazza hnos', 'x')).toBe(true)
  })
  it('otros beneficiarios no', () => {
    expect(esOtroPago('presta plata', 'retiro')).toBe(false)
    expect(esOtroPago('gabriela perez', '')).toBe(false)
  })
  it('los marcados a mano como pago, siempre', () => {
    const marcados = new Set(['juan perez'])
    expect(esOtroPago('juan perez', 'RENOV CHQ 123', marcados)).toBe(true)
    expect(esOtroPago('juan perezoso', '', marcados)).toBe(false)
    expect(esOtroPago('', '', new Set(['']))).toBe(false)
  })
})

describe('marcarOtrosPagos', () => {
  it('marca cada cheque sin tocar lo demás', () => {
    const r = marcarOtrosPagos(
      [
        { beneficiarioNormalizado: 'juan perez', obsOriginal: '', montoCentavos: 1 },
        { beneficiarioNormalizado: 'cavazza', obsOriginal: '', montoCentavos: 2 },
        { beneficiarioNormalizado: 'presta plata', obsOriginal: '', montoCentavos: 3 },
      ],
      new Set(['juan perez']),
    )
    expect(r.map((d) => d.esOtroPago)).toEqual([true, true, false])
    expect(r.map((d) => d.montoCentavos)).toEqual([1, 2, 3])
  })
})

describe('claveGrupoOtroPago', () => {
  it('junta por fecha de emisión + OBS + beneficiario', () => {
    const a = claveGrupoOtroPago({ fechaEmision: '2026-11-01', obsOriginal: 'RETIRO ', beneficiarioNormalizado: 'ivan barrera' })
    const b = claveGrupoOtroPago({ fechaEmision: '2026-11-01', obsOriginal: 'retiro', beneficiarioNormalizado: 'ivan barrera' })
    const c = claveGrupoOtroPago({ fechaEmision: '2026-11-02', obsOriginal: 'retiro', beneficiarioNormalizado: 'ivan barrera' })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
