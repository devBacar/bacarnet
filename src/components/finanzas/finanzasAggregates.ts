import type { FinanzasCuenta, FinanzasSemaforo } from '../../services/finanzasApi'

/** Orden acordado para posición por banco y grupos de cuentas. */
export const FINANZAS_BANCO_ORDER = ['Julio', 'Patagonia', 'Córdoba'] as const

export const FINANZAS_TIPO_ORDER = ['CA', 'CC', 'USD'] as const

export interface PosicionPorBancoRow {
  bancoNombre: string
  arsCentavos: number
  usdCentavos: number
  semaforoCc: FinanzasSemaforo | null
}

export function posicionTag(centavos: number): '(a cubrir)' | '(a favor)' {
  return centavos < 0 ? '(a cubrir)' : '(a favor)'
}

export function computePosicionPorBanco(cuentas: FinanzasCuenta[]): PosicionPorBancoRow[] {
  const byBanco = new Map<string, FinanzasCuenta[]>()
  for (const cuenta of cuentas) {
    const list = byBanco.get(cuenta.bancoNombre) ?? []
    list.push(cuenta)
    byBanco.set(cuenta.bancoNombre, list)
  }

  const orderedBancos = [
    ...FINANZAS_BANCO_ORDER.filter((name) => byBanco.has(name)),
    ...[...byBanco.keys()].filter(
      (name) => !FINANZAS_BANCO_ORDER.includes(name as (typeof FINANZAS_BANCO_ORDER)[number]),
    ),
  ]

  return orderedBancos.map((bancoNombre) => {
    const bankAccounts = byBanco.get(bancoNombre) ?? []
    let arsCentavos = 0
    let usdCentavos = 0
    let semaforoCc: FinanzasSemaforo | null = null

    for (const cuenta of bankAccounts) {
      if (cuenta.moneda === 'USD') {
        usdCentavos += cuenta.saldoActualCentavos
      } else {
        arsCentavos += cuenta.saldoActualCentavos
      }
      if (cuenta.tipo === 'CC') {
        semaforoCc = cuenta.descubierto?.semaforo ?? null
      }
    }

    return { bancoNombre, arsCentavos, usdCentavos, semaforoCc }
  })
}

export function groupCuentasByBanco(cuentas: FinanzasCuenta[]): Array<{
  bancoNombre: string
  cuentas: FinanzasCuenta[]
}> {
  const byBanco = new Map<string, FinanzasCuenta[]>()
  for (const cuenta of cuentas) {
    const list = byBanco.get(cuenta.bancoNombre) ?? []
    list.push(cuenta)
    byBanco.set(cuenta.bancoNombre, list)
  }

  const orderedBancos = [
    ...FINANZAS_BANCO_ORDER.filter((name) => byBanco.has(name)),
    ...[...byBanco.keys()].filter(
      (name) => !FINANZAS_BANCO_ORDER.includes(name as (typeof FINANZAS_BANCO_ORDER)[number]),
    ),
  ]

  return orderedBancos.map((bancoNombre) => {
    const bankCuentas = [...(byBanco.get(bancoNombre) ?? [])].sort(
      (a, b) =>
        FINANZAS_TIPO_ORDER.indexOf(a.tipo) - FINANZAS_TIPO_ORDER.indexOf(b.tipo),
    )
    return { bancoNombre, cuentas: bankCuentas }
  })
}
