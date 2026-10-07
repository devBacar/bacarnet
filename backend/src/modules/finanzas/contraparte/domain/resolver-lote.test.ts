import { describe, expect, it } from 'vitest'
import type { ItemAgenda } from './fuente-agenda.js'
import type { TransferenciaIbRecibida } from './fuente-interbanking.js'
import type { TransferenciaParaContraparte } from './fuente-transferencia.js'
import { resolverLote, type ContextoContraparte, type MovimientoParaContraparte } from './resolver-lote.js'

function ctx(partial: Partial<ContextoContraparte> = {}): ContextoContraparte {
  return {
    transferencias: [],
    destinatariosPorCbu: new Map(),
    proveedoresPorCompromiso: new Map(),
    agenda: [],
    cheques: [],
    transferenciasIb: [],
    directorio: new Map(),
    categorias: new Map(),
    ...partial,
  }
}

function mov(partial: Partial<MovimientoParaContraparte> = {}): MovimientoParaContraparte {
  return {
    id: 'm1',
    cuentaId: 'cordoba-cc',
    bancoNombre: 'Córdoba',
    bancoNumero: '020',
    numeroCuenta: '123456789',
    tipo: 'debito',
    montoCentavos: 150000,
    fechaProceso: '2026-09-28',
    descripcion: 'TF.DB.PAG.PROV.',
    codeDescriptionIb: null,
    voucherNumber: null,
    depositorDescription: null,
    customerCuit: null,
    categoriaId: null,
    contraparteNombre: null,
    contraparteCuit: null,
    contraparteOrigen: null,
    ...partial,
  }
}

describe('resolver el lote', () => {
  it('el banco gana sobre una transferencia del mismo monto', () => {
    const transferencias: TransferenciaParaContraparte[] = [
      {
        id: 'tr-1',
        cuentaDebitoId: 'cordoba-cc',
        montoCentavos: 150000,
        fecha: '2026-09-28',
        estado: 'efectivizada',
        destinoNombre: 'Desde BacarNet',
        destinoCuit: '30700000001',
        cuentaCreditoCbu: null,
        compromisoPagoId: null,
      },
    ]
    const [resultado] = resolverLote(
      [mov({ depositorDescription: 'Según el banco', customerCuit: '30-70000000-1' })],
      ctx({ transferencias }),
    )
    expect(resultado?.contraparte).toEqual({
      nombre: 'Según el banco',
      cuit: '30700000001',
      origen: 'banco',
    })
  })

  it('una sola transferencia le pone el destinatario al débito', () => {
    const [resultado] = resolverLote(
      [mov()],
      ctx({
        transferencias: [
          {
            id: 'tr-1',
            cuentaDebitoId: 'cordoba-cc',
            montoCentavos: 150000,
            fecha: '2026-09-25',
            estado: 'confeccionada',
            destinoNombre: 'Flete Sur',
            destinoCuit: null,
            cuentaCreditoCbu: '0340000000000000000001',
            compromisoPagoId: 'comp-9',
          },
        ],
        destinatariosPorCbu: new Map([['0340000000000000000001', { nombre: 'No usar', cuit: '27999999994' }]]),
      }),
    )
    expect(resultado?.contraparte.origen).toBe('transferencia')
    expect(resultado?.contraparte.nombre).toBe('Flete Sur')
    expect(resultado?.contraparte.cuit).toBe('27999999994')
  })

  it('dos débitos para la misma transferencia no se quedan con el nombre', () => {
    const transferencias: TransferenciaParaContraparte[] = [
      {
        id: 'tr-1',
        cuentaDebitoId: 'cordoba-cc',
        montoCentavos: 150000,
        fecha: '2026-09-28',
        estado: 'efectivizada',
        destinoNombre: 'Flete Sur',
        destinoCuit: null,
        cuentaCreditoCbu: null,
        compromisoPagoId: null,
      },
    ]
    const resultados = resolverLote(
      [mov({ id: 'a' }), mov({ id: 'b' })],
      ctx({ transferencias }),
    )
    expect(resultados.map((fila) => fila.contraparte.origen)).toEqual([null, null])
  })

  it('la agenda nombra un débito cuando no hay transferencia', () => {
    const agenda: ItemAgenda[] = [
      {
        id: 'compromiso:1',
        tipo: 'compromiso',
        nombre: 'Taller Díaz',
        cuit: null,
        montoCentavos: 150000,
        fecha: '2026-09-28',
        cuentaId: 'cordoba-cc',
        estado: 'pagado',
      },
    ]
    const [resultado] = resolverLote([mov()], ctx({ agenda }))
    expect(resultado?.contraparte).toEqual({ nombre: 'Taller Díaz', cuit: null, origen: 'agenda' })
  })

  it('un crédito TRANS P PR toma el pagador de Interbanking', () => {
    const transferenciasIb: TransferenciaIbRecibida[] = [
      {
        id: 'ib-1',
        fecha: '2026-09-28',
        montoCentavos: 150000,
        cuentaCreditoNumero: '123456789',
        bancoCreditoNumero: '020',
        nombrePagador: 'Cliente del Norte',
        cuitPagador: '30700000001',
        estado: 'Ejecutada',
        cuentaDebitoNumero: '', bancoDebitoNumero: '', nombreBeneficiario: null, cuitBeneficiario: null, bancoCreditoNombre: null, cuentasPropias: false,
      },
    ]
    const [resultado] = resolverLote(
      [mov({ tipo: 'credito', descripcion: 'TRANS P PR' })],
      ctx({ transferenciasIb }),
    )
    expect(resultado?.contraparte.origen).toBe('interbanking')
    expect(resultado?.contraparte.nombre).toBe('Cliente del Norte')
  })

  it('lo aprendido en el mismo lote completa otro movimiento que solo tiene el CUIT', () => {
    const resultados = resolverLote(
      [
        mov({
          id: 'con-nombre',
          depositorDescription: 'Cliente del Norte',
          customerCuit: '30700000001',
        }),
        mov({
          id: 'solo-cuit',
          tipo: 'credito',
          descripcion: 'DEPOSITO',
          customerCuit: '30-70000000-1',
          depositorDescription: null,
        }),
      ],
      ctx(),
    )
    const solo = resultados.find((fila) => fila.id === 'solo-cuit')
    expect(solo?.contraparte).toEqual({
      nombre: 'Cliente del Norte',
      cuit: '30700000001',
      origen: 'directorio',
    })
  })

  it('manual no se pisa y la categoría cubre lo que queda', () => {
    const resultados = resolverLote(
      [
        mov({
          id: 'a-mano',
          contraparteNombre: null,
          contraparteOrigen: 'manual',
          depositorDescription: 'Banco miente',
          categoriaId: 'iva',
        }),
        mov({ id: 'impuesto', descripcion: 'IVA', categoriaId: 'iva' }),
      ],
      ctx({ categorias: new Map([['iva', { nombre: 'IVA', grupo: 'Impuestos' }]]) }),
    )
    expect(resultados.find((fila) => fila.id === 'a-mano')?.contraparte.origen).toBe('manual')
    expect(resultados.find((fila) => fila.id === 'impuesto')?.contraparte.nombre).toBe(
      'AFIP (cobrado por Banco Córdoba)',
    )
  })

  it('un débito de cheque propio queda después de la agenda y antes de Interbanking', () => {
    const cheque = {
      id: 'ch-1',
      numero: '55',
      direccion: 'emitido' as const,
      montoCentavos: 150000,
      fechaEmision: '2026-09-01',
      fechaPago: '2026-09-28',
      emisor: null,
      cliente: null,
      destinatario: 'Flete Sur',
    }
    const transferenciaIb: TransferenciaIbRecibida = {
      id: 'ib-1',
      fecha: '2026-09-28',
      montoCentavos: 150000,
      cuentaCreditoNumero: '',
      bancoCreditoNumero: '',
      nombrePagador: null,
      cuitPagador: null,
      estado: 'Ejecutada',
      cuentaDebitoNumero: '123456789',
      bancoDebitoNumero: '020',
      nombreBeneficiario: 'Según Interbanking',
      cuitBeneficiario: null,
      bancoCreditoNombre: null,
      cuentasPropias: false,
    }
    const debito = mov({ descripcion: 'ECHEQ CAMARA', voucherNumber: '55' })
    const soloCheque = resolverLote([debito], ctx({ cheques: [cheque], transferenciasIb: [transferenciaIb] }))
    expect(soloCheque[0]?.contraparte).toEqual({
      nombre: 'Cheque N.º 55 a Flete Sur',
      cuit: null,
      origen: 'cheque',
    })

    const conAgenda = resolverLote(
      [debito],
      ctx({
        cheques: [cheque],
        transferenciasIb: [transferenciaIb],
        agenda: [
          {
            id: 'compromiso:1',
            tipo: 'compromiso',
            nombre: 'Taller Díaz',
            cuit: null,
            montoCentavos: 150000,
            fecha: '2026-09-28',
            cuentaId: 'cordoba-cc',
            estado: 'pagado',
          },
        ],
      }),
    )
    expect(conAgenda[0]?.contraparte.origen).toBe('agenda')
  })
})
