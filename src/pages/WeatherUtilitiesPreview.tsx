import { HomeUtilitiesAmbientPanel } from '../components/home/HomeUtilitiesAmbientPanel'
import { HomeDollarWidget } from '../components/home/HomeDollarWidget'
import { WeatherCompactWidget } from '../components/home/WeatherCompactWidget'
import type { WeatherIcon, WeatherSnapshot } from '../services/dailyUtilityService'

const MOCK_WEATHER: Record<WeatherIcon, WeatherSnapshot> = {
  sun: { icon: 'sun', temperature: 34, description: 'Despejado', isDay: true },
  moon: { icon: 'moon', temperature: 18, description: 'Despejado', isDay: false },
  cloud: { icon: 'cloud', temperature: 21, description: 'Nublado', isDay: true },
  'cloud-sun': { icon: 'cloud-sun', temperature: 22, description: 'Parcialmente nublado', isDay: true },
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

  return (
    <header className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-primary">BacarNet</p>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-gray-100 sm:text-3xl">¡Hola, Usuario!</h1>
          <p className="mt-2 max-w-xl text-sm text-neutral-600 dark:text-gray-400">
            Encontrá tus herramientas, accesos e información en un solo lugar.
          </p>
        </div>
        <HomeUtilitiesAmbientPanel>
          <div className="flex h-full min-h-[7.5rem] flex-col items-end justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200/80 bg-white/70 text-neutral-500 dark:border-zinc-600 dark:bg-zinc-900/70">
              ⚙
            </div>
            <div className="flex w-full flex-col items-end justify-end gap-2 sm:gap-3">
              <WeatherCompactWidget weather={weather} />
              <HomeDollarWidget compact />
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
