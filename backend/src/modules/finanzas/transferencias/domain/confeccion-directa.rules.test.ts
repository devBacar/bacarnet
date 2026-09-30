import { describe, expect, it } from 'vitest'
import {
  disponibleCuentaCentavos,
  parseConfeccionDirectaBody,
  TransferenciaHttpError,
} from './confeccion-directa.rules.js'

const CBU_JULIO = '3050001101010001303450'

function base(overrides: Record<string, unknown> = {}) {
  return {
    cuentaDebitoId: 'patagonia-cc',
    tipo: 'terceros',
    destino: { cbu: CBU_JULIO, nombre: 'Acme SA', cuit: '20-12345678-6' },
    montoCentavos: 150_000,
    concepto: 'Pago de factura',
    idempotencyKey: '11111111-2222-4333-8444-555555555555',
    ...overrides,
  }
}

describe('disponibleCuentaCentavos', () => {
  it('suma el descubierto y trata la falta de descubierto como cero', () => {
    expect(disponibleCuentaCentavos(100_000, 50_000)).toBe(150_000)
    expect(disponibleCuentaCentavos(-40_000, 100_000)).toBe(60_000)
    expect(disponibleCuentaCentavos(80_000, null)).toBe(80_000)
    expect(disponibleCuentaCentavos(80_000, undefined)).toBe(80_000)
  })
})

describe('parseConfeccionDirectaBody', () => {
  it('normaliza terceros con CUIT y referencia', () => {
    const parsed = parseConfeccionDirectaBody(base({ referencia: 'FC 100' }))
    expect(parsed.destinoCbu).toBe(CBU_JULIO)
    expect(parsed.destinoCuit).toBe('20123456786')
    expect(parsed.destinoNombre).toBe('Acme SA')
    expect(parsed.referencia).toBe('FC 100')
    expect(parsed.confirmarSinFondos).toBe(false)
  })

  it('exige cuenta destino en cuentas propias y prohíbe la misma cuenta', () => {
    const parsed = parseConfeccionDirectaBody(
      base({
        tipo: 'cuentas_propias',
        destino: { cuentaId: 'julio-cc' },
      }),
    )
    expect(parsed.destinoCuentaId).toBe('julio-cc')
    expect(parsed.destinoCbu).toBeNull()

    expect(() =>
      parseConfeccionDirectaBody(
        base({
          tipo: 'cuentas_propias',
          destino: { cuentaId: 'patagonia-cc' },
        }),
      ),
    ).toThrow(/misma/)
  })

  it('rechaza CBU, CUIT, monto y concepto inválidos', () => {
    expect(() => parseConfeccionDirectaBody(base({ destino: { cbu: '123', nombre: 'Ana' } }))).toThrow(
      TransferenciaHttpError,
    )
    expect(() =>
      parseConfeccionDirectaBody(
        base({ destino: { cbu: CBU_JULIO, nombre: 'Ana', cuit: '20123456785' } }),
      ),
    ).toThrow(/CUIT/)
    expect(() => parseConfeccionDirectaBody(base({ montoCentavos: 10.5 }))).toThrow(/centavos/)
    expect(() => parseConfeccionDirectaBody(base({ montoCentavos: 0 }))).toThrow(/centavos/)
    expect(() => parseConfeccionDirectaBody(base({ concepto: '   ' }))).toThrow(/concepto/)
    expect(() => parseConfeccionDirectaBody(base({ concepto: 'a'.repeat(61) }))).toThrow(/60/)
    expect(parseConfeccionDirectaBody(base({ concepto: 'a'.repeat(60) })).concepto).toHaveLength(60)
  })

  it('el CUIT puede omitirse', () => {
    const parsed = parseConfeccionDirectaBody(
      base({ destino: { cbu: CBU_JULIO, nombre: 'Sin cuit' } }),
    )
    expect(parsed.destinoCuit).toBeNull()
  })

  it('en terceros el motivo por defecto es Varios y el aviso es obligatorio si el banco lo pide', () => {
    expect(parseConfeccionDirectaBody(base()).codigoConcepto).toBe('VAR')
    expect(parseConfeccionDirectaBody(base({ codigoConcepto: 'fac' })).codigoConcepto).toBe('FAC')
    expect(() => parseConfeccionDirectaBody(base({ codigoConcepto: 'ZZZ' }))).toThrow(/motivo/)
    expect(() => parseConfeccionDirectaBody(base({ codigoConcepto: 'OIN' }))).toThrow(/aviso/)
    const conAviso = parseConfeccionDirectaBody(base({ codigoConcepto: 'OIN', disclaimerAceptado: true }))
    expect(conAviso.codigoConcepto).toBe('OIN')
    expect(conAviso.disclaimerAceptado).toBe(true)
    expect(parseConfeccionDirectaBody(base({ tipo: 'proveedores' })).codigoConcepto).toBeNull()
  })
})
