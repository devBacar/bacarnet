import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { hayQueImportar, horasDesdeFechaDatos, leerZipVientri, PATRON_ZIP_VIENTRI } from './zip.js'

async function armarZip(archivos: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const [nombre, texto] of Object.entries(archivos)) zip.file(nombre, texto)
  return zip.generateAsync({ type: 'uint8array' })
}

describe('leerZipVientri', () => {
  it('devuelve los CSV por nombre, sin carpetas ni BOM', async () => {
    const datos = await armarZip({
      '_control.csv': '﻿archivo;filas\npersonas.csv;1\n',
      'sub\\personas.csv': 'vientri_id;nombre\n1;Persona Ficticia SA\n',
      '_exportacion.log': 'no es csv',
    })
    const textos = await leerZipVientri(datos)
    expect([...textos.keys()].sort()).toEqual(['_control.csv', 'personas.csv'])
    expect(textos.get('_control.csv')?.startsWith('archivo;')).toBe(true)
  })

  it('rechaza un zip con el mismo CSV dos veces', async () => {
    const datos = await armarZip({ 'a/personas.csv': 'x', 'b/personas.csv': 'y' })
    await expect(leerZipVientri(datos)).rejects.toThrow('dos veces')
  })
})

describe('hayQueImportar', () => {
  it('importa si nunca se importó, si falló o si el archivo es otro', () => {
    expect(hayQueImportar(null, 'vientri_20261020_0510.zip')).toBe(true)
    expect(hayQueImportar({ archivo: 'vientri_20261020_0510.zip', ok: false }, 'vientri_20261020_0510.zip')).toBe(true)
    expect(hayQueImportar({ archivo: 'vientri_20261019_0510.zip', ok: true }, 'vientri_20261020_0510.zip')).toBe(true)
  })
  it('no repite el mismo archivo ya importado', () => {
    expect(hayQueImportar({ archivo: 'vientri_20261020_0510.zip', ok: true }, 'vientri_20261020_0510.zip')).toBe(false)
  })
})

describe('PATRON_ZIP_VIENTRI y horasDesdeFechaDatos', () => {
  it('reconoce solo los zips del exportador', () => {
    expect(PATRON_ZIP_VIENTRI.test('vientri_20261019_1209.zip')).toBe(true)
    expect(PATRON_ZIP_VIENTRI.test('prueba.zip')).toBe(false)
  })
  it('cuenta horas en hora Argentina', () => {
    expect(horasDesdeFechaDatos('2026-10-19T10:00:00', new Date('2026-10-19T16:00:00Z'))).toBeCloseTo(3)
    expect(horasDesdeFechaDatos('basura')).toBe(Number.POSITIVE_INFINITY)
  })
})
