import { ExternalLink, Loader2, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function WidgetDetailModal({
  open,
  title,
  onClose,
  children,
  footer,
  testId,
  titleId,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  testId: string
  titleId: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      data-testid={`${testId}-backdrop`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="app-modal-panel flex max-h-[min(90vh,40rem)] w-full max-w-2xl flex-col"
        data-testid={testId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <h2 id={titleId} className="text-lg font-semibold text-heading">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-body-muted hover:bg-neutral-100 dark:hover:bg-zinc-800"
            data-testid={`${testId}-close`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="app-modal-scroll flex-1 px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-neutral-200 px-5 py-4 dark:border-zinc-800">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}

export function WidgetDetailLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-body-muted">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      Cargando...
    </div>
  )
}

export function WidgetExternalLinkButton({
  href,
  label,
}: {
  href: string
  label: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:border-brand-primary/30 hover:bg-neutral-50 hover:text-brand-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:hover:border-brand-primary/40 dark:hover:bg-zinc-700 dark:hover:text-brand-primary"
    >
      {label}
      <ExternalLink className="h-4 w-4" />
    </a>
  )
}
