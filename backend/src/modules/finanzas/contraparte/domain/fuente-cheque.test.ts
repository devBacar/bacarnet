import { describe, expect, it } from 'vitest'
import {
  chequesCandidatos,
  nombreContraparteCheque,
  numeroComparable,
  type ChequeParaContraparte,
  type MovimientoCheque,
} from './fuente-cheque.js'

function cheque(partial: Partial<ChequeParaContraparte> & Pick<ChequeParaContraparte, 'id' | 'direccion'>): ChequeParaContraparte {
  return {
    numero: '100',
    montoCentavos: 80_000,
    fechaEmision: '2026-09-01',
    fechaPago: '2026-09-30',
    emisor: 'Juan Pérez',
    cliente: null,
    destinatario: 'Flete Sur',
    ...partial,
  }
}

function mov(partial: Partial<MovimientoCheque> = {}): MovimientoCheque {
  return {
    tipo: 'debito',
    montoCentavos: 80_000,
    fechaProceso: '2026-09-30',
    descripcion: 'ECHEQ CAMARA',
    codeDescriptionIb: null,
    voucherNumber: null,
    correlativeNumber: null,
    categoriaNombre: null,
    ...partial,
  }
}

describe('contraparte desde cheques', () => {
  it('compara el número solo con dígitos y sin ceros a la izquierda', () => {
    expect(numeroComparable('000123')).toBe('123')
    expect(numeroComparable('CH 00123-4')).toBe('1234')
    expect(numeroComparable('000')).toBeNull()
    expect(numeroComparable(123)).toBe('123')
  })

  it('empareja un débito de cheque propio con el emitido del mismo número y monto', () => {
    const emitido = cheque({ id: 'e1', direccion: 'emitido', numero: '00055', montoCentavos: 999 })
    const otro = cheque({ id: 'e2', direccion: 'emitido', numero: '99', montoCentavos: 80_000 })
    const recibido = cheque({ id: 'r1', direccion: 'recibido', numero: '55' })
    const [unico] = chequesCandidatos(mov({ voucherNumber: '55', montoCentavos: 999 }), [emitido, otro, recibido])
    expect(unico?.id).toBe('e1')
    expect(nombreContraparteCheque(emitido)).toBe('Cheque N.º 00055 a Flete Sur')
  })

  it('no empareja por voucher si el monto no coincide', () => {
    const emitido = cheque({ id: 'e1', direccion: 'emitido', numero: '00025', montoCentavos: 104_032_359 })
    const resultado = chequesCandidatos(mov({ voucherNumber: '25', montoCentavos: 60_000_000 }), [emitido])
    expect(resultado).toEqual([])
  })

  it('si el número no alcanza, usa monto y fecha dentro de ventana de 5 días', () => {
    const dentro = cheque({ id: 'dentro', direccion: 'emitido', numero: '1', fechaPago: '2026-09-28' })
    const fuera = cheque({ id: 'fuera', direccion: 'emitido', numero: '2', fechaPago: '2026-09-20' })
    expect(chequesCandidatos(mov({ descripcion: 'CHEQUE CAMARA LOCAL' }), [dentro, fuera]).map((row) => row.id)).toEqual([
      'dentro',
    ])
    expect(chequesCandidatos(mov(), [dentro, { ...dentro, id: 'otro' }])).toEqual([])
  })

  it('matchea por monto si el movimiento es hasta 1 día antes de fechaPago', () => {
    const ch = cheque({ id: 'f', direccion: 'emitido', numero: '1', fechaPago: '2026-10-02' })
    expect(chequesCandidatos(mov({ descripcion: 'CHEQUE CAMARA LOCAL', fechaProceso: '2026-10-01' }), [ch]).map((r) => r.id)).toEqual(['f'])
  })

  it('no matchea por monto si el movimiento es más de 1 día antes de fechaPago', () => {
    const futuro = cheque({ id: 'f', direccion: 'emitido', numero: '1', fechaPago: '2026-10-05' })
    expect(chequesCandidatos(mov({ descripcion: 'CHEQUE CAMARA LOCAL', fechaProceso: '2026-10-01' }), [futuro])).toEqual([])
  })

  it('reconoce la categoría, textos del banco, rechazos debitados y no las comisiones', () => {
    const emitido = cheque({ id: 'e', direccion: 'emitido' })
    expect(
      chequesCandidatos(mov({ descripcion: 'VARIOS', categoriaNombre: 'Cheques pagados' }), [emitido]).map((row) => row.id),
    ).toEqual(['e'])
    expect(chequesCandidatos(mov({ descripcion: 'X', codeDescriptionIb: 'CH DEP 72' }), [emitido])).toHaveLength(1)
    expect(chequesCandidatos(mov({ descripcion: 'DEB.P/CANJE INTERNO' }), [emitido])).toHaveLength(1)
    expect(chequesCandidatos(mov({ descripcion: 'CH.RECH.DEP.CAM.INT.' }), [emitido])).toHaveLength(1)
    expect(chequesCandidatos(mov({ descripcion: 'CH.RECH.FORMA S/MULT' }), [emitido])).toHaveLength(1)
    expect(chequesCandidatos(mov({ descripcion: 'DEB.VS./RECH.VALORES' }), [emitido])).toHaveLength(1)
    expect(chequesCandidatos(mov({ descripcion: 'COMIS.ECHEQ PAGADO' }), [emitido])).toEqual([])
    expect(chequesCandidatos(mov({ descripcion: 'COMIS.RECH.CH.PTMOS.' }), [emitido])).toEqual([])
  })

  it('matchea cheque físico por sufijo cuando el voucher son los últimos dígitos del número largo', () => {
    const fisico = cheque({ id: 'f1', direccion: 'emitido', numero: '305-001-5000-04142765', montoCentavos: 500_000 })
    const otro = cheque({ id: 'f2', direccion: 'emitido', numero: '99', montoCentavos: 500_000 })
    const [unico] = chequesCandidatos(
      mov({ voucherNumber: '4142765', montoCentavos: 500_000 }),
      [fisico, otro],
    )
    expect(unico?.id).toBe('f1')
  })

  it('no matchea por sufijo si el voucher tiene menos de 6 dígitos', () => {
    const fisico = cheque({ id: 'f1', direccion: 'emitido', numero: '305-001-5000-04142765', montoCentavos: 500_000, fechaPago: '2026-01-01' })
    expect(chequesCandidatos(
      mov({ voucherNumber: '42765', montoCentavos: 500_000 }),
      [fisico],
    )).toEqual([])
  })

  it('no matchea por sufijo si el monto no coincide', () => {
    const fisico = cheque({ id: 'f1', direccion: 'emitido', numero: '305-001-5000-04142765', montoCentavos: 500_000 })
    expect(chequesCandidatos(
      mov({ voucherNumber: '4142765', montoCentavos: 999_999 }),
      [fisico],
    )).toEqual([])
  })

  it('no matchea por sufijo si hay múltiples candidatos', () => {
    const f1 = cheque({ id: 'f1', direccion: 'emitido', numero: '305-001-5000-04142765', montoCentavos: 500_000 })
    const f2 = cheque({ id: 'f2', direccion: 'emitido', numero: '111-222-3333-04142765', montoCentavos: 500_000 })
    expect(chequesCandidatos(
      mov({ voucherNumber: '4142765', montoCentavos: 500_000 }),
      [f1, f2],
    )).toEqual([])
  })

  it('prefiere match exacto sobre sufijo', () => {
    const exacto = cheque({ id: 'ex', direccion: 'emitido', numero: '4142765', montoCentavos: 500_000 })
    const fisico = cheque({ id: 'f1', direccion: 'emitido', numero: '305-001-5000-04142765', montoCentavos: 500_000 })
    const [unico] = chequesCandidatos(
      mov({ voucherNumber: '4142765', montoCentavos: 500_000 }),
      [exacto, fisico],
    )
    expect(unico?.id).toBe('ex')
  })

  it('empareja un crédito depositado con el recibido, y prefiere el cliente', () => {
    const recibido = cheque({
      id: 'r',
      direccion: 'recibido',
      numero: '00077',
      emisor: 'Juan Pérez',
      cliente: 'Acme SA',
      destinatario: null,
    })
    const emitido = cheque({ id: 'e', direccion: 'emitido', numero: '77' })
    const [unico] = chequesCandidatos(
      mov({ tipo: 'credito', descripcion: 'DEPOSITO ECHEQ', voucherNumber: '77' }),
      [recibido, emitido],
    )
    expect(unico?.id).toBe('r')
    expect(nombreContraparteCheque(recibido)).toBe('Cheque de Acme SA')
    expect(nombreContraparteCheque({ ...recibido, cliente: null })).toBe('Cheque de Juan Pérez')
    expect(nombreContraparteCheque({ ...recibido, cliente: '  ', emisor: '  ' })).toBeNull()
  })

  it('matchea por correlativeNumber cuando voucherNumber es null', () => {
    const emitido = cheque({ id: 'e1', direccion: 'emitido', numero: '00055', montoCentavos: 999 })
    const [unico] = chequesCandidatos(
      mov({ voucherNumber: null, correlativeNumber: '55', montoCentavos: 999 }),
      [emitido],
    )
    expect(unico?.id).toBe('e1')
  })

  it('prefiere voucherNumber sobre correlativeNumber', () => {
    const porVoucher = cheque({ id: 'v', direccion: 'emitido', numero: '100', montoCentavos: 500 })
    const porCorr = cheque({ id: 'c', direccion: 'emitido', numero: '200', montoCentavos: 500 })
    const [unico] = chequesCandidatos(
      mov({ voucherNumber: '100', correlativeNumber: '200', montoCentavos: 500 }),
      [porVoucher, porCorr],
    )
    expect(unico?.id).toBe('v')
  })

  it('desempata por fecha más cercana cuando hay varios candidatos por monto', () => {
    const cercano = cheque({ id: 'c', direccion: 'emitido', numero: '1', fechaPago: '2026-09-29' })
    const lejano = cheque({ id: 'l', direccion: 'emitido', numero: '2', fechaPago: '2026-09-26' })
    const [unico] = chequesCandidatos(mov({ descripcion: 'CHEQUE CAMARA LOCAL' }), [cercano, lejano])
    expect(unico?.id).toBe('c')
  })

  it('no desempata si dos candidatos tienen la misma distancia en fecha', () => {
    const a = cheque({ id: 'a', direccion: 'emitido', numero: '1', fechaPago: '2026-09-28' })
    const b = cheque({ id: 'b', direccion: 'emitido', numero: '2', fechaPago: '2026-09-28' })
    expect(chequesCandidatos(mov({ descripcion: 'CHEQUE CAMARA LOCAL' }), [a, b])).toEqual([])
  })

  it('un depósito por cámara también entra, y sin destinatario el nombre no inventa uno', () => {
    const recibido = cheque({ id: 'r', direccion: 'recibido', numero: '8' })
    expect(
      chequesCandidatos(mov({ tipo: 'credito', descripcion: 'DEP. VALORES CAMARA', voucherNumber: null }), [recibido]),
    ).toHaveLength(1)
    const emitido = cheque({ id: 'e', direccion: 'emitido', numero: '9', destinatario: '  ' })
    expect(nombreContraparteCheque(emitido)).toBe('Cheque N.º 9')
  })
})
