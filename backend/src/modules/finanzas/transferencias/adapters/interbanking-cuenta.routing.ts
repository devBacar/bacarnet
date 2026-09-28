import type { CuentaDocument } from '../../domain/cuenta.types.js'
import type { InterbankingTransferAccountV2 } from './interbanking-transfer-confection.js'

/** Datos bancarios Interbanking alineados a GET /v1/accounts (prod Bacar). */
const ROUTING_BY_CUENTA_ID: Record<string, InterbankingTransferAccountV2> = {
  'patagonia-cc': {
    bank_number: '034',
    account_type: 'CC',
    currency: 'ARS',
    account_number: '07070037003700020',
    account_cbu: '0340070800700370037009',
  },
  'julio-cc': {
    bank_number: '305',
    account_type: 'CC',
    currency: 'ARS',
    account_number: '00010101000130345',
    account_cbu: '3050001101010001303450',
  },
}

const ROUTING_BY_CBU = new Map<string, InterbankingTransferAccountV2>(
  Object.values(ROUTING_BY_CUENTA_ID)
    .filter((a) => a.account_cbu)
    .map((a) => [a.account_cbu!, a]),
)

const CUENTA_ID_BY_CBU = new Map<string, string>(
  Object.entries(ROUTING_BY_CUENTA_ID)
    .filter((entry): entry is [string, InterbankingTransferAccountV2 & { account_cbu: string }] =>
      Boolean(entry[1].account_cbu),
    )
    .map(([cuentaId, account]) => [account.account_cbu, cuentaId]),
)

/** Cuenta propia conocida a partir del CBU, sin exponer el número. */
export function findCuentaIdByCbu(cbuRaw: string): string | null {
  const cbu = cbuRaw.replace(/\D/g, '')
  return CUENTA_ID_BY_CBU.get(cbu) ?? null
}

export function resolveInterbankingDebitAccount(cuentaId: string): InterbankingTransferAccountV2 {
  const row = ROUTING_BY_CUENTA_ID[cuentaId]
  if (!row) {
    throw new Error(
      `Cuenta ${cuentaId} sin ruteo Interbanking. Agregá bank_number/account_number en interbanking-cuenta.routing.ts o Firestore.`,
    )
  }
  return { ...row }
}

export function resolveInterbankingCreditAccountByCbu(cbuRaw: string): InterbankingTransferAccountV2 {
  const cbu = cbuRaw.replace(/\D/g, '')
  if (cbu.length !== 22) {
    throw new Error('El CBU de la cuenta crédito debe tener 22 dígitos.')
  }
  const row = ROUTING_BY_CBU.get(cbu)
  if (!row) {
    throw new Error(
      `CBU crédito ${cbu} no está mapeado a una cuenta propia conocida (solo cuentas propias por ahora).`,
    )
  }
  return { ...row }
}

/** Valida que la cuenta Firestore sea CC ARS antes de debitar. */
export function assertCuentaDebitoCompatible(cuenta: CuentaDocument): void {
  if (cuenta.tipo !== 'CC') {
    throw new Error('La cuenta de débito debe ser una cuenta corriente (CC)')
  }
  if (cuenta.moneda !== 'ARS') {
    throw new Error('Solo transferencias ARS en cuentas propias v2 por ahora')
  }
}
