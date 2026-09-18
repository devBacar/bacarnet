import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAprobacionesModal } from '../context/AprobacionesModalContext'

/** Deep link legacy: abre el modal y vuelve al inicio sin pantalla dedicada. */
export function AprobacionesPendientes() {
  const { openModal } = useAprobacionesModal()
  const navigate = useNavigate()

  useEffect(() => {
    openModal()
    navigate('/intranet', { replace: true })
  }, [openModal, navigate])

  return null
}
