import type { ReactNode } from 'react'
import type { WeatherIcon } from '../../services/dailyUtilityService'

export function ambientAnimationClass(icon: WeatherIcon): string {
  if (icon === 'cloud-lightning' || icon === 'cloud-lightning-rain') {
    return 'weather-ambient-storm'
  }
  return 'weather-ambient-drift'
}

interface HomeUtilitiesAmbientPanelProps {
  children: ReactNode
  className?: string
}

/** Columna lateral del saludo (clima + cotizaciones). El degradé vive en el header. */
export function HomeUtilitiesAmbientPanel({
  children,
  className = '',
}: HomeUtilitiesAmbientPanelProps) {
  return (
    <div
      className={`relative min-h-[7.5rem] w-full lg:min-h-0 lg:w-auto lg:min-w-[17rem] lg:max-w-[22rem] lg:shrink-0 ${className}`}
    >
      <div className="relative z-10 h-full">{children}</div>
    </div>
  )
}
