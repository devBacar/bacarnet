import { describe, expect, it } from 'vitest'
import { generarCronograma, totalesDe } from './cronograma.js'
import type { CondicionesInversion } from './inversion.types.js'
import { calcularPenalidad, devolucionParcial, precancelar, renovar, type InversionParaOperar } from './operaciones.js'
import { alertasDe, estadoAlTerminar, estadoDeCuota } from './seguimiento.js'
import { idCompromisoCuota, planAgendaCuotas, planCobroIngreso, type InversionParaAgenda } from './agenda-plan.js'

const base: CondicionesInversion = {
  moneda: 'ARS',
  capitalCentavos: 10_000_000,
  fechaAlta: '2026-01-15',
  sistema: 'americano',
  periodicidad: 'mensual',
  cantidadCuotas: 6,
  fechaVencimiento: null,
  tasa: { tipo: 'fija', tnaPct: 12 },
  baseDias: 360,
  medioIngresoPrevisto: 'transferencia',
  mediosDevolucion: ['transferencia_ars'],
  penalidadPrecancelacion: { tipo: 'ninguna' },
}

function inversion(extra: Partial<CondicionesInversion> = {}): InversionParaOperar {
  const cond = { ...base, ...extra }
  return { ...cond, cronograma: generarCronograma(cond), indiceAlta: null }
}

describe('calcularPenalidad', () => {
  it('según el tipo', () => {
    expect(calcularPenalidad({ tipo: 'ninguna' }, 100, 50)).toBe(0)
    expect(calcularPenalidad({ tipo: 'porcentaje_interes', valorPct: 50 }, 100, 50)).toBe(25)
    expect(calcularPenalidad({ tipo: 'porcentaje_capital', valorPct: 1 }, 10_000, 50)).toBe(100)
    expect(calcularPenalidad({ tipo: 'monto_fijo', montoCentavos: 7 }, 100, 50)).toBe(7)
  })
})

describe('precancelar', () => {
  it('junta lo que falta en una cuota con interés hasta la fecha y descuenta la penalidad', () => {
    const inv = inversion()
    const r = precancelar({ inversion: inv, fecha: '2026-03-30', penalidad: { tipo: 'porcentaje_interes', valorPct: 50 }, pagos: [] })
    const nueva = r.cronograma.at(-1)!
    expect(nueva.tipo).toBe('precancelacion')
    // Desde la cuota del 15/03: 15 días a 12 % base 360 = 0,5 % → 50.000 de interés; penalidad 25.000
    expect(nueva.interesCentavos).toBe(50_000)
    expect(nueva.penalidadCentavos).toBe(25_000)
    expect(nueva.totalCentavos).toBe(10_000_000 + 25_000)
    expect(r.cronograma.filter((c) => c.anulada).map((c) => c.numero)).toEqual([3, 4, 5, 6])
    expect(totalesDe(r.cronograma).capitalCentavos).toBe(10_000_000)
  })

  it('no deja precancelar sobre cuotas que ya tienen pagos', () => {
    expect(() =>
      precancelar({ inversion: inversion(), fecha: '2026-03-30', penalidad: { tipo: 'ninguna' }, pagos: [{ numero: 4, pagadoCentavos: 1 }] }),
    ).toThrow(/cuota 4/)
  })
})

describe('devolucionParcial', () => {
  it('devuelve una parte y recalcula el resto con el saldo menor', () => {
    const inv = inversion({ sistema: 'aleman' })
    const r = devolucionParcial({ inversion: inv, fecha: '2026-03-15', montoCentavos: 2_000_000, penalidad: { tipo: 'ninguna' }, pagos: [] })
    const parcial = r.cronograma.find((c) => c.tipo === 'devolucion_parcial')!
    expect(parcial.capitalCentavos).toBe(2_000_000)
    // La cuota del 15/03 se reemplaza: el interés corre desde el 15/02 sobre 8.333.334 (1 %).
    expect(parcial.interesCentavos).toBe(83_333)
    const vivas = r.cronograma.filter((c) => !c.anulada)
    expect(vivas.reduce((s, c) => s + c.capitalCentavos, 0)).toBe(10_000_000)
    expect(vivas.at(-1)!.saldoCapitalCentavos).toBe(0)
  })

  it('no permite devolver todo', () => {
    expect(() =>
      devolucionParcial({ inversion: inversion(), fecha: '2026-03-20', montoCentavos: 10_000_000, penalidad: { tipo: 'ninguna' }, pagos: [] }),
    ).toThrow(/precancelación/)
  })
})

describe('renovar', () => {
  it('solo capital: se pagan los intereses y el capital pasa a la nueva', () => {
    const r = renovar({ inversion: inversion(), modalidad: 'solo_capital', pagos: [] })
    expect(r.capitalRenovadoCentavos).toBe(10_000_000)
    expect(r.fechaRenovacion).toBe('2026-07-15')
    expect(r.cronograma.at(-1)!.renovadaCentavos).toBe(10_000_000)
  })
  it('capital e intereses: no se paga nada', () => {
    const r = renovar({ inversion: inversion(), modalidad: 'capital_e_intereses', pagos: [] })
    expect(r.capitalRenovadoCentavos).toBe(10_100_000)
  })
})

describe('seguimiento', () => {
  const inv = inversion({ cantidadCuotas: 2 })
  it('estado de cada cuota según la Agenda', () => {
    const c1 = inv.cronograma[0]!
    expect(estadoDeCuota(c1, undefined, '2026-02-01')).toBe('pendiente')
    expect(estadoDeCuota(c1, undefined, '2026-03-01')).toBe('atrasada')
    expect(estadoDeCuota(c1, { numero: 1, compromisoId: 'x', estado: 'pendiente', montoCentavos: 100, pagadoCentavos: 50 }, '2026-02-01')).toBe('parcial')
    expect(estadoDeCuota(c1, { numero: 1, compromisoId: 'x', estado: 'pagado', montoCentavos: 100, pagadoCentavos: 100 }, '2026-03-01')).toBe('pagada')
  })
  it('avisa por vencer y termina cuando todo está pagado', () => {
    const estados = new Map([
      [1, 'pagada' as const],
      [2, 'pendiente' as const],
    ])
    const a = alertasDe({ estado: 'vigente', cronograma: inv.cronograma, estados, hoy: '2026-03-01', diasAviso: 30 })
    expect(a.porVencer).toBe(true)
    expect(a.proximaCuota?.numero).toBe(2)
    expect(estadoAlTerminar({ estado: 'vigente', cronograma: inv.cronograma, estados })).toBeNull()
    estados.set(2, 'pagada')
    expect(estadoAlTerminar({ estado: 'vigente', cronograma: inv.cronograma, estados })).toBe('cancelada')
  })
})

describe('plan de Agenda', () => {
  const inv = inversion({ cantidadCuotas: 2 })
  const paraAgenda: InversionParaAgenda = {
    id: 'abc',
    numero: 'INV-0001',
    inversorNombre: 'Juan Pérez',
    moneda: 'ARS',
    estado: 'vigente',
    cronograma: inv.cronograma,
    versionCronograma: 1,
    mediosDevolucion: ['cheque'],
    capitalCentavos: 10_000_000,
    fechaAlta: '2026-01-15',
    ingresos: [],
    renovacionDe: null,
  }

  it('crea un compromiso por cuota', () => {
    const ops = planAgendaCuotas(paraAgenda, [])
    expect(ops.map((o) => o.tipo)).toEqual(['crear', 'crear'])
    const op = ops[1]!
    if (op.tipo !== 'crear') throw new Error()
    expect(op.id).toBe(idCompromisoCuota('abc', 2))
    expect(op.datos.montoCentavos).toBe(10_100_000)
    expect(op.datos.medioPago).toBe('cheque')
  })

  it('no toca lo que ya está en la misma versión y borra lo que ya no corresponde', () => {
    const ops = planAgendaCuotas({ ...paraAgenda, cronograma: inv.cronograma.map((c) => (c.numero === 2 ? { ...c, anulada: true } : c)), versionCronograma: 2 }, [
      { id: idCompromisoCuota('abc', 1), estado: 'pendiente', montoCentavos: 100_000, pagadoCentavos: 0, versionCronograma: 2 },
      { id: idCompromisoCuota('abc', 2), estado: 'pendiente', montoCentavos: 1, pagadoCentavos: 0, versionCronograma: 1 },
    ])
    expect(ops).toEqual([{ tipo: 'borrar', id: idCompromisoCuota('abc', 2) }])
  })

  it('cuota en USD que se paga en pesos', () => {
    const usd = { ...paraAgenda, moneda: 'USD' as const, cronograma: inv.cronograma.map((c) => ({ ...c, enPesos: { centavosPorUsd: 100_000, fuente: 'pactado' as const, fecha: '2026-02-10' } })) }
    const op = planAgendaCuotas(usd, [])[0]!
    if (op.tipo !== 'crear') throw new Error()
    expect(op.datos.moneda).toBe('ARS')
    expect(op.datos.montoCentavos).toBe(100_000 * 1000)
  })

  it('borrador: nada en la Agenda', () => {
    expect(planAgendaCuotas({ ...paraAgenda, estado: 'pendiente_aprobacion' }, [])).toEqual([])
  })

  it('cobro del capital: se crea, baja con ingresos parciales y se confirma', () => {
    expect(planCobroIngreso(paraAgenda, null)).toMatchObject({ tipo: 'crear', montoCentavos: 10_000_000, confirmado: false })
    const ing = { id: 'i', medio: 'efectivo' as const, fecha: '2026-01-15', montoCentavos: 4_000_000, cuentaId: null, cajaId: 'c', chequeId: null, movimientoId: null, nota: null, registradoPor: 'u', registradoAt: '' }
    expect(planCobroIngreso({ ...paraAgenda, ingresos: [ing] }, { estado: 'esperado', montoCentavos: 10_000_000 })).toEqual({ tipo: 'actualizar_monto', montoCentavos: 6_000_000 })
    expect(planCobroIngreso({ ...paraAgenda, ingresos: [{ ...ing, montoCentavos: 10_000_000 }] }, { estado: 'esperado', montoCentavos: 6_000_000 })).toEqual({ tipo: 'confirmar', montoCentavos: 10_000_000 })
    expect(planCobroIngreso({ ...paraAgenda, renovacionDe: { capitalCentavos: 10_000_000 } }, null)).toEqual({ tipo: 'nada' })
  })
})
