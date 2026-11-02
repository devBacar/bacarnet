import { describe, expect, it } from 'vitest'
import { formatoPesos, formatoPesosCorto } from './hoy.fechas.js'
import type { ArmarHoyInput, ChequeEnHoy, CobroHoy, CompromisoHoy, CuentaHoy, MovimientoHoy, TransferenciaHoy } from './hoy.tipos.js'
import {
  armarVistaHoy,
  avisoDescubierto,
  creditoConfirmaCobro,
  listarCobrosAtrasados,
  seleccionarCobradosHoy,
  seleccionarPagadosHoy,
  seleccionarPagos,
  seleccionarPagosAtrasados,
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
    chequeId: null,
    montoTotalCentavos: partial.montoCentavos,
    moneda: 'ARS',
    fechaPago: null,
    origen: 'manual',
    ...partial,
  }
}

function cobro(partial: Partial<CobroHoy> & Pick<CobroHoy, 'id' | 'fechaEsperada' | 'montoCentavos'>): CobroHoy {
  return {
    clienteONombre: 'Cliente',
    concepto: null,
    moneda: 'ARS',
    estado: 'esperado',
    cuit: null,
    email: null,
    contraparte: null,
    fechaConfirmado: null,
    origen: 'manual',
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

function chequeEnHoy(partial: Partial<ChequeEnHoy> & Pick<ChequeEnHoy, 'id' | 'numero' | 'montoCentavos'>): ChequeEnHoy {
  return {
    direccion: 'emitido',
    estado: 'pendiente_debito',
    utilizado: null,
    fechaPago: HOY,
    bancoEmisor: null,
    destinatario: null,
    emisor: 'Bacar',
    cliente: null,
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
    tipoCambioUsdArs: null,
    feriados: new Set(),
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
      vencidoTexto: 'Venció hace 5 días',
      comoPagar: 'Por banco',
    })
    expect(vista.pagosAtrasados.totalCentavos).toBe(3_000)
    expect(vista.dia.pagosCentavos).toBe(1_000)
  })

  it('pagos atrasados: incluye transferencia, cheque y efectivo; avisa si el cheque ya se emitió', () => {
    const vista = armarVistaHoy(
      base({
        compromisos: [
          compromiso({ id: 'banco', fechaVencimiento: '2026-09-27', montoCentavos: 1_000, medioPago: 'transferencia' }),
          compromiso({
            id: 'cheque-emitido',
            fechaVencimiento: '2026-09-27',
            montoCentavos: 2_000,
            medioPago: 'cheque',
            chequeId: 'ch-1',
          }),
          compromiso({ id: 'cheque-sin', fechaVencimiento: '2026-09-27', montoCentavos: 2_500, medioPago: 'cheque' }),
          compromiso({ id: 'efectivo', fechaVencimiento: '2026-09-27', montoCentavos: 3_000, medioPago: 'efectivo' }),
        ],
      }),
    )
    expect(vista.pagosAtrasados.filas.map((fila) => fila.id)).toEqual([
      'banco',
      'cheque-emitido',
      'cheque-sin',
      'efectivo',
    ])
    expect(vista.pagosAtrasados.totalCentavos).toBe(8_500)

    const conCheque = vista.pagosAtrasados.filas.find((fila) => fila.id === 'cheque-emitido')
    expect(conCheque).toMatchObject({
      medioPago: 'cheque',
      comoPagar: 'Con cheque',
      chequeEmitido: true,
      aviso: 'Ya tiene cheque emitido, solo falta debitarlo',
    })

    const sinCheque = vista.pagosAtrasados.filas.find((fila) => fila.id === 'cheque-sin')
    expect(sinCheque).toMatchObject({
      medioPago: 'cheque',
      chequeEmitido: false,
      aviso: null,
    })

    const banco = vista.pagosAtrasados.filas.find((fila) => fila.id === 'banco')
    expect(banco).toMatchObject({
      medioPago: 'transferencia',
      comoPagar: 'Por banco',
      chequeEmitido: false,
      aviso: null,
    })

    const efectivo = vista.pagosAtrasados.filas.find((fila) => fila.id === 'efectivo')
    expect(efectivo).toMatchObject({
      medioPago: 'efectivo',
      comoPagar: 'En efectivo',
      chequeEmitido: false,
      aviso: null,
    })
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

  it('en "Compromisos de esta semana" tampoco se duplica un cheque ya contado como compromiso, y convierte USD', () => {
    const vista = armarVistaHoy(
      base({
        compromisos: [
          compromiso({
            id: 'vientri-cheque-chq-1',
            fechaVencimiento: HOY,
            montoCentavos: 500_000,
            origen: 'vientri-cheque',
            medioPago: 'cheque',
            vientriChequeNumero: '50095064',
          }),
          compromiso({ id: 'usd-jueves', fechaVencimiento: '2026-10-01', montoCentavos: 100_00, moneda: 'USD' }),
        ],
        cheques: [chequeEnHoy({ id: 'chq-1', numero: '50095064', montoCentavos: 500_000 })],
        tipoCambioUsdArs: 1500,
      }),
    )
    const hoyFila = vista.prevision.semana?.find((fila) => fila.fecha === HOY)
    // Antes del fix: 500_000 (compromiso) + 500_000 (cheque) = 1_000_000.
    expect(hoyFila?.aPagarCentavos).toBe(500_000)
    const jueves = vista.prevision.semana?.find((fila) => fila.fecha === '2026-10-01')
    expect(jueves?.aPagarCentavos).toBe(15_000_000)
  })

  it('no muestra atrasados de más de 30 días (quedan archivados, no se borran de la Agenda)', () => {
    const pagos = [
      compromiso({ id: 'reciente', fechaVencimiento: '2026-09-15', montoCentavos: 100_00 }),
      compromiso({ id: 'muy-viejo', fechaVencimiento: '2026-01-01', montoCentavos: 999_00 }),
    ]
    const lista = seleccionarPagosAtrasados(pagos, HOY, [], new Set())
    expect(lista.map((p) => p.id)).toEqual(['reciente'])

    const cobros = [
      cobro({ id: 'reciente-c', fechaEsperada: '2026-09-15', montoCentavos: 100_00 }),
      cobro({ id: 'muy-viejo-c', fechaEsperada: '2026-01-01', montoCentavos: 999_00 }),
    ]
    const listaCobros = listarCobrosAtrasados(cobros, HOY, new Set(), new Set())
    expect(listaCobros.map((c) => c.id)).toEqual(['reciente-c'])
  })

  it('lista todos los cobros atrasados, del mayor al menor', () => {
    const cobros = [
      cobro({ id: 'chico', fechaEsperada: '2026-09-20', montoCentavos: 100, clienteONombre: 'Chico' }),
      cobro({ id: 'grande', fechaEsperada: '2026-09-10', montoCentavos: 9_000, clienteONombre: 'Grande', email: 'a@b.com' }),
      cobro({ id: 'recien', fechaEsperada: '2026-09-28', montoCentavos: 50_000 }),
      cobro({ id: 'cobrado', fechaEsperada: '2026-09-01', montoCentavos: 80_000, estado: 'confirmado' }),
    ]
    const lista = listarCobrosAtrasados(cobros, HOY, new Set(), new Set())
    expect(lista.map((row) => row.id)).toEqual(['recien', 'grande', 'chico'])
    expect(lista[1]).toMatchObject({ haceDias: 20, haceTexto: 'Hace 20 días', email: 'a@b.com' })
    expect(lista[1]?.textoReclamo).toContain('Grande')
    expect(lista[1]?.textoReclamo).toContain('Bacar')
  })

  it('seleccionarPagadosHoy: toma lo pagado hoy sin importar cuándo vencía, con el monto total', () => {
    const compromisos = [
      compromiso({ id: 'pagado-hoy', fechaVencimiento: '2026-09-20', montoCentavos: 0, montoTotalCentavos: 5_000, estado: 'pagado', fechaPago: HOY, proveedorONombre: 'Permaquim' }),
      compromiso({ id: 'pagado-ayer', fechaVencimiento: HOY, montoCentavos: 0, montoTotalCentavos: 1_000, estado: 'pagado', fechaPago: '2026-09-29' }),
      compromiso({ id: 'pendiente', fechaVencimiento: HOY, montoCentavos: 2_000, estado: 'pendiente' }),
    ]
    const resultado = seleccionarPagadosHoy(compromisos, HOY)
    expect(resultado.filas.map((f) => f.id)).toEqual(['pagado-hoy'])
    expect(resultado.filas[0]).toMatchObject({ aQuienODeQuien: 'Permaquim', montoCentavos: 5_000 })
    expect(resultado.totalCentavos).toBe(5_000)
  })

  it('seleccionarPagadosHoy: con desglose real, usa el vencimiento del cheque, no el día de la orden', () => {
    const compromisos = [
      compromiso({
        id: 'permaquim',
        fechaVencimiento: HOY,
        montoCentavos: 0,
        montoTotalCentavos: 1_000_000,
        estado: 'pagado',
        fechaPago: HOY,
        proveedorONombre: 'Permaquim S.A.',
        desglosePago: [
          { medio: 'echeq', fechaVencimiento: '2027-02-05', montoCentavos: 400_000, chequeNumero: 'E-CHEQ 1' },
          { medio: 'echeq', fechaVencimiento: HOY, montoCentavos: 300_000, chequeNumero: 'E-CHEQ 2' },
          { medio: 'otro_medio', fechaVencimiento: HOY, montoCentavos: 50_000, chequeNumero: null },
        ],
      }),
    ]
    const resultado = seleccionarPagadosHoy(compromisos, HOY)
    // El e-cheq que vence en 2027 no entra: esa plata todavía no sale hoy.
    expect(resultado.filas).toHaveLength(2)
    expect(resultado.totalCentavos).toBe(350_000)
    expect(resultado.filas.find((f) => f.chequeNumero === 'E-CHEQ 2')).toMatchObject({ medio: 'echeq', montoCentavos: 300_000 })
    expect(resultado.filas.find((f) => f.medio === 'otro')).toMatchObject({ montoCentavos: 50_000, chequeNumero: null })
  })

  it('seleccionarPagadosHoy: sin desglose (origen vientri-cheque), usa el número de cheque de la Agenda', () => {
    const compromisos = [
      compromiso({
        id: 'vientri-cheque-chq-1',
        fechaVencimiento: HOY,
        montoCentavos: 0,
        montoTotalCentavos: 500_000,
        estado: 'pagado',
        fechaPago: HOY,
        proveedorONombre: 'Bacar Transportadora',
        medioPago: 'cheque',
        origen: 'vientri-cheque',
        vientriChequeNumero: '50095064',
      }),
    ]
    const resultado = seleccionarPagadosHoy(compromisos, HOY)
    expect(resultado.filas).toHaveLength(1)
    expect(resultado.filas[0]).toMatchObject({ chequeNumero: '50095064', medio: 'cheque_fisico' })
  })

  it('seleccionarCobradosHoy: toma lo cobrado hoy sin importar la fecha esperada', () => {
    const cobros = [
      cobro({ id: 'cobrado-hoy', fechaEsperada: '2026-08-01', montoCentavos: 3_000, estado: 'confirmado', fechaConfirmado: HOY, clienteONombre: 'Cliente X' }),
      cobro({ id: 'cobrado-otro-dia', fechaEsperada: HOY, montoCentavos: 999, estado: 'confirmado', fechaConfirmado: '2026-09-29' }),
      cobro({ id: 'esperado', fechaEsperada: HOY, montoCentavos: 1_000 }),
    ]
    const resultado = seleccionarCobradosHoy(cobros, HOY)
    expect(resultado.filas.map((f) => f.id)).toEqual(['cobrado-hoy'])
    expect(resultado.filas[0]).toMatchObject({ aQuienODeQuien: 'Cliente X', montoCentavos: 3_000 })
    expect(resultado.totalCentavos).toBe(3_000)
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

describe('origen real en las filas (para distinguir Vientri/Inversores/manual en la pantalla)', () => {
  it('seleccionarPagos y seleccionarPagosAtrasados llevan el origen real del compromiso', () => {
    const compromisos = [
      compromiso({ id: 'inv-1-c1', fechaVencimiento: HOY, montoCentavos: 100_00, origen: 'inversiones' }),
      compromiso({ id: 'vientri-2', fechaVencimiento: '2026-09-01', montoCentavos: 200_00, origen: 'vientri' }),
    ]
    const [hoy] = seleccionarPagos(compromisos, HOY, [], new Set())
    expect(hoy?.origen).toBe('inversiones')
    const [atrasado] = seleccionarPagosAtrasados(compromisos, HOY, [], new Set())
    expect(atrasado?.origen).toBe('vientri')
  })

  it('listarCobrosAtrasados lleva el origen real del cobro', () => {
    const cobros = [cobro({ id: 'inv-1-ingreso', fechaEsperada: '2026-09-01', montoCentavos: 500_00, origen: 'inversiones' })]
    const [fila] = listarCobrosAtrasados(cobros, HOY, new Set(), new Set())
    expect(fila?.origen).toBe('inversiones')
  })
})

describe('mismo criterio en todo Hoy: día hábil y conversión de USD', () => {
  it('un vencimiento de sábado cuenta el viernes, para que coincida con "Compromisos de la semana"', () => {
    // 2026-10-03 es sábado; el día hábil anterior es 2026-10-02 (viernes).
    const compromisos = [compromiso({ id: 'sabado', fechaVencimiento: '2026-10-03', montoCentavos: 500_00 })]
    const [fila] = seleccionarPagos(compromisos, '2026-10-02', [], new Set())
    expect(fila?.id).toBe('sabado')
  })

  it('un vencimiento de domingo también cuenta el viernes anterior', () => {
    // 2026-10-04 es domingo; igual que el sábado, el día hábil anterior es el viernes 2026-10-02.
    const compromisos = [compromiso({ id: 'domingo', fechaVencimiento: '2026-10-04', montoCentavos: 500_00 })]
    const [fila] = seleccionarPagos(compromisos, '2026-10-02', [], new Set())
    expect(fila?.id).toBe('domingo')
  })

  it('un feriado corre el vencimiento al día hábil anterior, no solo los fines de semana', () => {
    const feriados = new Set(['2026-10-01']) // jueves feriado inventado
    const compromisos = [compromiso({ id: 'feriado', fechaVencimiento: '2026-10-01', montoCentavos: 500_00 })]
    const [fila] = seleccionarPagos(compromisos, '2026-09-30', [], feriados)
    expect(fila?.id).toBe('feriado')
  })

  it('"Hoy pagás" convierte los compromisos en USD a pesos con la cotización del día', () => {
    const vista = armarVistaHoy(
      base({
        compromisos: [
          compromiso({ id: 'ars', fechaVencimiento: HOY, montoCentavos: 100_000, moneda: 'ARS' }),
          compromiso({ id: 'usd', fechaVencimiento: HOY, montoCentavos: 100_00, moneda: 'USD' }),
        ],
        tipoCambioUsdArs: 1_500,
      }),
    )
    // 100_000 (ARS) + 100_00 centavos de USD * 1500 = 100_000 + 15_000_000
    expect(vista.pagos.totalCentavos).toBe(100_000 + 15_000_000)
    expect(vista.dia.pagosCentavos).toBe(100_000 + 15_000_000)
  })

  it('un cheque de "vientri-cheque" no se suma dos veces (una como compromiso y otra como cheque)', () => {
    const vista = armarVistaHoy(
      base({
        compromisos: [
          compromiso({
            id: 'vientri-cheque-chq-1',
            fechaVencimiento: HOY,
            montoCentavos: 500_000,
            origen: 'vientri-cheque',
            medioPago: 'cheque',
            vientriChequeNumero: '50095064',
          }),
        ],
        cheques: [chequeEnHoy({ id: 'chq-1', numero: '50095064', montoCentavos: 500_000 })],
      }),
    )
    // Antes del fix esto daba 1_000_000 (contado dos veces): como compromiso Y como cheque del día.
    expect(vista.dia.pagosCentavos).toBe(500_000)
  })

  it('un cheque sin compromiso en la Agenda sí se suma (no hay con qué cruzarlo)', () => {
    const vista = armarVistaHoy(
      base({
        cheques: [chequeEnHoy({ id: 'chq-2', numero: '999', montoCentavos: 300_000 })],
      }),
    )
    expect(vista.dia.pagosCentavos).toBe(300_000)
  })

  it('la tarjeta "Pagos de hoy" incluye ese cheque suelto, para que el total de arriba y el de la tarjeta no difieran', () => {
    const vista = armarVistaHoy(
      base({
        compromisos: [compromiso({ id: 'factura-1', fechaVencimiento: HOY, montoCentavos: 100_000 })],
        cheques: [chequeEnHoy({ id: 'chq-3', numero: '999', montoCentavos: 300_000 })],
      }),
    )
    expect(vista.dia.pagosCentavos).toBe(400_000)
    expect(vista.pagos.totalCentavos).toBe(400_000)
    expect(vista.pagos.filas).toHaveLength(2)
    expect(vista.pagos.filas.map((f) => f.id)).toContain('cheque-chq-3')
  })

  it('sin cotización cargada, no convierte (usa el monto tal cual para no inventar un valor)', () => {
    const vista = armarVistaHoy(
      base({
        compromisos: [compromiso({ id: 'usd', fechaVencimiento: HOY, montoCentavos: 100_00, moneda: 'USD' })],
        tipoCambioUsdArs: null,
      }),
    )
    expect(vista.pagos.totalCentavos).toBe(100_00)
  })
})
