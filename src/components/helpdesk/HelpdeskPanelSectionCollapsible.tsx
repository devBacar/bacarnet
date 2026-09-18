import { ChevronDown } from 'lucide-react'

import { useState, type ReactNode } from 'react'

import { HelpdeskSectionNovedadDot } from './HelpdeskSectionNovedadDot'



export function HelpdeskPanelSectionCollapsible({

  title,

  summary,

  defaultOpen = false,

  open: openControlled,

  onOpenChange,

  badge,

  showNovedad = false,

  novedadSeccion,

  onSectionOpened,

  children,

  testId,

}: {

  title: string

  summary?: string

  defaultOpen?: boolean

  /** Modo acordeón: una sola sección abierta a la vez en el padre. */

  open?: boolean

  onOpenChange?: (open: boolean) => void

  badge?: string | number

  showNovedad?: boolean

  novedadSeccion?: string

  onSectionOpened?: () => void

  children: ReactNode

  testId?: string

}) {

  const [openInternal, setOpenInternal] = useState(defaultOpen)

  const controlled = openControlled !== undefined

  const open = controlled ? openControlled : openInternal



  const toggle = () => {
    const next = !open
    if (next) onSectionOpened?.()
    if (controlled) {
      onOpenChange?.(next)
    } else {
      setOpenInternal(next)
    }
  }



  return (

    <section

      className={`overflow-hidden rounded-xl border bg-white transition-colors dark:bg-zinc-900 ${

        open

          ? 'border-brand-primary/35 ring-1 ring-brand-primary/15 dark:border-brand-primary/40'

          : 'border-neutral-200 dark:border-zinc-800'

      }`}

      data-testid={testId}

      data-section-open={open ? 'true' : 'false'}

    >

      <button

        type="button"

        aria-expanded={open}

        onClick={toggle}

        className="flex w-full min-h-11 cursor-pointer items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary dark:hover:bg-zinc-800/80 sm:px-5"

        data-testid={testId ? `${testId}-toggle` : undefined}

      >

        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap items-center gap-2">

            <span className="text-sm font-semibold text-heading">{title}</span>

            {badge !== undefined && badge !== '' ? (

              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-body-muted dark:bg-zinc-800">

                {badge}

              </span>

            ) : null}

            {showNovedad && novedadSeccion ? (

              <HelpdeskSectionNovedadDot seccion={novedadSeccion} />

            ) : null}

          </div>

          {!open && summary ? (

            <p className="mt-1 line-clamp-2 text-xs text-body-muted">{summary}</p>

          ) : null}

        </div>

        <ChevronDown

          className={`mt-0.5 h-5 w-5 shrink-0 text-body-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`}

          aria-hidden

        />

      </button>

      <div

        className={`grid border-t border-neutral-100 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none dark:border-zinc-800 ${

          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'

        }`}

      >

        <div className="overflow-hidden">

          {open ? <div className="px-4 py-4 sm:px-5">{children}</div> : null}

        </div>

      </div>

    </section>

  )

}

