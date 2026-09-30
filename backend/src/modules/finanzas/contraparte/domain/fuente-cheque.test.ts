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

  it('empareja un débito de cheque propio con el emitido del mismo número', () => {
    const emitido = cheque({ id: 'e1', direccion: 'emitido', numero: '00055', montoCentavos: 1 })
    const otro = cheque({ id: 'e2', direccion: 'emitido', numero: '99', montoCentavos: 80_000 })
    const recibido = cheque({ id: 'r1', direccion: 'recibido', numero: '55' })
    const [unico] = chequesCandidatos(mov({ voucherNumber: '55', montoCentavos: 999 }), [emitido, otro, recibido])
    expect(unico?.id).toBe('e1')
    expect(nombreContraparteCheque(emitido)).toBe('Cheque N.º 00055 a Flete Sur')
  })

  it('si el número no alcanza, usa monto y fecha con un solo candidato', () => {
    const cerca = cheque({ id: 'cerca', direccion: 'emitido', numero: '1', fechaPago: '2026-09-28' })
    const lejos = cheque({ id: 'lejos', direccion: 'emitido', numero: '2', fechaPago: '2026-09-24' })
    expect(chequesCandidatos(mov({ descripcion: 'CHEQUE CAMARA LOCAL' }), [cerca, lejos]).map((row) => row.id)).toEqual([
      'cerca',
    ])
    expect(chequesCandidatos(mov(), [cerca, { ...cerca, id: 'otro' }])).toEqual([])
  })

  it('reconoce la categoría y los textos del banco, y no los rechazos ni las comisiones', () => {
    const emitido = cheque({ id: 'e', direccion: 'emitido' })
    expect(
      chequesCandidatos(mov({ descripcion: 'VARIOS', categoriaNombre: 'Cheques pagados' }), [emitido]).map((row) => row.id),
    ).toEqual(['e'])
    expect(chequesCandidatos(mov({ descripcion: 'X', codeDescriptionIb: 'CH DEP 72' }), [emitido])).toHaveLength(1)
    expect(chequesCandidatos(mov({ descripcion: 'DEB.P/CANJE INTERNO' }), [emitido])).toHaveLength(1)
    expect(chequesCandidatos(mov({ descripcion: 'CH.RECH.DEP.CAM.INT.' }), [emitido])).toEqual([])
    expect(chequesCandidatos(mov({ descripcion: 'COMIS.ECHEQ PAGADO' }), [emitido])).toEqual([])
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

  it('un depósito por cámara también entra, y sin destinatario el nombre no inventa uno', () => {
    const recibido = cheque({ id: 'r', direccion: 'recibido', numero: '8' })
    expect(
      chequesCandidatos(mov({ tipo: 'credito', descripcion: 'DEP. VALORES CAMARA', voucherNumber: null }), [recibido]),
    ).toHaveLength(1)
    const emitido = cheque({ id: 'e', direccion: 'emitido', numero: '9', destinatario: '  ' })
    expect(nombreContraparteCheque(emitido)).toBe('Cheque N.º 9')
  })
})
