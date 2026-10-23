import { describe, expect, it } from 'vitest'
import { validarCondiciones } from './condiciones.js'
import { generarCronograma } from './cronograma.js'
import { aplicarCuotaEnPesos, aplicarIngreso, faltaIngresar, validarIngreso } from './ingresos.js'
import { CONFIG_INVERSIONES_DEFAULT, type InversionDocumentBase } from './inversion.types.js'
import { ErrorValidacion } from './validar.js'

function inv(estado: InversionDocumentBase['estado'] = 'vigente'): InversionDocumentBase {
  const cond = validarCondiciones(
    {
      moneda: 'USD', capitalCentavos: 1_000_000, fechaAlta: '2026-01-10', sistema: 'frances', periodicidad: 'mensual',
      cantidadCuotas: 2, fechaVencimiento: null, tasa: { tipo: 'fija', tnaPct: 0 }, baseDias: null,
      medioIngresoPrevisto: 'transferencia', mediosDevolucion: ['transferencia_usd'], penalidadPrecancelacion: null,
    },
    CONFIG_INVERSIONES_DEFAULT,
  )
  return {
    ...cond, numero: 'INV-0001', inversorId: 'i1', inversorNombre: 'Perez Ana', estado, cronograma: generarCronograma(cond),
    ingresos: [], aprobacion: null, operacionPendiente: null, renovacionDe: null, renovadaEn: null, versionCronograma: 1,
    indiceAlta: null, observaciones: null, importada: false,
  }
}

const quien = { uid: 'u1', nombre: 'Ana', ahoraIso: '2026-01-10T15:00:00.000Z' }
const pedido = (monto: number, clave = 'clave-0001') =>
  validarIngreso({ clave, medio: 'transferencia', fecha: '2026-01-10', montoCentavos: monto, cuentaId: 'c1' })

describe('ingreso del capital', () => {
  it('registra en partes y la misma clave no se registra dos veces (doble clic)', () => {
    const uno = aplicarIngreso(inv(), pedido(400_000), quien, null)
    expect(uno.nuevo).toBe(true)
    expect(faltaIngresar(uno.data)).toBe(600_000)
    const repetido = aplicarIngreso(uno.data, pedido(400_000), quien, null)
    expect(repetido.nuevo).toBe(false)
    expect(repetido.data.ingresos).toHaveLength(1)
    const dos = aplicarIngreso(uno.data, pedido(600_000, 'clave-0002'), quien, null)
    expect(faltaIngresar(dos.data)).toBe(0)
  })

  it('no deja pasarse del capital ni cargar en una inversión sin aprobar', () => {
    expect(() => aplicarIngreso(inv(), pedido(1_000_001), quien, null)).toThrow('mayor')
    expect(() => aplicarIngreso(inv('pendiente_aprobacion'), pedido(1), quien, null)).toThrow('aprobada')
  })

  it('valida clave, caja en efectivo y datos del cheque; el cheque usa su fecha de pago', () => {
    expect(() => validarIngreso({ clave: 'x', medio: 'transferencia', fecha: '2026-01-10', montoCentavos: 1 })).toThrow('clave')
    expect(() => validarIngreso({ clave: 'clave-0001', medio: 'efectivo', fecha: '2026-01-10', montoCentavos: 1 })).toThrow('caja')
    expect(() => validarIngreso({ clave: 'clave-0001', medio: 'cheque', montoCentavos: 1, cheque: { tipo: 'echeq' } })).toThrow(ErrorValidacion)
    const p = validarIngreso({
      clave: 'clave-0001', medio: 'cheque', montoCentavos: 1, fecha: '2026-01-01',
      cheque: { tipo: 'echeq', numero: '123', emisor: 'Perez', fechaPago: '2026-02-01' },
    })
    expect(p.fecha).toBe('2026-02-01')
    expect(p.cheque?.numero).toBe('123')
  })
})

describe('cuota en USD que se paga en pesos', () => {
  it('marca la cuota con el tipo de cambio y sube la versión; con null vuelve a dólares', () => {
    const tc = { centavosPorUsd: 155_000, fuente: 'pactado', fecha: '2026-02-01' }
    const enPesos = aplicarCuotaEnPesos(inv(), 1, tc)
    expect(enPesos.cronograma[0].enPesos).toEqual(tc)
    expect(enPesos.versionCronograma).toBe(2)
    expect(aplicarCuotaEnPesos(enPesos, 1, null).cronograma[0].enPesos).toBeNull()
  })

  it('solo en dólares y en vigentes', () => {
    expect(() => aplicarCuotaEnPesos({ ...inv(), moneda: 'ARS' }, 1, null)).toThrow('dólares')
    expect(() => aplicarCuotaEnPesos(inv('borrador'), 1, null)).toThrow('vigentes')
    expect(() => aplicarCuotaEnPesos(inv(), 9, null)).toThrow('cuota')
  })
})

describe('sin vencimiento: extender el cronograma', () => {
  it('agrega las cuotas que faltan sin tocar las que estaban', async () => {
    const { extenderSinVencimiento } = await import('./ingresos.js')
    const base = { ...inv(), sinVencimiento: true }
    const enPesos = { ...base, cronograma: base.cronograma.map((c, i) => (i === 0 ? { ...c, enPesos: { centavosPorUsd: 1, fuente: 'mep' as const, fecha: '2026-01-01' } } : c)) }
    const regenerado = [...base.cronograma, { ...base.cronograma[1], numero: 3, fechaVencimiento: '2026-04-10' }]
    const ext = extenderSinVencimiento(enPesos, regenerado)!
    expect(ext.cronograma).toHaveLength(3)
    expect(ext.cronograma[0].enPesos?.fuente).toBe('mep')
    expect(ext.versionCronograma).toBe(2)
    expect(extenderSinVencimiento(enPesos, base.cronograma)).toBeNull()
  })
})
