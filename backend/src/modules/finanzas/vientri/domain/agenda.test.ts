import { describe, expect, it } from 'vitest'
import { datosDesdePendiente, planAgenda, type ExistenteAgenda } from './agenda.js'
import type { PlazosHistoricos } from './plazos.js'
import type { VientriPendienteDoc } from './tipos.js'

function pend(p: Partial<VientriPendienteDoc>): VientriPendienteDoc {
  return {
    clave: 'c1', vientriId: 1, lado: 'pagar', tipoId: 1, tipo: 'FCG', comprobante: 'FCG A 0001-00000001',
    persona: { vientriId: 5, nombre: 'Proveedor Ficticio SRL', cuit: '30000000007' }, fecha: '2026-09-20',
    fechaVencimiento: '2026-10-20', totalCentavos: 1_000_00, pendienteCentavos: 1_000_00, divisaId: 1, moneda: null,
    cotizacion: 1, fechaProntoPago: null, descuentoProntoPago: null, cuotas: null, prestamo: false, revisar: [],
    fecsys: null, ...p,
  }
}

function ex(p: Partial<ExistenteAgenda>): ExistenteAgenda {
  return {
    id: 'vientri-c1', abierto: true, cerradoPorVientri: false, fecha: '2026-10-20', fechaVientri: '2026-10-20',
    montoCentavos: 1_000_00, concepto: 'FCG A 0001-00000001', nombre: 'Proveedor Ficticio SRL', moneda: 'ARS', ...p,
  }
}

const base = { lado: 'pagar' as const, fechaDatos: '2026-10-19T02:00:00' }

describe('datosDesdePendiente', () => {
  it('arma grupo y moneda', () => {
    expect(datosDesdePendiente(pend({ tipo: 'IMP' }), base.fechaDatos).grupo).toBe('Impositivo')
    expect(datosDesdePendiente(pend({}), base.fechaDatos).grupo).toBe('Proveedores')
    expect(datosDesdePendiente(pend({ moneda: 'US' }), base.fechaDatos).moneda).toBe('USD')
    expect(datosDesdePendiente(pend({ fechaVencimiento: null }), base.fechaDatos).fecha).toBe('2026-09-20')
  })
})

describe('fecha estimada', () => {
  const plazos: PlazosHistoricos = {
    porPersona: { pagar: new Map([[5, 40]]), cobrar: new Map() },
    general: { pagar: 15, cobrar: 25 },
  }

  it('suma el plazo a la fecha de la factura solo si Vientri no tiene vencimiento', () => {
    const sin = datosDesdePendiente(pend({ fechaVencimiento: null }), base.fechaDatos, { dias: 40, origen: 'historia' })
    expect(sin.fecha).toBe('2026-10-30')
    expect(sin.vientri).toMatchObject({
      fechaVencimiento: '2026-10-30', sinFechaDePago: true, fechaEstimada: true, plazoDias: 40, plazoOrigen: 'historia',
    })
    const igual = datosDesdePendiente(pend({ fechaVencimiento: '2026-09-20' }), base.fechaDatos, { dias: 40, origen: 'general' })
    expect(igual.vientri.fechaEstimada).toBe(true)
    const con = datosDesdePendiente(pend({}), base.fechaDatos, { dias: 40, origen: 'historia' })
    expect(con.fecha).toBe('2026-10-20')
    expect(con.vientri).toMatchObject({ sinFechaDePago: false, fechaEstimada: false, plazoDias: null, plazoOrigen: null })
    const sinPlazo = datosDesdePendiente(pend({ fechaVencimiento: null }), base.fechaDatos)
    expect(sinPlazo.fecha).toBe('2026-09-20')
    expect(sinPlazo.vientri.fechaEstimada).toBe(false)
  })

  it('planAgenda usa el plazo de la persona o el general', () => {
    const r = planAgenda({
      ...base,
      enVentana: [
        pend({ fechaVencimiento: null }),
        pend({ clave: 'c2', persona: { vientriId: 99, nombre: 'Otro Ficticio SA', cuit: null }, fechaVencimiento: null }),
      ],
      clavesConSaldo: new Set(['c1', 'c2']),
      existentes: [],
      plazos,
    })
    expect(r.operaciones).toEqual([
      expect.objectContaining({ datos: expect.objectContaining({ fecha: '2026-10-30' }) }),
      expect.objectContaining({ datos: expect.objectContaining({ fecha: '2026-10-05' }) }),
    ])
  })

  it('si la estimación cambia actualiza la fecha, salvo que Finanzas la haya reprogramado', () => {
    const enVentana = [pend({ fechaVencimiento: null })]
    const comun = { ...base, enVentana, clavesConSaldo: new Set(['c1']), plazos }
    const noTocada = planAgenda({ ...comun, existentes: [ex({ fecha: '2026-10-10', fechaVientri: '2026-10-10' })] })
    expect(noTocada.operaciones).toEqual([expect.objectContaining({ tipo: 'actualizar', cambiarFecha: true })])
    const reprogramada = planAgenda({ ...comun, existentes: [ex({ fecha: '2026-12-01', fechaVientri: '2026-10-10' })] })
    expect(reprogramada.operaciones).toEqual([expect.objectContaining({ tipo: 'actualizar', cambiarFecha: false })])
  })
})

describe('planAgenda', () => {
  it('crea lo nuevo y no toca lo que no cambió', () => {
    const r = planAgenda({ ...base, enVentana: [pend({}), pend({ clave: 'c2' })], clavesConSaldo: new Set(['c1', 'c2']), existentes: [ex({})] })
    expect(r.operaciones).toEqual([expect.objectContaining({ tipo: 'crear', id: 'vientri-c2', posibleDuplicado: null })])
  })

  it('actualiza el saldo y la fecha si nadie la reprogramó', () => {
    const r = planAgenda({
      ...base,
      enVentana: [pend({ pendienteCentavos: 400_00, fechaVencimiento: '2026-10-25' })],
      clavesConSaldo: new Set(['c1']),
      existentes: [ex({})],
    })
    expect(r.operaciones).toEqual([expect.objectContaining({ tipo: 'actualizar', cambiarFecha: true })])
  })

  it('respeta la fecha reprogramada en Bacarnet', () => {
    const r = planAgenda({
      ...base,
      enVentana: [pend({ fechaVencimiento: '2026-10-25' })],
      clavesConSaldo: new Set(['c1']),
      existentes: [ex({ fecha: '2026-11-05' })],
    })
    expect(r.operaciones).toEqual([expect.objectContaining({ tipo: 'actualizar', cambiarFecha: false })])
  })

  it('cierra lo que ya no tiene saldo, pero no lo que solo quedó fuera de los 12 meses', () => {
    const r = planAgenda({
      ...base,
      enVentana: [],
      clavesConSaldo: new Set(['viejo']),
      existentes: [ex({ id: 'vientri-c1' }), ex({ id: 'vientri-viejo' })],
    })
    expect(r.operaciones).toEqual([{ tipo: 'cerrar', id: 'vientri-c1' }])
  })

  it('reabre si lo cerró Vientri y volvió a tener saldo; respeta el cierre manual', () => {
    const r1 = planAgenda({ ...base, enVentana: [pend({})], clavesConSaldo: new Set(['c1']), existentes: [ex({ abierto: false, cerradoPorVientri: true })] })
    expect(r1.operaciones[0]?.tipo).toBe('reabrir')
    const r2 = planAgenda({ ...base, enVentana: [pend({})], clavesConSaldo: new Set(['c1']), existentes: [ex({ abierto: false })] })
    expect(r2.operaciones).toEqual([])
  })

  it('no mete saldos negativos (notas de crédito) ni el otro lado', () => {
    const r = planAgenda({
      ...base,
      enVentana: [pend({ pendienteCentavos: -50_00 }), pend({ clave: 'cc', lado: 'cobrar' })],
      clavesConSaldo: new Set(),
      existentes: [],
    })
    expect(r.operaciones).toEqual([])
    expect(r.saldosNegativos).toEqual({ cantidad: 1, centavos: -50_00 })
  })
})

describe('posibles duplicados con lo cargado a mano', () => {
  it('avisa si hay uno a mano con el mismo importe y fecha cercana', () => {
    const r = planAgenda({
      ...base,
      enVentana: [pend({ fechaVencimiento: '2026-10-20' }), pend({ clave: 'c3', pendienteCentavos: 7_00 })],
      clavesConSaldo: new Set(['c1', 'c3']),
      existentes: [],
      manuales: [{ id: 'm1', fecha: '2026-10-10', montoCentavos: 1_000_00, descripcion: 'Alquiler - Inmobiliaria' }],
    })
    expect(r.posiblesDuplicados).toBe(1)
    expect(r.operaciones[0]).toEqual(expect.objectContaining({ posibleDuplicado: { id: 'm1', descripcion: 'Alquiler - Inmobiliaria' } }))
  })
})

describe('fechas de pago, impuestos y residuos', () => {
  it('marca sin fecha de pago cuando el vencimiento de Vientri es la fecha de la factura', () => {
    expect(datosDesdePendiente(pend({ fecha: '2026-09-20', fechaVencimiento: '2026-09-20' }), base.fechaDatos).vientri.sinFechaDePago).toBe(true)
    expect(datosDesdePendiente(pend({ fechaVencimiento: null }), base.fechaDatos).vientri.sinFechaDePago).toBe(true)
    expect(datosDesdePendiente(pend({}), base.fechaDatos).vientri.sinFechaDePago).toBe(false)
  })
  it('manda los impuestos a Impositivo aunque Vientri traiga el nombre', () => {
    expect(datosDesdePendiente(pend({ tipo: 'Impuesto' }), base.fechaDatos).grupo).toBe('Impositivo')
  })
  it('no carga restos de redondeo', () => {
    const r = planAgenda({ ...base, enVentana: [pend({ pendienteCentavos: 4 })], clavesConSaldo: new Set(['c1']), existentes: [] })
    expect(r.operaciones).toEqual([])
    expect(r.residuos).toBe(1)
  })
  it('cierra un resto de redondeo que ya estaba cargado', () => {
    const r = planAgenda({ ...base, enVentana: [pend({ pendienteCentavos: 4 })], clavesConSaldo: new Set(['c1']), existentes: [ex({})] })
    expect(r.operaciones).toEqual([{ tipo: 'cerrar', id: 'vientri-c1' }])
  })
})
