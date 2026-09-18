import type { BankDataProvider } from '../adapters/bank-provider.types.js'
import { mockBankDataProvider } from '../adapters/mock-provider.js'
import { computeDescubiertoEstado } from '../domain/descubierto.rules.js'
import { TIPO_CUENTA_LABEL, type Moneda, type TipoCuenta } from '../domain/cuenta.types.js'
import {
  dateIdInArgentina,
  listCuentaDocuments,
  toTimestampOrNull,
  upsertCuentaFromSync,
} from './cuentas.repository.js'

export interface CuentaListItem {
  id: string
  bancoNombre: string
  tipo: TipoCuenta
  tipoLabel: string
  moneda: Moneda
  saldoActualCentavos: number
  descubiertoCentavos: number | null
  descubierto: {
    porcentajeUsado: number | null
    semaforo: 'verde' | 'amarillo' | 'rojo' | null
    superado: boolean
  } | null
}

export interface CuentasListResponse {
  cuentas: CuentaListItem[]
  totales: {
    arsCentavos: number
    usdCentavos: number
  }
}

function mapRow(id: string, data: {
  bancoNombre: string
  tipo: TipoCuenta
  moneda: Moneda
  saldoActualCentavos: number
  descubiertoCentavos: number | null
}): CuentaListItem {
  const estado = computeDescubiertoEstado(
    data.saldoActualCentavos,
    data.descubiertoCentavos,
    data.tipo,
  )

  return {
    id,
    bancoNombre: data.bancoNombre,
    tipo: data.tipo,
    tipoLabel: TIPO_CUENTA_LABEL[data.tipo],
    moneda: data.moneda,
    saldoActualCentavos: data.saldoActualCentavos,
    descubiertoCentavos: data.descubiertoCentavos,
    descubierto:
      data.tipo === 'CC'
        ? {
            porcentajeUsado: estado.porcentajeUsado,
            semaforo: estado.semaforo,
            superado: estado.superado,
          }
        : null,
  }
}

export async function listCuentasForApi(): Promise<CuentasListResponse> {
  const rows = await listCuentaDocuments()
  const cuentas = rows
    .map(({ id, data }) => mapRow(id, data))
    .sort(
      (a, b) =>
        a.bancoNombre.localeCompare(b.bancoNombre, 'es') ||
        a.tipo.localeCompare(b.tipo),
    )

  let arsCentavos = 0
  let usdCentavos = 0
  for (const cuenta of cuentas) {
    if (cuenta.moneda === 'USD') {
      usdCentavos += cuenta.saldoActualCentavos
    } else {
      arsCentavos += cuenta.saldoActualCentavos
    }
  }

  return { cuentas, totales: { arsCentavos, usdCentavos } }
}

export async function syncCuentasFromProvider(input: {
  provider?: BankDataProvider
  actorUid: string
  asOf?: Date
}): Promise<{ synced: number }> {
  const provider = input.provider ?? mockBankDataProvider
  const [accounts, balances] = await Promise.all([
    provider.getAccounts(),
    provider.getBalances(),
  ])
  const balanceById = new Map(balances.map((b) => [b.cuentaId, b.saldoActualCentavos]))
  const snapshotDateId = dateIdInArgentina(input.asOf ?? new Date())

  for (const account of accounts) {
    const saldo = balanceById.get(account.cuentaId)
    if (saldo === undefined) {
      throw new Error(`MockProvider: falta saldo para cuenta ${account.cuentaId}`)
    }

    await upsertCuentaFromSync({
      cuentaId: account.cuentaId,
      actorUid: input.actorUid,
      snapshotDateId,
      saldoCierreCentavos: saldo,
      payload: {
        bancoNombre: account.bancoNombre,
        bancoCodigoInterbanking: account.bancoCodigoInterbanking,
        tipo: account.tipo,
        moneda: account.moneda,
        saldoActualCentavos: saldo,
        descubiertoCentavos: account.descubiertoCentavos,
        descubiertoVigenteDesde: toTimestampOrNull(account.descubiertoVigenteDesde),
        createdBy: input.actorUid,
      },
    })
  }

  return { synced: accounts.length }
}
