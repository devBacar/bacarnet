import { describe, expect, it } from 'vitest'
import { validarCondiciones } from './condiciones.js'
import { generarCronograma } from './cronograma.js'
import { CONFIG_INVERSIONES_DEFAULT, type InversionDocumentBase } from './inversion.types.js'
import { cuotasVista, deudaHoyCentavos, kpisDe, pendienteCentavos, resumenInversion, type CompromisoDeCuota } from './vista.js'

const formulario = {
  moneda: 'USD',
  capitalCentavos: 1_200_000,
  fechaAlta: '2026-01-10',
  sistema: 'frances',
  periodicidad: 'mensual',
  cantidadCuotas: 6,
  fechaVencimiento: null,
  tasa: { tipo: 'fija', tnaPct: 0 },
  baseDias: null,
  medioIngresoPrevisto: 'transferencia',
  mediosDevolucion: ['transferencia_usd'],
  penalidadPrecancelacion: null,
}

function inversion(estado: InversionDocumentBase['estado'] = 'vigente'): InversionDocumentBase {
  const cond = validarCondiciones(formulario, CONFIG_INVERSIONES_DEFAULT)
  return {
    ...cond,
    numero: 'INV-0001',
    inversorId: 'i1',
    inversorNombre: 'Perez Ana',
    estado,
    cronograma: generarCronograma(cond),
    ingresos: [],
    aprobacion: null,
    operacionPendiente: null,
    renovacionDe: null,
    renovadaEn: null,
    versionCronograma: 1,
    indiceAlta: null,
    observaciones: null,
    importada: false,
  }
}

const pagada = (monto: number): CompromisoDeCuota => ({ estado: 'pagado', montoCentavos: monto, pagadoCentavos: monto, moneda: 'USD', comoSePago: 'Transferencia' })

describe('validarCondiciones', () => {
  it('toma base de días y penalidad de la configuración cuando vienen vacías', () => {
    const c = validarCondiciones(formulario, { ...CONFIG_INVERSIONES_DEFAULT, baseDiasDefault: 365 })
    expect(c.baseDias).toBe(365)
    expect(c.penalidadPrecancelacion).toEqual({ tipo: 'ninguna' })
    expect(c.cuotasPrevias).toBe(0)
  })

  it('explica los errores en palabras simples', () => {
    expect(() => validarCondiciones({ ...formulario, capitalCentavos: 0 }, CONFIG_INVERSIONES_DEFAULT)).toThrow('capital')
    expect(() => validarCondiciones({ ...formulario, sinVencimiento: true }, CONFIG_INVERSIONES_DEFAULT)).toThrow('Sin fecha')
    expect(() => validarCondiciones({ ...formulario, mediosDevolucion: [] }, CONFIG_INVERSIONES_DEFAULT)).toThrow('medio')
    expect(() =>
      validarCondiciones({ ...formulario, moneda: 'ARS', devolucionEnPesos: { centavosPorUsd: 100, fuente: 'mep', fecha: '2026-01-01' } }, CONFIG_INVERSIONES_DEFAULT),
    ).toThrow('dólares')
  })
})

describe('vista de una inversión', () => {
  it('6 cuotas fijas de US$ 2.000: 2 pagadas → deuda 8.000 y 1 atrasada', () => {
    const inv = inversion()
    const compromisos = new Map([
      [1, pagada(200_000)],
      [2, pagada(200_000)],
    ])
    const cuotas = cuotasVista('x', inv, compromisos, '2026-04-20')
    expect(cuotas.map((c) => c.estado)).toEqual(['pagada', 'pagada', 'atrasada', 'pendiente', 'pendiente', 'pendiente'])
    expect(cuotas[0].compromisoId).toBe('inv-x-c1')
    expect(cuotas[3].compromisoId).toBeNull()
    expect(deudaHoyCentavos(inv, cuotas, '2026-04-20')).toBe(800_000)
    expect(pendienteCentavos(cuotas)).toBe(800_000)
    const r = resumenInversion('x', inv, cuotas, '2026-04-20', 30)
    expect(r.alertas.cuotasAtrasadas).toBe(1)
    expect(r.ingresoPendienteCentavos).toBe(1_200_000)
  })

  it('un borrador no mira la Agenda ni debe nada', () => {
    const inv = inversion('borrador')
    const cuotas = cuotasVista('x', inv, new Map([[1, pagada(200_000)]]), '2026-04-20')
    expect(cuotas.every((c) => c.estado === 'pendiente' && c.compromisoId === null)).toBe(true)
    expect(deudaHoyCentavos(inv, cuotas, '2026-04-20')).toBe(0)
  })

  it('KPIs: capital vigente, para aprobar y próximos 30 días', () => {
    const vigente = inversion()
    const cv = cuotasVista('a', vigente, new Map(), '2026-01-20')
    const borrador = inversion('pendiente_aprobacion')
    const cb = cuotasVista('b', borrador, new Map(), '2026-01-20')
    const k = kpisDe(
      [
        { resumen: resumenInversion('a', vigente, cv, '2026-01-20', 30), cuotas: cv },
        { resumen: resumenInversion('b', borrador, cb, '2026-01-20', 30), cuotas: cb },
      ],
      '2026-01-20',
    )
    expect(k.capitalVigente).toEqual({ ARS: 0, USD: 1_200_000 })
    expect(k.paraAprobar).toBe(1)
    expect(k.proximos30.cantidad).toBe(1)
    expect(k.proximos30.porMoneda.USD).toBe(200_000)
  })
})
