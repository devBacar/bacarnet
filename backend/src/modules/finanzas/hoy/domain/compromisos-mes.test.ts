import { describe, expect, it } from 'vitest'
import type { CompromisoParaPlanilla } from './compromisos-mes.js'
import {
  armarColumnasMes,
  armarPlanillaMes,
  arsConvertido,
  clasificarDia,
  ubicarPlanificado,
} from './compromisos-mes.js'
import { feriadosNacionales2026 } from './feriados-nacionales-2026.js'

const feriados = feriadosNacionales2026()

function compromiso(parcial: Partial<CompromisoParaPlanilla> & Pick<CompromisoParaPlanilla, 'id'>): CompromisoParaPlanilla {
  return {
    concepto: parcial.concepto ?? parcial.id,
    proveedorONombre: parcial.proveedorONombre ?? 'Alguien',
    montoCentavos: parcial.montoCentavos ?? 10_000,
    fechaVencimiento: parcial.fechaVencimiento ?? '2026-09-10',
    fechaPago: parcial.fechaPago ?? null,
    estado: parcial.estado ?? 'pendiente',
    medioPago: parcial.medioPago ?? 'transferencia',
    grupo: parcial.grupo ?? 'Otros egresos',
    moneda: parcial.moneda ?? 'ARS',
    deudaTotalCentavos: parcial.deudaTotalCentavos ?? null,
    cuotaNumero: parcial.cuotaNumero ?? null,
    cuotaTotal: parcial.cuotaTotal ?? null,
    observacion: parcial.observacion ?? null,
    pagos: parcial.pagos ?? [],
    ...parcial,
  }
}

describe('columnas del mes', () => {
  it('junta cada finde en una sola columna y marca hoy', () => {
    const columnas = armarColumnasMes('2026-09', '2026-09-06', feriados)
    const finde = columnas.find((columna) => columna.fechas.includes('2026-09-05'))
    expect(finde).toMatchObject({
      fecha: '2026-09-05',
      tipo: 'finde',
      esHoy: true,
      fechas: ['2026-09-05', '2026-09-06'],
    })
    expect(columnas.filter((columna) => columna.tipo === 'finde')).toHaveLength(4)
    expect(columnas.some((columna) => columna.fecha === '2026-09-06')).toBe(false)
  })

  it('un feriado que cae sábado queda en la columna Finde', () => {
    expect(clasificarDia('2026-06-20', feriados)).toBe('finde')
    expect(clasificarDia('2026-06-15', feriados)).toBe('feriado')
    const columnas = armarColumnasMes('2026-06', '2026-06-15', feriados)
    const guemes = columnas.find((columna) => columna.fecha === '2026-06-15')
    const bandera = columnas.find((columna) => columna.fechas.includes('2026-06-20'))
    expect(guemes).toMatchObject({ tipo: 'feriado', esHoy: true })
    expect(bandera?.tipo).toBe('finde')
  })
})

describe('planificado, acumulado y totales', () => {
  const columnasSeptiembre = armarColumnasMes('2026-09', '2026-09-10', feriados)

  it('corre el vencimiento de finde o feriado al hábil anterior', () => {
    expect(ubicarPlanificado('2026-09-05', columnasSeptiembre, feriados)).toEqual({
      fecha: '2026-09-04',
      corrido: true,
    })
    expect(ubicarPlanificado('2026-09-04', columnasSeptiembre, feriados)).toEqual({
      fecha: '2026-09-04',
      corrido: false,
    })
    const junio = armarColumnasMes('2026-06', '2026-06-12', feriados)
    expect(ubicarPlanificado('2026-06-15', junio, feriados)).toEqual({
      fecha: '2026-06-12',
      corrido: true,
    })
  })

  it('si el hábil anterior es del mes previo, lo anota en el primer hábil', () => {
    const enero = armarColumnasMes('2026-01', '2026-01-02', feriados)
    expect(ubicarPlanificado('2026-01-01', enero, feriados)).toEqual({
      fecha: '2026-01-02',
      corrido: true,
    })
  })

  it('un pago parcial deja diferencia y el domingo entra en la columna Finde', () => {
    const planilla = armarPlanillaMes({
      mes: '2026-09',
      hoy: '2026-09-10',
      tipoCambio: null,
      feriados,
      compromisos: [
        compromiso({
          id: 'parcial',
          fechaVencimiento: '2026-09-10',
          montoCentavos: 10_000,
          grupo: 'Impositivo',
          cuotaNumero: 13,
          cuotaTotal: 20,
          pagos: [
            {
              fecha: '2026-09-06',
              montoCentavos: 4_000,
              medio: 'efectivo',
              referenciaId: null,
              registradoPor: 'ana',
              registradoAt: null,
            },
          ],
        }),
      ],
    })
    const fila = planilla.grupos.find((grupo) => grupo.grupo === 'Impositivo')?.filas[0]
    expect(fila).toMatchObject({
      cuota: '13 de 20',
      acumuladoCentavos: 4_000,
      diferenciaCentavos: 6_000,
      estado: 'pendiente',
    })
    expect(fila?.porDia['2026-09-10']).toMatchObject({ planificadoCentavos: 10_000, corrido: false })
    expect(fila?.porDia['2026-09-05']).toMatchObject({ pagadoCentavos: 4_000 })
    expect(planilla.totalEgresosPorDia['2026-09-05']).toMatchObject({ ars: 4_000, usd: 0 })
  })

  it('un pagado viejo sin pagos cuenta el importe completo en su fecha de pago', () => {
    const planilla = armarPlanillaMes({
      mes: '2026-09',
      hoy: '2026-09-01',
      tipoCambio: null,
      feriados,
      compromisos: [
        compromiso({
          id: 'legacy',
          estado: 'pagado',
          fechaVencimiento: '2026-09-10',
          fechaPago: '2026-09-11',
          montoCentavos: 8_000,
          pagos: [],
        }),
      ],
    })
    const fila = planilla.grupos.find((grupo) => grupo.grupo === 'Otros egresos')?.filas[0]
    expect(fila).toMatchObject({
      acumuladoCentavos: 8_000,
      diferenciaCentavos: 0,
      estado: 'pagado',
    })
    expect(fila?.porDia['2026-09-11']?.pagadoCentavos).toBe(8_000)
  })

  it('convierte el subtotal en dólares con el tipo de cambio y separa las monedas', () => {
    expect(arsConvertido(10_000, 100, 1550)).toBe(10_000 + 155_000)
    const planilla = armarPlanillaMes({
      mes: '2026-09',
      hoy: '2026-09-04',
      tipoCambio: 1550,
      feriados,
      compromisos: [
        compromiso({
          id: 'pesos',
          grupo: 'Bancos',
          moneda: 'ARS',
          fechaVencimiento: '2026-09-04',
          montoCentavos: 10_000,
          estado: 'pagado',
          fechaPago: '2026-09-04',
          pagos: [],
        }),
        compromiso({
          id: 'dolares',
          grupo: 'Inversores USD',
          moneda: 'USD',
          fechaVencimiento: '2026-09-04',
          montoCentavos: 100,
          pagos: [
            {
              fecha: '2026-09-04',
              montoCentavos: 100,
              medio: 'transferencia',
              referenciaId: null,
              registradoPor: 'ana',
              registradoAt: null,
            },
          ],
          estado: 'pagado',
        }),
        compromiso({
          id: 'otro-mes',
          fechaVencimiento: '2026-10-05',
          montoCentavos: 99_000,
        }),
      ],
    })
    expect(planilla.grupos.map((grupo) => grupo.grupo)[0]).toBe('Inversores USD')
    expect(planilla.grupos.find((grupo) => grupo.grupo === 'Inversores USD')?.subtotal.importe).toEqual({
      ars: 0,
      usd: 100,
    })
    expect(planilla.totalEgresosPorDia['2026-09-04']).toEqual({
      ars: 10_000,
      usd: 100,
      arsConvertido: 165_000,
    })
    expect(planilla.grupos.every((grupo) => grupo.filas.every((fila) => fila.compromisoId !== 'otro-mes'))).toBe(
      true,
    )
  })

  it('un grupo desconocido cae en Otros egresos', () => {
    const planilla = armarPlanillaMes({
      mes: '2026-09',
      hoy: '2026-09-01',
      tipoCambio: null,
      feriados,
      compromisos: [compromiso({ id: 'raro', grupo: 'Proveedores' })],
    })
    expect(planilla.grupos.find((grupo) => grupo.grupo === 'Otros egresos')?.filas).toHaveLength(1)
  })
})

describe('arrastre de meses anteriores', () => {
  const pago = (fecha: string, montoCentavos: number) => ({
    fecha,
    montoCentavos,
    medio: 'transferencia' as const,
    referenciaId: null,
    registradoPor: 'ana',
    registradoAt: null,
  })

  it('muestra lo vencido de antes que sigue sin pagar, y no lo que ya se pagó', () => {
    const planilla = armarPlanillaMes({
      mes: '2026-10',
      hoy: '2026-10-01',
      tipoCambio: null,
      feriados,
      compromisos: [
        compromiso({
          id: 'viejo',
          grupo: 'Préstamos bancarios',
          fechaVencimiento: '2026-09-15',
          montoCentavos: 50_000,
        }),
        compromiso({
          id: 'viejo-usd',
          grupo: 'Inversores USD',
          moneda: 'USD',
          fechaVencimiento: '2026-08-03',
          montoCentavos: 200,
          pagos: [pago('2026-08-03', 50)],
        }),
        compromiso({
          id: 'viejo-pago',
          fechaVencimiento: '2026-09-01',
          estado: 'pagado',
          fechaPago: '2026-09-02',
          pagos: [],
        }),
        compromiso({
          id: 'de-octubre',
          grupo: 'Impositivo',
          fechaVencimiento: '2026-10-05',
          montoCentavos: 10_000,
        }),
      ],
    })

    const prestamo = planilla.grupos.find((grupo) => grupo.grupo === 'Préstamos bancarios')?.filas[0]
    expect(prestamo).toMatchObject({
      compromisoId: 'viejo',
      deMesAnterior: true,
      arrastreCentavos: 50_000,
      diferenciaCentavos: 50_000,
      porDia: {},
    })
    const dolares = planilla.grupos.find((grupo) => grupo.grupo === 'Inversores USD')
    expect(dolares?.filas[0]).toMatchObject({ deMesAnterior: true, arrastreCentavos: 150 })
    expect(dolares?.subtotal.arrastre).toEqual({ ars: 0, usd: 150 })
    expect(planilla.grupos.find((grupo) => grupo.grupo === 'Préstamos bancarios')?.subtotal.arrastre).toEqual({
      ars: 50_000,
      usd: 0,
    })
    expect(planilla.arrastreCentavos).toEqual({ ars: 50_000, usd: 150 })
    expect(planilla.grupos.every((grupo) => grupo.filas.every((fila) => fila.compromisoId !== 'viejo-pago'))).toBe(true)
    expect(planilla.grupos.find((grupo) => grupo.grupo === 'Impositivo')?.filas[0]).toMatchObject({
      compromisoId: 'de-octubre',
      deMesAnterior: false,
      arrastreCentavos: 0,
    })
  })

  it('un vencido anterior con un pago en el mes entra una sola vez', () => {
    const planilla = armarPlanillaMes({
      mes: '2026-10',
      hoy: '2026-10-06',
      tipoCambio: null,
      feriados,
      compromisos: [
        compromiso({
          id: 'parcial-viejo',
          fechaVencimiento: '2026-09-10',
          montoCentavos: 10_000,
          pagos: [pago('2026-10-05', 4_000)],
        }),
      ],
    })
    const filas = planilla.grupos.flatMap((grupo) => grupo.filas).filter((fila) => fila.compromisoId === 'parcial-viejo')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      deMesAnterior: true,
      arrastreCentavos: 6_000,
      acumuladoCentavos: 4_000,
      diferenciaCentavos: 6_000,
    })
    expect(filas[0]?.porDia['2026-10-05']?.pagadoCentavos).toBe(4_000)
    expect(planilla.arrastreCentavos).toEqual({ ars: 6_000, usd: 0 })
  })
})
