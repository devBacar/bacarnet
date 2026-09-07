import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useLocalStorage } from '../../hooks/useLocalStorage'

interface HomeCollapsibleSectionProps {
  title: string
  subtitle?: string
  headerAction?: ReactNode
  storageKey: string
  defaultExpanded?: boolean
  children: ReactNode
}

export function HomeCollapsibleSection({
  title,
  subtitle,
  headerAction,
  storageKey,
  defaultExpanded = true,
  children,
}: HomeCollapsibleSectionProps) {
  const [expanded, setExpanded] = useLocalStorage<boolean>(
    `intranet_home_section_${storageKey}`,
    defaultExpanded,
  )
  const [contentVisible, setContentVisible] = useState(expanded)

  const toggle = () => {
    if (expanded) {
      setExpanded(false)
      setContentVisible(false)
    } else {
      setExpanded(true)
      setContentVisible(true)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div
        className={`flex items-start gap-2 px-4 sm:px-6 lg:px-8 ${
          expanded ? 'pt-4 sm:pt-6 lg:pt-8 lg:pb-0' : 'py-3 sm:py-4'
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
          aria-label={expanded ? 'Comprimir sección' : 'Expandir sección'}
        >
          <ChevronDown
            className={`h-5 w-5 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
          />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={toggle}
            className="w-full text-left"
            aria-expanded={expanded}
          >
            <h2 className="text-lg font-bold text-neutral-900 dark:text-gray-100">{title}</h2>
            {subtitle && expanded ? (
              <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">{subtitle}</p>
            ) : null}
          </button>
        </div>
        {expanded && headerAction ? (
          <div className="shrink-0">{headerAction}</div>
        ) : null}
      </div>

      {contentVisible ? (
        <div className="px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8 lg:pt-4">
          {children}
        </div>
      ) : null}
    </section>
  )
}
