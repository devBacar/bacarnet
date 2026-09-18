import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AprobacionesPendientesModal } from '../components/helpdesk/AprobacionesPendientesModal'

type AprobacionesModalContextValue = {
  openModal: () => void
  closeModal: () => void
  isOpen: boolean
}

const AprobacionesModalContext = createContext<AprobacionesModalContextValue | null>(null)

export function AprobacionesModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const openModal = useCallback(() => setOpen(true), [])
  const closeModal = useCallback(() => setOpen(false), [])

  const value = useMemo(
    () => ({ openModal, closeModal, isOpen: open }),
    [openModal, closeModal, open],
  )

  return (
    <AprobacionesModalContext.Provider value={value}>
      {children}
      <AprobacionesPendientesModal open={open} onClose={closeModal} />
    </AprobacionesModalContext.Provider>
  )
}

export function useAprobacionesModal(): AprobacionesModalContextValue {
  const ctx = useContext(AprobacionesModalContext)
  if (!ctx) {
    throw new Error('useAprobacionesModal debe usarse dentro de AprobacionesModalProvider')
  }
  return ctx
}
