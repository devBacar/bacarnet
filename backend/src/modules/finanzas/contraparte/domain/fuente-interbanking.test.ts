import { describe, expect, it } from 'vitest'
import {
  contraparteDeTransferenciaIb,
  importeACentavos,
  interbankingCandidatas,
  movimientoPuedeVenirDeInterbanking,
  parseDetalleTransferencias,
  type TransferenciaIbRecibida,
} from './fuente-interbanking.js'

const credito = {
  tipo: 'credito' as const,
  descripcion: 'CREDITO PROVEEDOR TA',
  codeDescriptionIb: null,
  numeroCuenta: '000123456789',
  bancoNumero: '020',
  montoCentavos: 250050,
  fechaProceso: '2026-09-28',
}

function recibida(partial: Partial<TransferenciaIbRecibida> = {}): TransferenciaIbRecibida {
  return {
    id: 'ib-1',
    fecha: '2026-09-28',
    montoCentavos: 250050,
    cuentaCreditoNumero: '123456789',
    bancoCreditoNumero: '020',
    nombrePagador: 'Cliente del Norte',
    cuitPagador: '30700000001',
    estado: 'Ejecutada',
    cuentaDebitoNumero: '', bancoDebitoNumero: '', nombreBeneficiario: null, cuitBeneficiario: null, bancoCreditoNombre: null, cuentasPropias: false,
    ...partial,
  }
}

describe('contraparte desde Interbanking', () => {
  it('mira créditos con texto de transferencia recibida y cualquier débito', () => {
    expect(movimientoPuedeVenirDeInterbanking(credito)).toBe(true)
    expect(movimientoPuedeVenirDeInterbanking({ ...credito, descripcion: 'TRANS P PR' })).toBe(true)
    expect(movimientoPuedeVenirDeInterbanking({ ...credito, tipo: 'debito' })).toBe(true)
    expect(movimientoPuedeVenirDeInterbanking({ ...credito, descripcion: 'DEPOSITO EFECTIVO' })).toBe(false)
  })

  it('coincide por cuenta crédito, monto y fecha, y descarta rechazadas', () => {
    expect(interbankingCandidatas(credito, [recibida()]).map((fila) => fila.id)).toEqual(['ib-1'])
    expect(interbankingCandidatas(credito, [recibida({ estado: 'Rechazada banco débito' })])).toEqual([])
    expect(interbankingCandidatas(credito, [recibida({ fecha: '2026-09-27' })])).toEqual([])
    expect(interbankingCandidatas(credito, [recibida(), recibida({ id: 'ib-2' })])).toHaveLength(2)
  })

  it('un débito (sueldo) toma al beneficiario de la transferencia que hizo Bacar', () => {
    const debito = { ...credito, tipo: 'debito' as const, descripcion: 'TF.PAG.HAB.O/B' }
    const sueldo = recibida({
      cuentaDebitoNumero: '000123456789',
      bancoDebitoNumero: '020',
      cuentaCreditoNumero: '999888777',
      bancoCreditoNumero: '034',
      nombreBeneficiario: 'PEREZ JUAN',
      cuitBeneficiario: '20111111112',
    })
    const [candidata] = interbankingCandidatas(debito, [sueldo])
    expect(candidata).toBeDefined()
    expect(contraparteDeTransferenciaIb(debito, candidata!)).toEqual({ nombre: 'PEREZ JUAN', cuit: '20111111112' })
    // No confunde la cuenta: un débito de otra cuenta no coincide.
    expect(interbankingCandidatas({ ...debito, numeroCuenta: '000555555555' }, [sueldo])).toEqual([])
  })

  it('un lote de sueldos se empareja con el único débito del banco por la suma', () => {
    const debito = { ...credito, tipo: 'debito' as const, descripcion: 'TF.PAG.HAB.O/B', montoCentavos: 12896860 }
    const empleado = (id: string, nombre: string) =>
      recibida({
        id,
        montoCentavos: 3224215,
        cuentaDebitoNumero: '000123456789',
        bancoDebitoNumero: '020',
        nombreBeneficiario: nombre,
        loteNumero: '323',
        tipoTransferencia: 'Sueldos',
      })
    const lote = [empleado('a', 'PEREZ JUAN'), empleado('b', 'GOMEZ ANA'), empleado('c', 'LOPEZ LUIS'), empleado('d', 'DIAZ EVA')]
    const [candidata, otra] = interbankingCandidatas(debito, lote)
    expect(otra).toBeUndefined()
    expect(candidata?.montoCentavos).toBe(12896860)
    expect(contraparteDeTransferenciaIb(debito, candidata!).nombre).toBe('Sueldos de 4 empleados: PEREZ JUAN, GOMEZ ANA y 2 más')
  })

  it('una transferencia entre cuentas propias se muestra como tal', () => {
    const debito = { ...credito, tipo: 'debito' as const }
    const propia = recibida({
      cuentaDebitoNumero: '000123456789',
      bancoDebitoNumero: '020',
      cuentasPropias: true,
      bancoCreditoNombre: 'Patagonia',
    })
    expect(contraparteDeTransferenciaIb(debito, propia)).toEqual({ nombre: 'Bacar · a su cuenta en Patagonia', cuit: null })
  })

  it('el nombre del que paga es debit_account.account_label, no el beneficiario', () => {
    const parsed = parseDetalleTransferencias({
      transfers: [
        {
          transfer_id: 99,
          request_date: '2026-09-28T11:00:00',
          amount: 2500.5,
          currency: 'ARS',
          status: 'Ejecutada',
          account_label: 'Bacar Transportadora',
          debit_account: {
            account_label: 'Cliente del Norte',
            customer_cuit: '30-70000000-1',
            bank_number: '017',
          },
          credit_account: {
            account_label: 'Bacar Transportadora',
            customer_cuit: '30668134978',
            account_number: '123456789',
            bank_number: '020',
          },
        },
        {
          transfer_id: 100,
          request_date: '2026-09-28T11:00:00',
          amount: 10,
          currency: 'USD',
          status: 'Ejecutada',
          debit_account: { account_label: 'En dólares', account_number: '1' },
          credit_account: { account_number: '1' },
        },
      ],
    })
    expect(parsed).toMatchObject([
      {
        id: '99',
        fecha: '2026-09-28',
        montoCentavos: 250050,
        cuentaCreditoNumero: '123456789',
        bancoCreditoNumero: '020',
        nombrePagador: 'Cliente del Norte',
        cuitPagador: '30700000001',
        estado: 'Ejecutada',
        bancoDebitoNumero: '017',
        nombreBeneficiario: 'Bacar Transportadora',
        cuitBeneficiario: '30668134978',
        cuentasPropias: false,
      },
    ])
    expect(importeACentavos(2500.5)).toBe(250050)
  })
})
