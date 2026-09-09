import { HomeUtilitiesAmbientPanel } from '../components/home/HomeUtilitiesAmbientPanel'
import { HomeDollarWidget } from '../components/home/HomeDollarWidget'
import { WeatherCardDecor } from '../components/home/WeatherCardDecor'
import { getWeatherCardTheme } from '../components/home/weatherCardTheme'
import { WeatherCompactWidget } from '../components/home/WeatherCompactWidget'
import type { WeatherIcon, WeatherSnapshot } from '../services/dailyUtilityService'

const MOCK_WEATHER: Record<WeatherIcon, WeatherSnapshot> = {
  sun: { icon: 'sun', temperature: 34, description: 'Despejado', isDay: true },
  moon: { icon: 'moon', temperature: 18, description: 'Despejado', isDay: false },
  cloud: { icon: 'cloud', temperature: 21, description: 'Nublado', isDay: true },
  'mostly-clear': { icon: 'mostly-clear', temperature: 24, description: 'Mayormente despejado', isDay: true },
  'partly-cloudy': { icon: 'partly-cloudy', temperature: 18, description: 'Parcialmente nublado', isDay: true },
  fog: { icon: 'fog', temperature: 16, description: 'Neblina', isDay: true },
  'cloud-rain': { icon: 'cloud-rain', temperature: 17, description: 'Lluvia ligera', isDay: true },
  'cloud-snow': { icon: 'cloud-snow', temperature: 4, description: 'Nieve', isDay: true },
  'cloud-lightning': { icon: 'cloud-lightning', temperature: 19, description: 'Tormenta', isDay: true },
  'cloud-lightning-rain': {
    icon: 'cloud-lightning-rain',
    temperature: 18,
    description: 'Tormenta con lluvia',
    isDay: true,
  },
}

function HeaderZonePreview({ icon }: { icon: WeatherIcon }) {
  const weather = MOCK_WEATHER[icon]
  const theme = getWeatherCardTheme(icon)
  const lightText = theme.usesLightText

  return (
    <header className="relative overflow-hidden rounded-xl border border-transparent shadow-md">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <div className="absolute inset-0" style={{ background: theme.gradient }} />
        <div className="weather-header-bg absolute inset-0 overflow-hidden">
          <WeatherCardDecor icon={icon} />
        </div>
      </div>
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <p className={`mb-1 text-xs font-semibold uppercase tracking-widest ${lightText ? 'text-white/80' : 'text-brand-primary'}`}>
            BacarNet
          </p>
          <h1 className={`text-2xl font-bold sm:text-3xl ${lightText ? 'text-white' : 'text-neutral-900 dark:text-gray-100'}`}>
            ¡Hola, Usuario!
          </h1>
          <p className={`mt-2 max-w-xl text-sm ${lightText ? 'text-white/85' : 'text-neutral-600 dark:text-gray-400'}`}>
            Encontrá tus herramientas, accesos e información en un solo lugar.
          </p>
        </div>
        <HomeUtilitiesAmbientPanel>
          <div className="flex h-full min-h-[7.5rem] flex-col items-end justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white/70">
              ⚙
            </div>
            <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
              <WeatherCompactWidget weather={weather} theme={theme} />
              <HomeDollarWidget compact light={lightText} />
            </div>
          </div>
        </HomeUtilitiesAmbientPanel>
      </div>
    </header>
  )
}

/** Vista previa local del panel clima + dólar (solo dev). */
export function WeatherUtilitiesPreview() {
  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-primary">
            Vista previa · dev
          </p>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-gray-100">
            Tarjeta ilustrada de clima
          </h1>
        </div>

        <div className="grid gap-6">
          {(Object.keys(MOCK_WEATHER) as WeatherIcon[]).map((icon) => (
            <div key={icon}>
              <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-gray-400">{icon}</p>
              <HeaderZonePreview icon={icon} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
