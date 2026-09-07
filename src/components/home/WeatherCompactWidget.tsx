import { useEffect, useState } from 'react'
import type { WeatherSnapshot } from '../../services/dailyUtilityService'
import { WeatherIconGlyph } from '../weather/weatherIcons'
import { getWeatherCardTheme, type WeatherCardTheme } from './weatherCardTheme'

interface WeatherCompactWidgetProps {
  weather: WeatherSnapshot | null
  theme?: WeatherCardTheme
}

function useCordobaClock(active: boolean) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [active])

  const timeZone = 'America/Argentina/Cordoba'
  const time = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(now)

  const date = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(now)

  return { time, date }
}

export function WeatherCompactWidget({ weather, theme: themeProp }: WeatherCompactWidgetProps) {
  const icon = weather?.icon ?? 'cloud'
  const theme = themeProp ?? getWeatherCardTheme(icon)
  const label = weather?.description ?? 'Córdoba'
  const { time, date } = useCordobaClock(Boolean(weather))
  const light = theme.usesLightText

  return (
    <div
      className="relative z-10 min-w-[10rem]"
      title={weather ? `Córdoba · ${weather.description}` : 'Clima · Córdoba'}
    >
      <div className="grid grid-cols-2 grid-rows-2 gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5 self-start">
          {weather ? (
            <WeatherIconGlyph
              icon={icon}
              className={`h-4 w-4 shrink-0 ${light ? 'text-white/95' : 'text-slate-600'}`}
            />
          ) : null}
          <span
            className={`text-xs font-medium leading-tight ${light ? 'text-white/90' : 'text-slate-600'}`}
          >
            {weather ? label : 'Cargando…'}
          </span>
        </div>

        <p
          className="self-start justify-self-end text-xl font-semibold tabular-nums leading-none sm:text-2xl"
          style={{ color: theme.timeColor }}
        >
          {weather ? time : '--:--'}
        </p>

        <p
          className={`self-end text-2xl font-bold tabular-nums leading-none tracking-tight sm:text-3xl ${
            light ? 'text-white' : 'text-slate-800'
          }`}
        >
          {weather ? `${Math.round(weather.temperature)}°` : '—'}
        </p>

        <div className={`self-end justify-self-end text-right leading-tight ${light ? 'text-white/80' : 'text-slate-600'}`}>
          <p className="text-[10px] font-medium capitalize">{date}</p>
          <p className={`text-[10px] ${light ? 'text-white/65' : 'text-slate-500'}`}>Córdoba</p>
        </div>
      </div>
    </div>
  )
}
