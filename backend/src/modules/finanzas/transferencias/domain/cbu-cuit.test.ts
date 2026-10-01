import { describe, expect, it } from 'vitest'
import { cbuEsValido, cuitEsValido, validarCbu, validarCuitOpcional } from './cbu-cuit.js'

const CBU_PATAGONIA = '0340070800700370037009'
const CBU_JULIO = '3050001101010001303450'

describe('cbuEsValido', () => {
  it('acepta los CBU de las cuentas propias conocidas', () => {
    expect(cbuEsValido(CBU_PATAGONIA)).toBe(true)
    expect(cbuEsValido(CBU_JULIO)).toBe(true)
    expect(cbuEsValido('0340 0708 0070 0370 0370 09')).toBe(true)
  })

  it('rechaza longitud distinta de 22', () => {
    expect(cbuEsValido('034007080070037003700')).toBe(false)
    expect(cbuEsValido(`${CBU_PATAGONIA}1`)).toBe(false)
    expect(cbuEsValido('')).toBe(false)
  })

  it('rechaza un dígito verificador de bloque banco o de cuenta alterado', () => {
    const bancoMalo = `${CBU_PATAGONIA.slice(0, 7)}9${CBU_PATAGONIA.slice(8)}`
    const cuentaMala = `${CBU_PATAGONIA.slice(0, 21)}0`
    expect(cbuEsValido(bancoMalo)).toBe(false)
    expect(cbuEsValido(cuentaMala)).toBe(false)
  })
})

describe('validarCbu', () => {
  it('devuelve el CBU normalizado', () => {
    expect(validarCbu(` ${CBU_JULIO} `)).toEqual({ ok: true, valor: CBU_JULIO })
  })

  it('explica el error', () => {
    expect(validarCbu('')).toEqual({ ok: false, error: 'Ingresá el CBU' })
    expect(validarCbu('123')).toEqual({ ok: false, error: 'El CBU tiene que tener 22 dígitos' })
    expect(validarCbu(`${CBU_JULIO.slice(0, 21)}1`).ok).toBe(false)
  })
})

describe('cuitEsValido', () => {
  it('acepta un CUIT con verificador correcto, con o sin guiones', () => {
    expect(cuitEsValido('20123456786')).toBe(true)
    expect(cuitEsValido('20-12345678-6')).toBe(true)
    expect(cuitEsValido('23000000000')).toBe(true)
  })

  it('cuando el resto es 1 el dígito esperado es 9', () => {
    expect(cuitEsValido('20000000019')).toBe(true)
    expect(cuitEsValido('20000000010')).toBe(false)
  })

  it('rechaza longitud o verificador incorrectos', () => {
    expect(cuitEsValido('20123456785')).toBe(false)
    expect(cuitEsValido('2012345678')).toBe(false)
    expect(cuitEsValido('201234567861')).toBe(false)
  })
})

describe('validarCuitOpcional', () => {
  it('el vacío es válido', () => {
    expect(validarCuitOpcional(null)).toEqual({ ok: true, valor: '' })
    expect(validarCuitOpcional('  ')).toEqual({ ok: true, valor: '' })
  })

  it('normaliza un CUIT válido y rechaza uno mal formado', () => {
    expect(validarCuitOpcional('20-12345678-6')).toEqual({ ok: true, valor: '20123456786' })
    expect(validarCuitOpcional('20-12345678-5')).toEqual({
      ok: false,
      error: 'El CUIT no es válido (dígito verificador)',
    })
    expect(validarCuitOpcional('123')).toEqual({
      ok: false,
      error: 'El CUIT tiene que tener 11 dígitos',
    })
  })
})
