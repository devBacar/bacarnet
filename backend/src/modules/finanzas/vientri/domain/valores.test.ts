import { describe, expect, it } from 'vitest'
import { leerCsv } from './csv.js'
import { aCentavos, aCuit, aFecha, fechaImposible, serieCheque } from './valores.js'

describe('leerCsv', () => {
  it('lee ; con BOM, comillas y CRLF', () => {
    const t = leerCsv('﻿a;b;c\r\n1;"x;y";"di ""hola"""\r\n2;;z\n')
    expect(t.columnas).toEqual(['a', 'b', 'c'])
    expect(t.filas).toEqual([
      { a: '1', b: 'x;y', c: 'di "hola"' },
      { a: '2', b: '', c: 'z' },
    ])
  })
  it('falla si una fila no tiene la misma cantidad de columnas', () => {
    expect(() => leerCsv('a;b\n1;2;3\n')).toThrow(/columnas/)
  })
})

describe('valores', () => {
  it('convierte importes a centavos sin errores de coma flotante', () => {
    expect(aCentavos('1677428.89')).toBe(167742889)
    expect(aCentavos('1000000.0000')).toBe(100000000)
    expect(aCentavos('0.105')).toBe(11)
    expect(aCentavos('-200000.00')).toBe(-20000000)
    expect(aCentavos('')).toBeNull()
    expect(aCentavos('abc')).toBeNull()
  })
  it('fechas, CUIT y serie de cheque', () => {
    expect(aFecha('2026-10-14T00:00:00')).toBe('2026-10-14')
    expect(fechaImposible('2120-04-07')).toBe(true)
    expect(fechaImposible('2027-02-10')).toBe(false)
    expect(aCuit('30-00000000-1')).toBe('30000000001')
    expect(serieCheque('020-923-5000-00012345')).toBe('12345')
    expect(serieCheque('E-CHEQ 00012345')).toBe('12345')
  })
})
