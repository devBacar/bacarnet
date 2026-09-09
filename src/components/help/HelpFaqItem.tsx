import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import type { HelpFaq } from '../../content/helpCenter'

export function HelpFaqItem({ faq }: { faq: HelpFaq }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const buttonId = useId()

  return (
    <div className="border-b border-neutral-100 last:border-b-0 dark:border-zinc-800">
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 py-3.5 text-left transition-colors hover:text-brand-primary"
      >
        <span className="text-sm font-medium text-neutral-900 dark:text-gray-100">{faq.question}</span>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="pb-4 pr-2">
          <div className="space-y-2.5 text-sm leading-relaxed text-neutral-600 dark:text-gray-400">
            {faq.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
            {faq.bullets && faq.bullets.length > 0 ? (
              <ul className="list-disc space-y-1.5 pl-5">
                {faq.bullets.map((item) => (
                  <li key={item.slice(0, 48)}>{item}</li>
                ))}
              </ul>
            ) : null}
            {faq.where ? (
              <p className="rounded-lg border border-brand-primary/15 bg-brand-tint/40 px-3 py-2 text-xs text-brand-primary dark:border-brand-primary/25 dark:bg-brand-tint/10">
                <span className="font-semibold">Dónde en la app:</span> {faq.where}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
