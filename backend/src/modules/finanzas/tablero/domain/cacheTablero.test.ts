import { describe, expect, it } from 'vitest'
import { partirPayloadCache } from './cacheTablero.js'
import { armarTablero, type ChequeVentana } from './calcular.js'

function tableroCon(cheques: ChequeVentana[]) {
  const base = armarTablero({
    mes: '2026-09',
    moneda: 'ARS',
    hoy: '2026-10-08',
    generadoEn: '2026-10-08T15:00:00.000Z',
    movimientos: [],
    categorias: [],
    cuentas: [],
    saldosDiarios: [],
    cheques: [],
    compromisos: [],
    cobros: [],
  })
  return { ...base, proximos30: { ...base.proximos30, cheques } }
}

describe('caché del tablero', () => {
  it('guarda el payload entero si entra en el tope', () => {
    const parte = partirPayloadCache(tableroCon([]))
    expect(parte.modo).toBe('entero')
  })

  it('separa los cheques cuando juntos no entran y cada parte sí', () => {
    const cheques: ChequeVentana[] = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      tipo: 'a_debitar',
      fechaPago: '2026-10-20',
      fechaEfectiva: '2026-10-20',
      banco: 'Córdoba',
      contraparte: 'Proveedor',
      numero: String(i),
      forma: 'fisico',
      montoCentavos: 100,
    }))
    const payload = tableroCon(cheques)
    const liviano = Buffer.byteLength(JSON.stringify(tableroCon([])), 'utf8')
    const soloCheques = Buffer.byteLength(JSON.stringify(cheques), 'utf8')
    const tope = Math.max(liviano, soloCheques) + 10
    const parte = partirPayloadCache(payload, tope)
    expect(parte.modo).toBe('cheques-aparte')
    if (parte.modo !== 'cheques-aparte') return
    expect(parte.payload.proximos30.cheques).toEqual([])
    expect(parte.cheques).toHaveLength(40)
    expect(parte.payload.proximos30.totalADebitarCentavos).toBe(payload.proximos30.totalADebitarCentavos)
  })

  it('no cachea si ni los cheques entran solos', () => {
    const parte = partirPayloadCache(tableroCon([]), 10)
    expect(parte.modo).toBe('no-cachear')
  })
})
