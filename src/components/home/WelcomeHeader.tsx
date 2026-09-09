import { useEffect, useState } from 'react'
import { resolveHomeWidgetPreferences } from '../../constants/homeWidgets'
import {
  fetchCordobaWeather,
  type WeatherSnapshot,
} from '../../services/dailyUtilityService'
import type { UserProfile } from '../../services/userService'
import { HomeUtilitiesAmbientPanel } from './HomeUtilitiesAmbientPanel'
import { HomeDollarWidget } from './HomeDollarWidget'
import { HomeWidgetSettingsMenu } from './HomeWidgetSettingsMenu'
import { WeatherCardDecor } from './WeatherCardDecor'
import { getWeatherCardTheme } from './weatherCardTheme'
import { WeatherCompactWidget } from './WeatherCompactWidget'

const WEATHER_REFRESH_MS = 60_000

interface WelcomeHeaderProps {
  userProfile: UserProfile
  displayName: string
  onPreferencesUpdated: () => void | Promise<void>
  birthdayToday?: boolean
}

export function WelcomeHeader({
  userProfile,
  displayName,
  onPreferencesUpdated,
  birthdayToday = false,
}: WelcomeHeaderProps) {
  const [preferences, setPreferences] = useState(() =>
    resolveHomeWidgetPreferences(userProfile.widgetPreferences),
  )
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)

  useEffect(() => {
    setPreferences(resolveHomeWidgetPreferences(userProfile.widgetPreferences))
  }, [userProfile.widgetPreferences])

  const showWeather = preferences.weather
  const showDollar = preferences.dollar
  const showUtilitiesPanel = showWeather || showDollar

  useEffect(() => {
    if (!showWeather) {
      setWeather(null)
      return
    }

    let cancelled = false
    let controller: AbortController | null = null

    const load = async () => {
      controller?.abort()
      controller = new AbortController()

      try {
        const value = await fetchCordobaWeather(controller.signal)
        if (!cancelled) setWeather(value)
      } catch {
        if (!cancelled) setWeather(null)
      }
    }

    void load()
    const intervalId = window.setInterval(() => {
      void load()
    }, WEATHER_REFRESH_MS)

    return () => {
      cancelled = true
      controller?.abort()
      window.clearInterval(intervalId)
    }
  }, [showWeather])

  const handlePreferencesUpdated = (next: typeof preferences) => {
    setPreferences(next)
    void onPreferencesUpdated()
  }

  const weatherIcon = weather?.icon ?? 'cloud'
  const weatherTheme = showWeather ? getWeatherCardTheme(weatherIcon) : null
  const lightText = weatherTheme?.usesLightText ?? false

  return (
    <header
      className={`relative rounded-xl border ${
        showWeather
          ? 'border-transparent shadow-md'
          : 'border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
      }`}
    >
      {showWeather && weatherTheme ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
        >
          <div
            className="absolute inset-0"
            style={{ background: weatherTheme.gradient }}
          />
          <div className="weather-header-bg absolute inset-0 overflow-hidden">
            <WeatherCardDecor icon={weatherIcon} />
          </div>
        </div>
      ) : null}

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <p
            className={`mb-1 text-xs font-semibold uppercase tracking-widest ${
              showWeather
                ? lightText
                  ? 'text-white/80'
                  : 'text-brand-primary'
                : 'text-brand-primary'
            }`}
          >
            BacarNet
          </p>
          <h1
            className={`break-words text-2xl font-bold tracking-tight sm:text-3xl ${
              showWeather
                ? lightText
                  ? 'text-white'
                  : 'text-neutral-900 dark:text-gray-100'
                : 'text-neutral-900 dark:text-gray-100'
            }`}
          >
            {birthdayToday ? `¡Feliz cumpleaños, ${displayName}!` : `¡Hola, ${displayName}!`}
          </h1>
          <p
            className={`mt-2 max-w-xl text-sm ${
              showWeather
                ? lightText
                  ? 'text-white/85'
                  : 'text-neutral-600 dark:text-gray-400'
                : 'text-neutral-600 dark:text-gray-400'
            }`}
          >
            {birthdayToday
              ? 'Te deseamos un excelente día. Gracias por ser parte del equipo.'
              : 'Encontrá tus herramientas, accesos e información en un solo lugar.'}
          </p>
        </div>

        {showUtilitiesPanel ? (
          <HomeUtilitiesAmbientPanel>
            <div className="flex h-full min-h-[7.5rem] flex-col items-end justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
              <HomeWidgetSettingsMenu
                userId={userProfile.uid}
                preferences={preferences}
                onUpdated={handlePreferencesUpdated}
                light={showWeather && lightText}
              />
              <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
                {showWeather ? (
                  <WeatherCompactWidget weather={weather} theme={weatherTheme ?? undefined} />
                ) : null}
                {showDollar ? <HomeDollarWidget compact light={showWeather && lightText} /> : null}
              </div>
            </div>
          </HomeUtilitiesAmbientPanel>
        ) : (
          <div className="flex shrink-0 items-start justify-end px-4 pb-4 sm:px-6 sm:pb-6 lg:px-6 lg:py-6">
            <HomeWidgetSettingsMenu
              userId={userProfile.uid}
              preferences={preferences}
              onUpdated={handlePreferencesUpdated}
            />
          </div>
        )}
      </div>
    </header>
  )
}
