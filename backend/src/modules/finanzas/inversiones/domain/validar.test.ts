import { describe, expect, it } from 'vitest'
import { CONFIG_INVERSIONES_DEFAULT } from './inversion.types.js'
import { configConDefaults, ErrorValidacion, numeroInversion, validarConfig, validarInversorDatos } from './validar.js'

describe('validarInversorDatos', () => {
  it('solo pide el nombre y limpia el resto', () => {
    const d = validarInversorDatos({ nombre: '  Perez Ana ', cuit: '20-12345678-3', email: '' })
    expect(d.nombre).toBe('Perez Ana')
    expect(d.cuit).toBe('20123456783')
    expect(d.email).toBeNull()
    expect(d.dni).toBeNull()
  })

  it('rechaza sin nombre, CUIT mal y email mal', () => {
    expect(() => validarInversorDatos({ nombre: ' ' })).toThrow('Poné el nombre')
    expect(() => validarInversorDatos({ nombre: 'A', cuit: '123' })).toThrow('CUIT')
    expect(() => validarInversorDatos({ nombre: 'A', email: 'x@' })).toThrow('email')
    expect(() => validarInversorDatos({ nombre: 'A', tipoPersona: 'otra' })).toThrow(ErrorValidacion)
  })
})

describe('validarConfig', () => {
  const base = {
    baseDiasDefault: 365,
    horizonteMesesSinVencimiento: 12,
    penalidadDefault: { tipo: 'porcentaje_interes', valorPct: 10, topeIntereses: true },
    diasAvisoPorVencer: 15,
    retencionGanancias: { activa: false },
  }

  it('acepta una configuración válida y conserva el número correlativo', () => {
    const c = validarConfig({ ...base, ultimoNumero: 999 }, { ...CONFIG_INVERSIONES_DEFAULT, ultimoNumero: 7 })
    expect(c.ultimoNumero).toBe(7)
    expect(c.penalidadDefault).toEqual({ tipo: 'porcentaje_interes', valorPct: 10, topeIntereses: true })
    expect(c.retencionGanancias.activa).toBe(false)
  })

  it('no deja activar la retención sin alícuotas', () => {
    expect(() =>
      validarConfig({ ...base, retencionGanancias: { activa: true, alicuotaInscriptoPct: 6 } }, CONFIG_INVERSIONES_DEFAULT),
    ).toThrow('alícuotas')
    const c = validarConfig(
      { ...base, retencionGanancias: { activa: true, alicuotaInscriptoPct: 6, alicuotaNoInscriptoPct: 28 } },
      CONFIG_INVERSIONES_DEFAULT,
    )
    expect(c.retencionGanancias.activa).toBe(true)
  })

  it('rechaza base de días y penalidad inválidas', () => {
    expect(() => validarConfig({ ...base, baseDiasDefault: 300 }, CONFIG_INVERSIONES_DEFAULT)).toThrow('base de días')
    expect(() => validarConfig({ ...base, penalidadDefault: { tipo: 'monto_fijo' } }, CONFIG_INVERSIONES_DEFAULT)).toThrow(
      'monto',
    )
  })
})

describe('configConDefaults / numeroInversion', () => {
  it('completa campos nuevos en una config vieja', () => {
    const c = configConDefaults({ diasAvisoPorVencer: 5 } as never, CONFIG_INVERSIONES_DEFAULT)
    expect(c.diasAvisoPorVencer).toBe(5)
    expect(c.retencionGanancias.activa).toBe(false)
  })

  it('arma el número INV-0007', () => {
    expect(numeroInversion(7)).toBe('INV-0007')
  })
})
