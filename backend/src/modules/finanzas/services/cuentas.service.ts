import type { BankDataProvider } from '../adapters/bank-provider.types.js'

import {

  getFinanzasBankDataProvider,

  resolveFinanzasBankProviderMode,

} from '../adapters/bank-data-provider.factory.js'

import { computeDescubiertoEstado } from '../domain/descubierto.rules.js'

import {

  TIPO_CUENTA_LABEL,

  type Moneda,

  type OrigenSaldo,

  type TipoCuenta,

} from '../domain/cuenta.types.js'

import type { Timestamp } from 'firebase-admin/firestore'

import {

  dateIdInArgentina,

  deleteLegacyCaCuentas,

  ensureManualUsdAccounts,

  getCuentaDocument,

  listCuentaDocuments,

  toTimestampOrNull,

  updateManualSaldo,

  upsertCuentaFromSync,

} from './cuentas.repository.js'



export interface CuentaListItem {

  id: string

  bancoNombre: string

  tipo: TipoCuenta

  tipoLabel: string

  moneda: Moneda

  origenSaldo: OrigenSaldo

  saldoActualCentavos: number

  descubiertoCentavos: number | null

  saldoActualizadoManualmenteEl: string | null

  saldoActualizadoManualmentePor: string | null

  descubierto: {

    porcentajeUsado: number | null

    semaforo: 'verde' | 'amarillo' | 'rojo' | null

    superado?: boolean

  } | null

}



export interface CuentasListResponse {

  cuentas: CuentaListItem[]

  totales: {

    arsCentavos: number

    usdCentavos: number

  }

}



function buildDescubiertoApi(
  estado: ReturnType<typeof computeDescubiertoEstado>,
  descubiertoCentavos: number | null,
): CuentaListItem['descubierto'] {
  const base = {
    porcentajeUsado: estado.porcentajeUsado,
    semaforo: estado.semaforo,
  }
  if (descubiertoCentavos == null || descubiertoCentavos <= 0) {
    return base
  }
  if (estado.superado == null) return base
  return { ...base, superado: estado.superado }
}

function resolveOrigenSaldo(data: {

  tipo: TipoCuenta

  origenSaldo?: OrigenSaldo

}): OrigenSaldo {

  if (data.origenSaldo === 'interbanking' || data.origenSaldo === 'manual') {

    return data.origenSaldo

  }

  return data.tipo === 'USD' ? 'manual' : 'interbanking'

}



function timestampToIso(value: Timestamp | null | undefined): string | null {

  if (!value || typeof value.toDate !== 'function') return null

  return value.toDate().toISOString()

}



function mapRow(

  id: string,

  data: {

    bancoNombre: string

    tipo: TipoCuenta

    moneda: Moneda

    origenSaldo?: OrigenSaldo

    saldoActualCentavos: number

    descubiertoCentavos: number | null

    saldoActualizadoManualmenteEl?: Timestamp | null

    saldoActualizadoManualmentePor?: string | null

  },

): CuentaListItem {

  const origenSaldo = resolveOrigenSaldo(data)

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

    origenSaldo,

    saldoActualCentavos: data.saldoActualCentavos,

    descubiertoCentavos: data.descubiertoCentavos,

    saldoActualizadoManualmenteEl: timestampToIso(data.saldoActualizadoManualmenteEl),

    saldoActualizadoManualmentePor: data.saldoActualizadoManualmentePor ?? null,

    descubierto:

      data.tipo === 'CC' && origenSaldo === 'interbanking'

        ? buildDescubiertoApi(estado, data.descubiertoCentavos)

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

    if (cuenta.tipo === 'CC') {

      arsCentavos += cuenta.saldoActualCentavos

    } else if (cuenta.tipo === 'USD') {

      usdCentavos += cuenta.saldoActualCentavos

    }

  }



  return { cuentas, totales: { arsCentavos, usdCentavos } }

}



export async function syncCuentasFromProvider(input: {

  provider?: BankDataProvider

  actorUid: string

  asOf?: Date

}): Promise<{ synced: number; provider: string }> {

  const providerMode = resolveFinanzasBankProviderMode()

  const provider = input.provider ?? getFinanzasBankDataProvider()

  console.info('[finanzas/cuentas] sync usando proveedor=%s', providerMode)

  if (providerMode === 'mock') {

    const customerId = process.env.INTERBANKING_CUSTOMER_ID?.trim()

    const clientId = process.env.INTERBANKING_CLIENT_ID?.trim()

    if (customerId && clientId === customerId) {

      console.warn(

        '[finanzas/cuentas] INTERBANKING_CLIENT_ID coincide con INTERBANKING_CUSTOMER_ID (%s); el Client ID debe ser el de la app OAuth del portal, no el código cliente P14234A.',

        customerId,

      )

    }

  }

  const [accounts, balances] = await Promise.all([

    provider.getAccounts(),

    provider.getBalances(),

  ])

  const balanceById = new Map(balances.map((b) => [b.cuentaId, b.saldoActualCentavos]))

  const snapshotDateId = dateIdInArgentina(input.asOf ?? new Date())



  for (const account of accounts) {

    const saldo = balanceById.get(account.cuentaId)

    if (saldo === undefined) {

      throw new Error(`BankDataProvider: falta saldo para cuenta ${account.cuentaId}`)

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

        origenSaldo: 'interbanking',

        saldoActualCentavos: saldo,

        descubiertoCentavos: account.descubiertoCentavos,

        descubiertoVigenteDesde: toTimestampOrNull(account.descubiertoVigenteDesde),

        saldoActualizadoManualmenteEl: null,

        saldoActualizadoManualmentePor: null,

        createdBy: input.actorUid,

      },

    })

  }



  const removedCa = await deleteLegacyCaCuentas()

  if (removedCa > 0) {

    console.info('[finanzas/cuentas] eliminadas %d cuentas CA legacy', removedCa)

  }

  await ensureManualUsdAccounts(input.actorUid)



  return { synced: accounts.length, provider: providerMode }

}



export async function setManualSaldoForCuenta(input: {

  cuentaId: string

  saldoActualCentavos: number

  actorUid: string

  actorEmail: string

}): Promise<CuentaListItem> {

  if (!Number.isFinite(input.saldoActualCentavos)) {

    throw new Error('Saldo inválido')

  }

  const rounded = Math.round(input.saldoActualCentavos)

  await updateManualSaldo({ ...input, saldoActualCentavos: rounded })

  const row = await getCuentaDocument(input.cuentaId)

  if (!row) throw new Error('Cuenta no encontrada')

  return mapRow(row.id, row.data)

}


