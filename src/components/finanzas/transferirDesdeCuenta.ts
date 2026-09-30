import { createContext, useContext, type Context } from 'react'

export const TransferirDesdeCuentaContext: Context<((cuentaId: string) => void) | null> =
  createContext<((cuentaId: string) => void) | null>(null)

export function useTransferirDesdeCuenta(): ((cuentaId: string) => void) | null {
  return useContext(TransferirDesdeCuentaContext)
}
