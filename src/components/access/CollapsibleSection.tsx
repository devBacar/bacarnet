import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  title: string
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 dark:border-zinc-800 dark:hover:bg-zinc-950"
      >
        <span className="text-sm font-medium">
          {title}
          {count !== undefined ? (
            <span className="ml-1.5 font-normal text-neutral-500 dark:text-zinc-400">({count})</span>
          ) : null}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </section>
  )
}
