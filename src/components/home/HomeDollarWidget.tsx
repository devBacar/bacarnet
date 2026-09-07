import { DollarSign } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  fetchFxQuotes,
  formatArs,
  type FxQuote,
} from '../../services/dailyUtilityService'

const LIVE_REFRESH_MS = 60_000

function FxMarquee({
  quotes,
  compact = false,
  light = false,
}: {
  quotes: FxQuote[]
  compact?: boolean
  light?: boolean
}) {
  if (quotes.length === 0) {
    return (
      <span className={`text-xs ${light ? 'text-white/70' : 'text-neutral-500 dark:text-gray-400'}`}>
        —
      </span>
    )
  }

  const item = (quote: FxQuote, prefix: string) => (
    <div key={`${prefix}-${quote.id}`} className="flex shrink-0 items-center gap-1.5 px-0.5">
      <span
        className={`text-[10px] font-semibold uppercase tracking-wide ${
          light ? 'text-white/70' : 'text-neutral-500 dark:text-gray-400'
        }`}
      >
        {quote.label}
      </span>
      <span
        className={`text-xs font-semibold tabular-nums ${
          light ? 'text-white' : 'text-neutral-900 dark:text-gray-100'
        }`}
      >
        ${formatArs(quote.venta)}
      </span>
      <span
        className={`mx-0.5 h-3 w-px ${light ? 'bg-white/25' : 'bg-neutral-200 dark:bg-zinc-700'}`}
        aria-hidden
      />
    </div>
  )

  return (
    <div
      className={
        compact
          ? 'relative min-w-[9rem] max-w-[14rem] overflow-hidden sm:max-w-[16rem]'
          : 'relative min-w-[9rem] max-w-[14rem] overflow-hidden sm:max-w-[16rem]'
      }
    >
      {!compact ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-3 bg-gradient-to-r from-white to-transparent dark:from-zinc-900" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-3 bg-gradient-to-l from-white to-transparent dark:from-zinc-900" />
        </>
      ) : null}
      <div className="fx-marquee-track" aria-live="polite">
        <div className="flex shrink-0 items-center gap-1">
          {quotes.map((quote) => item(quote, 'a'))}
        </div>
        <div className="flex shrink-0 items-center gap-1" aria-hidden>
          {quotes.map((quote) => item(quote, 'b'))}
        </div>
      </div>
    </div>
  )
}

export function HomeDollarWidget({
  compact = false,
  light = false,
}: {
  compact?: boolean
  light?: boolean
}) {
  const [quotes, setQuotes] = useState<FxQuote[]>([])

  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null

    const load = async () => {
      controller?.abort()
      controller = new AbortController()

      try {
        const value = await fetchFxQuotes(controller.signal)
        if (!cancelled) setQuotes(value)
      } catch {
        if (!cancelled) setQuotes([])
      }
    }

    void load()
    const intervalId = window.setInterval(() => {
      void load()
    }, LIVE_REFRESH_MS)

    return () => {
      cancelled = true
      controller?.abort()
      window.clearInterval(intervalId)
    }
  }, [])

  if (compact) {
    return (
      <div className="relative z-10 inline-flex h-10 items-center gap-2 px-1" title="Cotizaciones en vivo">
        <DollarSign
          className={`h-4 w-4 shrink-0 ${light ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400'}`}
        />
        <FxMarquee quotes={quotes} compact light={light} />
      </div>
    )
  }

  return (
    <div
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white/90 px-3 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/90"
      title="Cotizaciones en vivo"
    >
      <DollarSign className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <FxMarquee quotes={quotes} />
    </div>
  )
}
