import { describe, expect, it } from 'vitest'
import {
  clasificarCandidatos,
  fechaDentroDeVentana,
  mismosIds,
  sumarDiasIso,
} from './reconciliacion.rules.js'

describe('ventana de reconciliación', () => {
  it('incluye el día de confección y los cinco siguientes', () => {
    expect(sumarDiasIso('2026-09-28', 5)).toBe('2026-10-03')
    expect(fechaDentroDeVentana('2026-09-28', '2026-09-28')).toBe(true)
    expect(fechaDentroDeVentana('2026-10-03', '2026-09-28')).toBe(true)
  })

  it('excluye el día anterior y el sexto día', () => {
    expect(fechaDentroDeVentana('2026-09-27', '2026-09-28')).toBe(false)
    expect(fechaDentroDeVentana('2026-10-04', '2026-09-28')).toBe(false)
  })

  it('clasifica cero, uno y más de uno', () => {
    expect(clasificarCandidatos(0)).toBe('ninguno')
    expect(clasificarCandidatos(1)).toBe('unico')
    expect(clasificarCandidatos(2)).toBe('multiple')
  })

  it('compara listas de ids sin importar el orden', () => {
    expect(mismosIds(['b', 'a'], ['a', 'b'])).toBe(true)
    expect(mismosIds(['a'], ['a', 'b'])).toBe(false)
  })
})
