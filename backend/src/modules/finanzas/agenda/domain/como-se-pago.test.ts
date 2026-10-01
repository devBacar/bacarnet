import { describe, expect, it } from 'vitest'
import { listarPagos } from './pago-compromiso.js'
import {
  catalogoVacio,
  leerRefsPago,
  lineasPagosPlanilla,
  ordenarRenglones,
  recolectarIds,
  renglonesDeCompromiso,
  renglonesEnRango,
  resolverRangoPagos,
  resolverRefsPago,
  refsConCatalogo,
  textoComoSePago,
  type CatalogoPagos,
  type FuentePago,
  type RefsPago,
} from './como-se-pago.js'

const refsVacias = (): RefsPago => ({
  chequeId: null,
  cajaId: null,
  cuentaId: null,
  transferenciaId: null,
  movimientoId: null,
  claseCheque: null,
  marcadoAMano: false,
})

const pagoViejo = {
  fecha: '2026-10-01',
  montoCentavos: 15_000,
  medio: 'efectivo' as const,
  referenciaId: null,
  registradoPor: 'ana',
  registradoAt: '2026-10-01T15:00:00.000Z',
}

function fuente(parcial: Partial<FuentePago> & Pick<FuentePago, 'id'>): FuentePago {
  return {
    concepto: 'Alquiler',
    proveedorONombre: 'Inmobiliaria Sur',
    montoCentavos: 20_000,
    moneda: 'ARS',
    estado: 'pagado',
    medioPago: 'transferencia',
    fechaPago: '2026-10-01',
    fechaVencimiento: '2026-10-05',
    chequeId: null,
    cuentaId: null,
    transferenciaConfeccionadaId: null,
    cuotaNumero: null,
    cuotaTotal: null,
    pagos: [],
    ...parcial,
  }
}

describe('lectura tolerante de un pago', () => {
  it('acepta un pago viejo sin los campos nuevos', () => {
    const pagos = listarPagos([pagoViejo])
    expect(pagos).toHaveLength(1)
    expect(leerRefsPago(pagos[0])).toEqual(refsVacias())
  })

  it('lee los ids cuando están y ignora los que vienen mal', () => {
    const pagos = listarPagos([
      null,
      { ...pagoViejo, medio: 'cripto' },
      {
        ...pagoViejo,
        medio: 'cheque',
        chequeId: ' ch-1 ',
        cajaId: 12,
        claseCheque: 'raro',
        marcadoAMano: 'si',
        transferenciaId: '',
      },
    ])
    expect(pagos).toHaveLength(1)
    expect(leerRefsPago(pagos[0])).toMatchObject({
      chequeId: 'ch-1',
      cajaId: null,
      claseCheque: null,
      marcadoAMano: false,
      transferenciaId: null,
    })
  })

  it('si pagos no es una lista, no hay pagos', () => {
    expect(listarPagos(undefined)).toEqual([])
    expect(listarPagos({})).toEqual([])
  })

  it('un pagado viejo sin pagos deja un solo renglón con su fecha, medio y monto', () => {
    const renglones = renglonesDeCompromiso(
      fuente({
        id: 'legacy',
        estado: 'pagado',
        pagos: [],
        medioPago: 'cheque',
        fechaPago: '2026-09-11',
        montoCentavos: 8_000,
        chequeId: 'ch-9',
      }),
      catalogoVacio(),
    )
    expect(renglones).toHaveLength(1)
    expect(renglones[0]).toMatchObject({
      fecha: '2026-09-11',
      montoCentavos: 8_000,
      medio: 'cheque',
      comoSePago: 'Cheque',
    })
  })

  it('completa el cheque y la transferencia que el pago viejo no guardó en el renglón', () => {
    expect(
      resolverRefsPago({
        pago: { ...pagoViejo, medio: 'cheque', referenciaId: 'ch-viejo' },
        medio: 'cheque',
        chequeIdCompromiso: 'ch-doc',
        cuentaIdCompromiso: null,
        transferenciaIdCompromiso: null,
        unico: true,
      }).chequeId,
    ).toBe('ch-viejo')

    expect(
      resolverRefsPago({
        pago: null,
        medio: 'transferencia',
        chequeIdCompromiso: null,
        cuentaIdCompromiso: 'cuenta-1',
        transferenciaIdCompromiso: 'tr-1',
        unico: true,
      }),
    ).toMatchObject({ transferenciaId: 'tr-1', cuentaId: 'cuenta-1' })
  })
})

describe('cómo se pagó', () => {
  const vacio = {
    cheque: null,
    cajaNombre: null,
    bancoCuenta: null,
    transferencia: null,
    movimiento: null,
  }

  it('arma el texto de cada medio', () => {
    expect(
      textoComoSePago('cheque', { ...refsVacias(), chequeId: 'ch-1', claseCheque: 'cartera' }, {
        ...vacio,
        cheque: { numero: '90002', banco: 'Galicia', propio: false },
      }),
    ).toBe('Cheque N.º 90002 · Galicia · endosado')

    expect(
      textoComoSePago('cheque', { ...refsVacias(), claseCheque: 'propio' }, {
        ...vacio,
        cheque: { numero: '123', banco: 'Julio', propio: true },
      }),
    ).toBe('Cheque propio N.º 123 · Julio')

    expect(
      textoComoSePago('efectivo', { ...refsVacias(), cajaId: 'caja-1' }, { ...vacio, cajaNombre: 'Caja principal' }),
    ).toBe('Efectivo · Caja principal')

    expect(
      textoComoSePago('transferencia', { ...refsVacias(), transferenciaId: 'tr-1' }, {
        ...vacio,
        transferencia: { banco: 'Bancor', esperandoFirma: false },
      }),
    ).toBe('Transferencia · Bancor · hecha')

    expect(
      textoComoSePago('transferencia', refsVacias(), {
        ...vacio,
        transferencia: { banco: 'Bancor', esperandoFirma: true },
      }),
    ).toBe('Transferencia · Bancor · esperando firma')

    expect(
      textoComoSePago('transferencia', { ...refsVacias(), marcadoAMano: true, movimientoId: 'mov-1' }, {
        ...vacio,
        movimiento: { fecha: '2026-10-01', banco: 'Bancor' },
      }),
    ).toBe('Marcado a mano · transferencia · débito del 01/10 en Bancor')

    expect(textoComoSePago('cheque', { ...refsVacias(), marcadoAMano: true }, vacio)).toBe('Marcado a mano · cheque')
  })

  it('un compromiso con dos formas deja dos renglones del mismo concepto', () => {
    const catalogo: CatalogoPagos = {
      ...catalogoVacio(),
      cheques: new Map([['ch-1', { numero: '90002', banco: 'Galicia', propio: false }]]),
      cajas: new Map([['caja-1', 'Caja principal']]),
    }
    const renglones = renglonesDeCompromiso(
      fuente({
        id: 'mixto',
        cuotaNumero: 7,
        cuotaTotal: 11,
        pagos: [
          {
            ...pagoViejo,
            medio: 'cheque',
            montoCentavos: 12_000,
            chequeId: 'ch-1',
            claseCheque: 'cartera',
          },
          {
            ...pagoViejo,
            fecha: '2026-10-02',
            medio: 'efectivo',
            montoCentavos: 8_000,
            cajaId: 'caja-1',
          },
        ],
      }),
      catalogo,
    )
    expect(renglones).toHaveLength(2)
    expect(renglones.map((renglon) => renglon.concepto)).toEqual(['Alquiler', 'Alquiler'])
    expect(renglones.map((renglon) => renglon.cuota)).toEqual(['7 de 11', '7 de 11'])
    expect(renglones[0]?.comoSePago).toBe('Cheque N.º 90002 · Galicia · endosado')
    expect(renglones[0]?.link).toBe('/finanzas/cheques')
    expect(renglones[0]?.linea).toBe('Pagado el 01/10 con cheque N.º 90002 · Galicia · endosado')
    expect(renglones[1]?.comoSePago).toBe('Efectivo · Caja principal')
    expect(renglones[1]?.link).toBe('/finanzas/cajas')
    expect(
      lineasPagosPlanilla(fuente({ id: 'mixto', estado: 'pendiente', pagos: [] }), catalogoVacio()),
    ).toEqual([])
  })

  it('si el id no es una transferencia y sí un débito, queda marcado a mano', () => {
    const catalogo: CatalogoPagos = {
      ...catalogoVacio(),
      movimientos: new Map([['mov-9', { fecha: '2026-10-01', banco: 'Bancor' }]]),
    }
    const refs = refsConCatalogo(
      'transferencia',
      { ...refsVacias(), transferenciaId: 'mov-9' },
      catalogo,
    )
    expect(textoComoSePago('transferencia', refs, {
      cheque: null,
      cajaNombre: null,
      bancoCuenta: null,
      transferencia: null,
      movimiento: catalogo.movimientos.get('mov-9') ?? null,
    })).toBe('Marcado a mano · transferencia · débito del 01/10 en Bancor')
    expect(
      recolectarIds([
        fuente({
          id: 'uno',
          pagos: [{ ...pagoViejo, medio: 'transferencia', referenciaId: 'tr-1' }],
        }),
      ]).transferenciaIds,
    ).toEqual(['tr-1'])
  })

  it('filtra por mes y agrupa los dos pagos bajo el compromiso', () => {
    const rango = resolverRangoPagos({ mes: '2026-10' })
    expect(rango).toEqual({ ok: true, desde: '2026-10-01', hasta: '2026-10-31' })
    expect(resolverRangoPagos({ mes: '2026-13' }).ok).toBe(false)
    expect(resolverRangoPagos({ desde: '2026-10-01', hasta: '2026-10-15' })).toMatchObject({
      ok: true,
      desde: '2026-10-01',
      hasta: '2026-10-15',
    })

    const a = renglonesDeCompromiso(
      fuente({
        id: 'a',
        proveedorONombre: 'Ana',
        pagos: [
          { ...pagoViejo, fecha: '2026-10-20', montoCentavos: 1 },
          { ...pagoViejo, fecha: '2026-10-02', montoCentavos: 2 },
        ],
      }),
      catalogoVacio(),
    )
    const b = renglonesDeCompromiso(
      fuente({
        id: 'b',
        proveedorONombre: 'Beto',
        pagos: [{ ...pagoViejo, fecha: '2026-09-30', montoCentavos: 3 }],
      }),
      catalogoVacio(),
    )
    const enOctubre = renglonesEnRango([...b, ...a], '2026-10-01', '2026-10-31')
    const ordenados = ordenarRenglones(enOctubre)
    expect(ordenados.map((renglon) => `${renglon.compromisoId}:${renglon.fecha}`)).toEqual([
      'a:2026-10-02',
      'a:2026-10-20',
    ])
  })
})
