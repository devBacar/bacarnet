import { describe, expect, it } from 'vitest'
import { validarDatosNegocio } from './validar.js'

/** Datos inventados y mínimos: solo la forma. */
function datosFicticios(): Record<string, unknown> {
  return {
    meses: ['2026-01', '2026-02'],
    cuentas: ['CUENTA A'],
    ccs: ['AREA A'],
    cats: ['RUBRO A'],
    provs: ['PROVEEDOR A'],
    costos: [[0, 'seg', 'sue', 0, 0, 0, 1000]],
    prov: [[0, 0, 0, 500]],
    lineasIng: { seg: { '2026-01': 100 } },
    clientes: [{ id: 1, n: 'CLIENTE A', pub: false, f: {}, t: {}, c: {}, r: {}, dias: null, atraso: null, deuda: 0 }],
    compras: { '2026-01': { facturas: 1, proveedores: 1, chicas: 0, chicasMonto: 0 } },
    cobTot: { '2026-01': 100 },
    dolar: { '2026-01': 1000 },
    cob: { diasCobro: 10, deudaClientes: [], deudaProveedores: [], deudaImpuestos: [] },
    inversiones: [],
    inflacion: 0.3,
  }
}

describe('validarDatosNegocio', () => {
  it('acepta datos con la forma esperada', () => {
    expect(validarDatosNegocio(datosFicticios())).toEqual({ ok: true })
  })

  it('acepta la clave opcional rrhh', () => {
    const d = { ...datosFicticios(), rrhh: { meses: { '2026-06': { seg: 1 } }, nombres: {} } }
    expect(validarDatosNegocio(d)).toEqual({ ok: true })
  })

  it('rechaza lo que no es un objeto', () => {
    expect(validarDatosNegocio(null).ok).toBe(false)
    expect(validarDatosNegocio([]).ok).toBe(false)
  })

  it('avisa qué lista falta', () => {
    const d = datosFicticios()
    delete d.cuentas
    expect(validarDatosNegocio(d)).toEqual({ ok: false, error: 'datos.json: falta la lista "cuentas"' })
  })

  it('rechaza meses vacíos o con formato raro', () => {
    expect(validarDatosNegocio({ ...datosFicticios(), meses: [] }).ok).toBe(false)
    expect(validarDatosNegocio({ ...datosFicticios(), meses: ['enero'] }).ok).toBe(false)
  })

  it('rechaza inflación que no es número', () => {
    expect(validarDatosNegocio({ ...datosFicticios(), inflacion: '30%' }).ok).toBe(false)
  })

  it('rechaza rrhh sin meses', () => {
    expect(validarDatosNegocio({ ...datosFicticios(), rrhh: {} }).ok).toBe(false)
  })
})
