import { describe, expect, it } from 'vitest'
import { formatoPesos, formatoPesosCorto } from './hoy.fechas.js'
import type { ArmarHoyInput, CobroHoy, CompromisoHoy, CuentaHoy, MovimientoHoy, TransferenciaHoy } from './hoy.tipos.js'
import {
  armarVistaHoy,
  avisoDescubierto,
  creditoConfirmaCobro,
  listarCobrosAtrasados,
  transferenciasSinFirmar,
} from './hoy.vista.js'

const NOW = new Date('2026-09-30T15:00:00.000Z')
const HOY = '2026-09-30'

function compromiso(partial: Partial<CompromisoHoy> & Pick<CompromisoHoy, 'id' | 'fechaVencimiento' | 'montoCentavos'>): CompromisoHoy {
  return {
    concepto: 'Factura',
    proveedorONombre: 'Proveedor',
    urgencia: null,
    medioPago: 'transferencia',
    estado: 'pendiente',
    cuentaId: null,
    ...partial,
  }
}

function cobro(partial: Partial<CobroHoy> & Pick<CobroHoy, 'id' | 'fechaEsperada' | 'montoCentavos'>): CobroHoy {
  return {
    clienteONombre: 'Cliente',
    concepto: null,
    estado: 'esperado',
    cuit: null,
    email: null,
    contraparte: null,
    ...partial,
  }
}

function credito(partial: Partial<MovimientoHoy> & Pick<MovimientoHoy, 'id' | 'montoCentavos'>): MovimientoHoy {
  return {
    cuentaId: 'cordoba-cc',
    bancoNombre: 'Córdoba',
    tipo: 'credito',
    fechaProceso: HOY,
    customerCuit: null,
    depositorDescription: null,
    descripcion: 'Crédito',
    reservado: false,
    ...partial,
  }
}

function cuenta(partial: Partial<CuentaHoy> & Pick<CuentaHoy, 'id' | 'bancoNombre' | 'saldoActualCentavos'>): CuentaHoy {
  return {
    tipo: 'CC',
    moneda: 'ARS',
    descubiertoCentavos: null,
    ...partial,
  }
}

function base(overrides: Partial<ArmarHoyInput> = {}): ArmarHoyInput {
  return {
    now: NOW,
    compromisos: [],
    cobros: [],
    movimientos: [],
    cuentas: [],
    transferencias: [],
    cheques: [],
    ...overrides,
  }
}

describe('hoy: pagos de hoy y vencidos', () => {
  it('deja arriba los vencidos y deja afuera lo pagado, lo futuro y lo ya armado', () => {
    const vista = armarVistaHoy(
      base({
        compromisos: [
          compromiso({
            id: 'hoy',
            fechaVencimiento: HOY,
            montoCentavos: 1_000,
            proveedorONombre: 'Hoy SA',
            urgencia: 'baja',
          }),
          compromiso({
            id: 'viejo',
            fechaVencimiento: '2026-09-27',
            montoCentavos: 3_000,
            proveedorONombre: 'Viejo SA',
            estado: 'vencido',
          }),
          compromiso({
            id: 'futuro',
            fechaVencimiento: '2026-10-06',
            montoCentavos: 9_000,
            proveedorONombre: 'Futuro SA',
          }),
          compromiso({
            id: 'pagado',
            fechaVencimiento: HOY,
            montoCentavos: 500,
            estado: 'pagado',
          }),
          compromiso({
            id: 'armada',
            fechaVencimiento: HOY,
            montoCentavos: 700,
            estado: 'confeccionada_pendiente_autorizacion',
          }),
        ],
      }),
    )

    expect(vista.saludo).toBe('Buen día. Hoy es miércoles 30 de septiembre.')
    expect(vista.pagos.filas.map((fila) => fila.id)).toEqual(['hoy'])
    expect(vista.pagos.filas[0]?.vencido).toBe(false)
    expect(vista.pagos.totalCentavos).toBe(1_000)
    // Lo atrasado va aparte y no suma en el día.
    expect(vista.pagosAtrasados.filas.map((fila) => fila.id)).toEqual(['viejo'])
    expect(vista.pagosAtrasados.filas[0]).toMatchObject({
      vencido: true,
      vencidoTexto: 'Venció hace 3 días',
      comoPagar: 'Por banco',
    })
    expect(vista.pagosAtrasados.totalCentavos).toBe(3_000)
    expect(vista.dia.pagosCentavos).toBe(1_000)
  })

  it('pagos atrasados: solo lo que se paga por transferencia (cheque y efectivo van a Compromisos de la semana)', () => {
    const vista = armarVistaHoy(
      base({
        compromisos: [
          compromiso({ id: 'banco', fechaVencimiento: '2026-09-27', montoCentavos: 1_000, medioPago: 'transferencia' }),
          compromiso({ id: 'cheque', fechaVencimiento: '2026-09-27', montoCentavos: 2_000, medioPago: 'cheque' }),
          compromiso({ id: 'efectivo', fechaVencimiento: '2026-09-27', montoCentavos: 3_000, medioPago: 'efectivo' }),
        ],
      }),
    )
    expect(vista.pagosAtrasados.filas.map((fila) => fila.id)).toEqual(['banco'])
    expect(vista.pagosAtrasados.totalCentavos).toBe(1_000)
  })

  it('separa las facturas de Vientri sin fecha de pago', () => {
    const vista = armarVistaHoy(
      base({
        compromisos: [
          compromiso({ id: 'sin', fechaVencimiento: '2026-01-10', montoCentavos: 2_000, sinFecha: true }),
          compromiso({ id: 'hoy', fechaVencimiento: HOY, montoCentavos: 1_000 }),
        ],
      }),
    )
    expect(vista.pagos.filas.map((f) => f.id)).toEqual(['hoy'])
    expect(vista.pagosAtrasados.filas).toEqual([])
    expect(vista.pagosSinFecha.filas.map((f) => f.id)).toEqual(['sin'])
    expect(vista.pagosSinFecha.filas[0]?.vencido).toBe(false)
  })
})

describe('hoy: confirmación de cobros', () => {
  const esperado = cobro({
    id: 'c1',
    fechaEsperada: HOY,
    montoCentavos: 25_000,
    clienteONombre: 'Acme',
    cuit: '20-12345678-6',
    contraparte: 'Acme',
    email: 'pago@acme.com',
  })

  it('marca que llegó solo si el crédito de hoy coincide en monto, CUIT y contraparte', () => {
    expect(
      creditoConfirmaCobro(
        esperado,
        credito({
          id: 'm1',
          montoCentavos: 25_000,
          customerCuit: '20123456786',
          depositorDescription: 'Pago ACME SA',
        }),
        HOY,
      ),
    ).toBe(true)
    expect(
      creditoConfirmaCobro(
        esperado,
        credito({ id: 'm2', montoCentavos: 25_000, customerCuit: '27999999995', depositorDescription: 'Acme' }),
        HOY,
      ),
    ).toBe(false)
    expect(
      creditoConfirmaCobro(
        esperado,
        credito({ id: 'm3', montoCentavos: 25_000, customerCuit: '20123456786', depositorDescription: 'Otro' }),
        HOY,
      ),
    ).toBe(false)
  })

  it('no reutiliza el mismo crédito para dos cobros del mismo monto', () => {
    const vista = armarVistaHoy(
      base({
        cobros: [
          cobro({ id: 'primero', fechaEsperada: '2026-09-28', montoCentavos: 10_000, clienteONombre: 'Uno' }),
          cobro({ id: 'segundo', fechaEsperada: HOY, montoCentavos: 10_000, clienteONombre: 'Dos' }),
        ],
        movimientos: [credito({ id: 'unico', montoCentavos: 10_000, bancoNombre: 'Córdoba' })],
      }),
    )
    const llegaron = vista.ingresos.filas.filter((fila) => fila.llego)
    expect(llegaron).toHaveLength(1)
    expect(llegaron[0]).toMatchObject({ id: 'primero', bancoNombre: 'Córdoba', movimientoId: 'unico' })
    expect(vista.ingresos.filas.find((fila) => fila.id === 'segundo')?.llego).toBe(false)
  })
})

describe('hoy: cuenta del día y descubierto', () => {
  const julio = cuenta({
    id: 'julio',
    bancoNombre: 'Julio',
    saldoActualCentavos: 1_000_000_000,
    descubiertoCentavos: 500_000_000,
  })
  const cordoba = cuenta({
    id: 'cordoba',
    bancoNombre: 'Córdoba',
    saldoActualCentavos: 3_000_000_000,
    descubiertoCentavos: 1_000_000_000,
  })

  it('resta los pagos de hoy y suma solo los cobros que todavía no llegaron', () => {
    const vista = armarVistaHoy(
      base({
        cuentas: [julio, cordoba, cuenta({ id: 'usd', bancoNombre: 'Julio', saldoActualCentavos: 999, tipo: 'USD', moneda: 'USD' })],
        compromisos: [compromiso({ id: 'p', fechaVencimiento: HOY, montoCentavos: 2_000_000_000 })],
        cobros: [
          cobro({ id: 'llego', fechaEsperada: HOY, montoCentavos: 100_000, clienteONombre: 'Ya' }),
          cobro({ id: 'falta', fechaEsperada: HOY, montoCentavos: 300_000, clienteONombre: 'Falta' }),
        ],
        movimientos: [credito({ id: 'cred', montoCentavos: 100_000 })],
      }),
    )
    expect(vista.dia.saldoInicialCentavos).toBe(4_000_000_000)
    expect(vista.dia.pagosCentavos).toBe(2_000_000_000)
    expect(vista.dia.cobrosCentavos).toBe(300_000)
    expect(vista.dia.saldoFinalCentavos).toBe(2_000_300_000)
    expect(vista.dia.frase).toBe(
      `Hoy arrancaste con ${formatoPesos(4_000_000_000)}. Si pagás lo de hoy y entra lo esperado, terminás en ${formatoPesos(2_000_300_000)}.`,
    )
  })

  it('avisa el banco que se pasa del descubierto y sugiere el que tiene margen', () => {
    const bancos = [
      {
        bancoNombre: 'Julio',
        saldoAhoraCentavos: 1_000_000_000,
        descubiertoCentavos: 500_000_000,
        quedaParaUsarCentavos: 1_500_000_000,
      },
      {
        bancoNombre: 'Córdoba',
        saldoAhoraCentavos: 3_000_000_000,
        descubiertoCentavos: 1_000_000_000,
        quedaParaUsarCentavos: 4_000_000_000,
      },
    ]
    const pagos = 2_000_000_000
    expect(formatoPesosCorto(500_000_000)).toBe('$5 M')
    expect(avisoDescubierto(bancos, pagos)).toBe(
      'Ojo: si pagás todo desde Julio, te pasás $5 M del descubierto. Pagá desde Córdoba, que tiene margen.',
    )
  })
})

describe('hoy: semana, atrasos y firmas', () => {
  it('arma 7 días hábiles, acumula el saldo y marca el día que más se paga', () => {
    const vista = armarVistaHoy(
      base({
        cuentas: [cuenta({ id: 'cc', bancoNombre: 'Córdoba', saldoActualCentavos: 10_000_000 })],
        compromisos: [
          compromiso({ id: 'hoy', fechaVencimiento: HOY, montoCentavos: 1_000_000 }),
          compromiso({ id: 'jueves', fechaVencimiento: '2026-10-01', montoCentavos: 8_000_000, proveedorONombre: 'Pesado' }),
          compromiso({ id: 'lejos', fechaVencimiento: '2026-10-20', montoCentavos: 50_000_000 }),
        ],
        cobros: [cobro({ id: 'viernes', fechaEsperada: '2026-10-02', montoCentavos: 2_000_000 })],
      }),
    )
    expect(vista.prevision.semana?.map((fila) => fila.fecha)).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ])
    const jueves = vista.prevision.semana?.find((fila) => fila.fecha === '2026-10-01')
    expect(jueves).toMatchObject({ aPagarCentavos: 8_000_000, esElMasPesado: true })
    expect(vista.prevision.diaMasPesado).toBe(
      `El jueves es el día más pesado: pagás ${formatoPesos(8_000_000)}.`,
    )
    const viernes = vista.prevision.semana?.find((fila) => fila.fecha === '2026-10-02')
    expect(viernes?.aCobrarCentavos).toBe(2_000_000)
    expect(viernes?.quedaCentavos).toBe(10_000_000 - 1_000_000 - 8_000_000 + 2_000_000)
  })

  it('lista todos los cobros atrasados, del mayor al menor', () => {
    const cobros = [
      cobro({ id: 'chico', fechaEsperada: '2026-09-20', montoCentavos: 100, clienteONombre: 'Chico' }),
      cobro({ id: 'grande', fechaEsperada: '2026-09-10', montoCentavos: 9_000, clienteONombre: 'Grande', email: 'a@b.com' }),
      cobro({ id: 'recien', fechaEsperada: '2026-09-28', montoCentavos: 50_000 }),
      cobro({ id: 'cobrado', fechaEsperada: '2026-09-01', montoCentavos: 80_000, estado: 'confirmado' }),
    ]
    const lista = listarCobrosAtrasados(cobros, HOY, new Set())
    expect(lista.map((row) => row.id)).toEqual(['recien', 'grande', 'chico'])
    expect(lista[1]).toMatchObject({ haceDias: 20, haceTexto: 'Hace 20 días', email: 'a@b.com' })
    expect(lista[1]?.textoReclamo).toContain('Grande')
    expect(lista[1]?.textoReclamo).toContain('Bacar')
  })

  it('avisa transferencias que siguen en Falta firmar hace más de 2 horas', () => {
    const hace3h = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString()
    const haceMedia = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString()
    const transferencia = (partial: Partial<TransferenciaHoy> & Pick<TransferenciaHoy, 'id'>): TransferenciaHoy => ({
      montoCentavos: 100,
      estado: 'confeccionada',
      estadoInterbanking: 'Confeccionada',
      estadoInterbankingActualizadoAt: hace3h,
      fechaConfeccion: hace3h,
      fechaSolicitud: '2026-09-30',
      ...partial,
    })
    const firmas = transferenciasSinFirmar(
      [
        transferencia({ id: 'a', montoCentavos: 1_500 }),
        transferencia({ id: 'b', montoCentavos: 2_500 }),
        transferencia({ id: 'nueva', estadoInterbankingActualizadoAt: haceMedia }),
        transferencia({ id: 'hecha', estadoInterbanking: 'Ejecutada' }),
        transferencia({ id: 'parcial', estadoInterbanking: 'En autorización' }),
      ],
      NOW,
    )
    expect(firmas).toMatchObject({ cantidad: 2, montoCentavos: 4_000 })
    expect(firmas?.texto).toBe(
      `Avisá a los firmantes: hay 2 transferencias esperando firma por ${formatoPesos(4_000)}.`,
    )
  })

  it('si no hay nada pendiente, el día queda vacío', () => {
    const vista = armarVistaHoy(base())
    expect(vista.vacio).toBe(true)
    expect(vista.prevision.semana).toBeNull()
    expect(vista.prevision.firmas).toBeNull()
    expect(vista.prevision.cobrosAtrasados).toEqual([])
  })
})
