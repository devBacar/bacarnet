import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import type { WeatherIcon } from '../../services/dailyUtilityService'

const STANDARD_ICONS: Record<
  Exclude<WeatherIcon, 'cloud-lightning-rain'>,
  LucideIcon
> = {
  sun: Sun,
  moon: Moon,
  'mostly-clear': Sun,
  'partly-cloudy': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  'cloud-rain': CloudRain,
  'cloud-snow': CloudSnow,
  'cloud-lightning': CloudLightning,
}

/** Tormenta con lluvia / granizo — composición de dos íconos. */
export function CloudLightningRainGlyph({ className }: { className?: string }) {
  return (
    <span className={`relative inline-block ${className ?? ''}`}>
      <CloudRain className="h-full w-full" strokeWidth={1.75} />
      <CloudLightning
        className="absolute -right-[6%] -top-[12%] h-[55%] w-[55%]"
        strokeWidth={2.25}
      />
    </span>
  )
}

export function WeatherIconGlyph({
  icon,
  className,
}: {
  icon: WeatherIcon
  className?: string
}) {
  if (icon === 'cloud-lightning-rain') {
    return <CloudLightningRainGlyph className={className} />
  }

  const Icon = STANDARD_ICONS[icon]
  return <Icon className={className} aria-hidden strokeWidth={1.75} />
}

/** Colores del ícono ambiental según condición (modo claro). */
export function getWeatherIconTone(icon: WeatherIcon): string {
  switch (icon) {
    case 'sun':
      return 'text-amber-500/45 dark:text-amber-300/35'
    case 'moon':
      return 'text-indigo-400/40 dark:text-indigo-300/30'
    case 'mostly-clear':
      return 'text-amber-500/40 dark:text-amber-300/32'
    case 'partly-cloudy':
      return 'text-slate-400/38 dark:text-slate-300/30'
    case 'cloud':
    case 'fog':
      return 'text-slate-400/40 dark:text-slate-300/30'
    case 'cloud-rain':
      return 'text-sky-600/40 dark:text-sky-400/32'
    case 'cloud-snow':
      return 'text-sky-400/45 dark:text-sky-200/35'
    case 'cloud-lightning':
      return 'text-violet-600/42 dark:text-violet-400/35'
    case 'cloud-lightning-rain':
      return 'text-violet-700/45 dark:text-violet-300/38'
    default:
      return 'text-slate-400/40'
  }
}

/** Colores del ícono pequeño junto a la temperatura. */
export function getWeatherInlineIconTone(icon: WeatherIcon): string {
  switch (icon) {
    case 'sun':
      return 'text-amber-500 dark:text-amber-300'
    case 'moon':
      return 'text-indigo-500 dark:text-indigo-300'
    case 'mostly-clear':
      return 'text-amber-500 dark:text-amber-300'
    case 'partly-cloudy':
      return 'text-slate-500 dark:text-slate-300'
    case 'cloud':
    case 'fog':
      return 'text-slate-500 dark:text-slate-300'
    case 'cloud-rain':
      return 'text-sky-600 dark:text-sky-400'
    case 'cloud-snow':
      return 'text-sky-500 dark:text-sky-200'
    case 'cloud-lightning':
      return 'text-violet-600 dark:text-violet-400'
    case 'cloud-lightning-rain':
      return 'text-violet-700 dark:text-violet-300'
    default:
      return 'text-slate-500'
  }
}

export function getWeatherIconLabel(icon: WeatherIcon): string {
  switch (icon) {
    case 'sun':
      return 'Sol'
    case 'moon':
      return 'Luna'
    case 'mostly-clear':
      return 'Mayormente despejado'
    case 'partly-cloudy':
      return 'Parcialmente nublado'
    case 'cloud':
      return 'Nublado'
    case 'fog':
      return 'Niebla'
    case 'cloud-rain':
      return 'Lluvia'
    case 'cloud-snow':
      return 'Nieve'
    case 'cloud-lightning':
      return 'Tormenta eléctrica'
    case 'cloud-lightning-rain':
      return 'Tormenta con lluvia'
    default:
      return 'Clima'
  }
}
