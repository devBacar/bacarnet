import { Mail } from 'lucide-react'
import { useCallback, useRef } from 'react'
import { HelpFaqItem } from '../components/help/HelpFaqItem'
import { HELP_CATEGORIES, HELP_CONTACT_EMAIL, HelpPageIcon } from '../content/helpCenter'

export function HelpCenter() {
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  const scrollToCategory = useCallback((categoryId: string) => {
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-brand-primary">
          <HelpPageIcon className="h-6 w-6" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Centro de ayuda</p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-heading sm:text-3xl">
          Cómo usar BacarNet
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-body-muted">
          Respuestas rápidas sobre lo más usado en la intranet, sin jerga técnica. Abrí solo la
          sección que te interese.
        </p>
      </header>

      <nav aria-label="Secciones de ayuda" className="-mx-1 flex flex-wrap gap-2 px-1 pb-1">
        {HELP_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => scrollToCategory(category.id)}
            className="rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-primary/30 hover:bg-brand-tint/30 hover:text-brand-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300 dark:hover:border-brand-primary/40"
          >
            {category.title}
          </button>
        ))}
      </nav>

      <div className="space-y-5">
        {HELP_CATEGORIES.map((category) => {
          const Icon = category.icon
          return (
            <section
              key={category.id}
              id={`help-${category.id}`}
              ref={(node) => {
                sectionRefs.current[category.id] = node
              }}
              className="scroll-mt-24 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="border-b border-neutral-100 px-4 py-4 dark:border-zinc-800 sm:px-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint/50 text-brand-primary dark:bg-brand-tint/20">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-heading">{category.title}</h2>
                      {category.badge ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                          {category.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-body-muted">{category.description}</p>
                  </div>
                </div>
              </div>
              <div className="px-4 sm:px-5">
                {category.faqs.map((faq) => (
                  <HelpFaqItem key={faq.id} faq={faq} />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-zinc-800 dark:bg-zinc-950/60">
        <h2 className="text-base font-semibold text-heading">¿Seguís con dudas?</h2>
        <p className="mt-2 text-sm leading-relaxed text-body-muted">
          Si algo no está acá o no te funciona como describe, escribile al equipo de Sistemas con
          captura de pantalla y el paso en el que te trabaste.
        </p>
        <a
          href={`mailto:${HELP_CONTACT_EMAIL}`}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-primary hover:underline"
        >
          <Mail className="h-4 w-4" aria-hidden />
          {HELP_CONTACT_EMAIL}
        </a>
      </section>
    </div>
  )
}
