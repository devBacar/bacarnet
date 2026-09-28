import type { BancoNombre } from './cuenta.types.js'

/** Cuentas USD operadas a mano hasta que Interbanking las exponga en sync. */
export const MANUAL_USD_CUENTA_DEFS: ReadonlyArray<{
  cuentaId: string
  bancoNombre: BancoNombre
  bancoCodigoInterbanking: string
}> = [
  {
    cuentaId: 'patagonia-usd',
    bancoNombre: 'Patagonia',
    bancoCodigoInterbanking: 'MANUAL-PAT-USD',
  },
  {
    cuentaId: 'julio-usd',
    bancoNombre: 'Julio',
    bancoCodigoInterbanking: 'MANUAL-JUL-USD',
  },
  {
    cuentaId: 'cordoba-usd',
    bancoNombre: 'Córdoba',
    bancoCodigoInterbanking: 'MANUAL-COR-USD',
  },
]
