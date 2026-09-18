import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'

/** Acordeón secundario dentro de una sección del panel (menos ruido visual). */
export function HelpdeskPanelInnerDisclosure({
  title,
  summary,
  defaultOpen = false,
  children,
  testId,
  onOpened,
}: {
  title: string
  summary?: string
  defaultOpen?: boolean
  children: ReactNode
  testId?: string
  onOpened?: () => void
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className="rounded-lg border border-neutral-100 bg-neutral-50/60 dark:border-zinc-800 dark:bg-zinc-950/30"
      data-testid={testId}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() =>
          setOpen((v) => {
            if (!v) onOpened?.()
            return !v
          })
        }
        className="flex w-full min-h-10 cursor-pointer items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-neutral-100/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary dark:hover:bg-zinc-800/60"
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-heading">{title}</p>
          {!open && summary ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-body-muted">{summary}</p>
          ) : null}
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-body-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      <div
        className={`grid border-t border-neutral-100 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none dark:border-zinc-800 ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {open ? <div className="px-3 py-3">{children}</div> : null}
        </div>
      </div>
    </div>
  )
}
