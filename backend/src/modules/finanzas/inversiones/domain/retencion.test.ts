import { describe, expect, it } from 'vitest'
import { retencionDeCuota } from './retencion.js'

const rg = { activa: true, alicuotaInscriptoPct: 6, alicuotaNoInscriptoPct: 28, minimoNoSujetoCentavos: 10_000 }

describe('retención de Ganancias sobre los intereses', () => {
  it('apagada o sin interés no retiene', () => {
    expect(retencionDeCuota({ interesCentavos: 100_000 }, { ...rg, activa: false }, true)).toBe(0)
    expect(retencionDeCuota({ interesCentavos: 0 }, rg, true)).toBe(0)
  })

  it('inscripto: (interés − mínimo) × 6 %; no inscripto o sin dato: × 28 %', () => {
    expect(retencionDeCuota({ interesCentavos: 110_000 }, rg, true)).toBe(6_000)
    expect(retencionDeCuota({ interesCentavos: 110_000 }, rg, false)).toBe(28_000)
    expect(retencionDeCuota({ interesCentavos: 110_000 }, rg, null)).toBe(28_000)
  })

  it('por debajo del mínimo no retiene', () => {
    expect(retencionDeCuota({ interesCentavos: 9_000 }, rg, true)).toBe(0)
  })
})
