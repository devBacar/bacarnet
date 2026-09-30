import type { FinanzasCuenta, FinanzasSemaforo } from '../../services/finanzasApi'

/** Orden acordado para posición por banco y grupos de cuentas. */
export const FINANZAS_BANCO_ORDER = ['Julio', 'Patagonia', 'Córdoba'] as const

export const FINANZAS_TIPO_ORDER = ['CC', 'USD'] as const

export interface PosicionPorBancoRow {
  bancoNombre: string
  arsCentavos: number
  usdCentavos: number
  semaforoCc: FinanzasSemaforo | null
  /** Límite acordado de la CC en pesos; null si no está cargado. */
  descubiertoCentavos: number | null
  /** Saldo en pesos + descubierto acordado (lo que queda para usar); null sin descubierto. */
  disponibleCentavos: number | null
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
    let descubiertoCentavos: number | null = null

    for (const cuenta of bankAccounts) {
      if (cuenta.tipo === 'USD') {
        usdCentavos += cuenta.saldoActualCentavos
      } else if (cuenta.tipo === 'CC') {
        arsCentavos += cuenta.saldoActualCentavos
        semaforoCc = cuenta.descubierto?.semaforo ?? null
        if (cuenta.descubiertoCentavos != null && cuenta.descubiertoCentavos > 0) {
          descubiertoCentavos = (descubiertoCentavos ?? 0) + cuenta.descubiertoCentavos
        }
      }
    }

    const disponibleCentavos = descubiertoCentavos == null ? null : arsCentavos + descubiertoCentavos
    return { bancoNombre, arsCentavos, usdCentavos, semaforoCc, descubiertoCentavos, disponibleCentavos }
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
