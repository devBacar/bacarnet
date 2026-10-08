import { describe, expect, it } from 'vitest'
import { leerRespuestaFeriados, resolverCalendarioFeriados, traerFeriadosOficiales } from './feriadosOficiales.js'

describe('feriados oficiales', () => {
  it('lee puentes y días no laborables del JSON', () => {
    const fechas = leerRespuestaFeriados([
      { fecha: '2026-01-01', tipo: 'inamovible', nombre: 'Año Nuevo' },
      { fecha: '2026-03-23', tipo: 'puente', nombre: 'Puente turístico' },
      { fecha: '2026-12-07', tipo: 'no laborable', nombre: 'Día no laborable' },
      { fecha: 'mala' },
    ])
    expect(fechas).toEqual({
      '2026-01-01': 'Año Nuevo',
      '2026-03-23': 'Puente turístico',
      '2026-12-07': 'Día no laborable',
    })
  })

  it('pide la API cada vez y guarda lo nuevo (entran los puentes decretados durante el año)', async () => {
    const guardados: number[] = []
    const cal = await resolverCalendarioFeriados(2026, {
      leer: async () => ({ '2026-05-01': 'viejo' }),
      traer: async (anio): Promise<Record<string, string>> => (anio === 2026 ? { '2026-05-01': 'Día del Trabajador' } : { '2027-01-01': 'Año Nuevo' }),
      guardar: async (anio) => {
        guardados.push(anio)
      },
    })
    expect(guardados).toEqual([2026, 2027])
    expect(cal.anios['2026']['2026-05-01']?.nombre).toBe('Día del Trabajador')
    expect(cal.anios['2027']['2027-01-01']?.origen).toBe('oficial')
  })

  it('si la API falla usa lo guardado', async () => {
    const cal = await resolverCalendarioFeriados(2030, {
      leer: async (anio) => (anio === 2030 ? { '2030-05-01': 'Día del Trabajador' } : null),
      traer: async () => null,
      guardar: async () => {
        throw new Error('no debería guardar')
      },
    })
    expect(cal.anios['2030']['2030-05-01']?.origen).toBe('oficial')
    expect(cal.anios['2031']['2031-04-11']?.origen).toBe('calculado')
  })

  it('si la API falla sigue con el calendario calculado', async () => {
    const cal = await resolverCalendarioFeriados(2028, {
      leer: async () => null,
      traer: async () => {
        throw new Error('timeout')
      },
    })
    expect(cal.anios['2028']['2028-01-01']?.origen).toBe('calculado')
    expect(cal.anios['2029']['2029-03-30']?.nombre).toBe('Viernes Santo')
  })

  it('un fetch que no responde devuelve null', async () => {
    const fechas = await traerFeriadosOficiales(2026, (() => Promise.reject(new Error('caido'))) as typeof fetch)
    expect(fechas).toBeNull()
  })
})
