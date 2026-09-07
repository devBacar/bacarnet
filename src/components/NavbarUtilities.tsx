import { DollarSign } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  fetchCordobaWeather,
  fetchFxQuotes,
  formatArs,
  type FxQuote,
  type WeatherSnapshot,
} from '../services/dailyUtilityService'
import { getWeatherInlineIconTone, WeatherIconGlyph } from './weather/weatherIcons'

const LIVE_REFRESH_MS = 60_000

function QuoteItems({ quotes, keyPrefix }: { quotes: FxQuote[]; keyPrefix: string }) {
  return (
    <>
      {quotes.map((quote) => (
        <div key={`${keyPrefix}-${quote.id}`} className="flex shrink-0 items-center gap-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
            {quote.label}
          </span>
          <span className="text-xs tabular-nums text-neutral-700 dark:text-gray-300">
            <span className="text-neutral-400 dark:text-zinc-500">C</span> ${formatArs(quote.compra)}
          </span>
          <span className="text-xs font-semibold tabular-nums text-neutral-900 dark:text-gray-100">
            <span className="font-normal text-neutral-400 dark:text-zinc-500">V</span>{' '}
            ${formatArs(quote.venta)}
          </span>
          <span
            className="ml-1 h-3 w-px shrink-0 bg-neutral-200 dark:bg-zinc-700"
            aria-hidden
          />
        </div>
      ))}
    </>
  )
}

export function NavbarUtilities() {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [quotes, setQuotes] = useState<FxQuote[]>([])

  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null

    const load = async () => {
      controller?.abort()
      controller = new AbortController()

      const [weatherResult, fxResult] = await Promise.allSettled([
        fetchCordobaWeather(controller.signal),
        fetchFxQuotes(controller.signal),
      ])

      if (cancelled || controller.signal.aborted) return

      if (weatherResult.status === 'fulfilled') {
        setWeather(weatherResult.value)
      }

      if (fxResult.status === 'fulfilled') {
        setQuotes(fxResult.value)
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

  const weatherIcon = weather?.icon ?? 'cloud'

  return (
    <div className="hidden items-center gap-2 lg:flex">
      <div
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        title={weather ? `Córdoba · ${weather.description}` : 'Clima'}
      >
        <WeatherIconGlyph
          icon={weatherIcon}
          className={`h-3.5 w-3.5 shrink-0 ${getWeatherInlineIconTone(weatherIcon)}`}
        />
        <span className="text-xs font-semibold tabular-nums text-neutral-800 dark:text-gray-100">
          {weather ? `${Math.round(weather.temperature)}°` : '—'}
        </span>
        <span className="hidden text-[11px] text-neutral-500 xl:inline dark:text-gray-400">
          Cba
        </span>
      </div>

      <div
        className="relative flex w-[min(22rem,28vw)] items-center gap-2 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pl-2 pr-2 dark:border-zinc-700 dark:bg-zinc-900"
        title="Cotizaciones en vivo · actualiza cada 1 min"
      >
        <DollarSign className="relative z-10 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-neutral-50 to-transparent dark:from-zinc-900" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-neutral-50 to-transparent dark:from-zinc-900" />

          {quotes.length === 0 ? (
            <span className="text-xs tabular-nums text-neutral-500 dark:text-gray-400">—</span>
          ) : (
            <div className="fx-marquee-track" aria-live="polite">
              <div className="flex shrink-0 items-center gap-1">
                <QuoteItems quotes={quotes} keyPrefix="a" />
              </div>
              <div className="flex shrink-0 items-center gap-1" aria-hidden>
                <QuoteItems quotes={quotes} keyPrefix="b" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
