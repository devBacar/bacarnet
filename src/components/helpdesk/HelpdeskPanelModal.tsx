import type { ReactNode } from 'react'
import { WidgetDetailModal } from '../home/WidgetDetailModal'

/** Modal del panel mesa de ayuda (edición clara vs acordeones de solo lectura). */
export function HelpdeskPanelModal({
  open,
  title,
  titleId,
  testId,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  titleId: string
  testId: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <WidgetDetailModal
      open={open}
      title={title}
      titleId={titleId}
      testId={testId}
      onClose={onClose}
      footer={footer}
    >
      {children}
    </WidgetDetailModal>
  )
}
