import type { WeatherIcon } from '../../services/dailyUtilityService'
import { getWeatherCardTheme } from './weatherCardTheme'

interface WeatherCardDecorProps {
  icon: WeatherIcon
}

export function WeatherCardDecor({ icon }: WeatherCardDecorProps) {
  const { decorClass } = getWeatherCardTheme(icon)

  return (
    <div className={`weather-card-decor pointer-events-none absolute inset-0 overflow-hidden ${decorClass}`} aria-hidden>
      {icon === 'sun' && <SunDecor />}
      {icon === 'mostly-clear' && <MostlyClearDecor />}
      {icon === 'partly-cloudy' && <PartlyCloudyDecor />}
      {icon === 'moon' && <MoonDecor />}
      {icon === 'cloud' && <CloudDecor />}
      {icon === 'fog' && <FogDecor />}
      {icon === 'cloud-rain' && <RainDecor />}
      {icon === 'cloud-snow' && <SnowDecor />}
      {icon === 'cloud-lightning' && <StormDecor />}
      {icon === 'cloud-lightning-rain' && <StormDecor withRain />}
    </div>
  )
}

function SunDecor() {
  return (
    <svg className="weather-card-sun-svg absolute -right-4 -top-4 h-[115%] w-[70%]" viewBox="0 0 200 200" fill="none">
      <circle cx="170" cy="30" r="28" fill="rgb(255 236 120 / 0.95)" />
      <circle cx="170" cy="30" r="48" stroke="rgb(255 200 80 / 0.45)" strokeWidth="10" className="weather-card-sun-ring" />
      <circle cx="170" cy="30" r="68" stroke="rgb(255 180 60 / 0.3)" strokeWidth="12" className="weather-card-sun-ring weather-card-sun-ring-2" />
      <circle cx="170" cy="30" r="90" stroke="rgb(255 160 50 / 0.18)" strokeWidth="14" className="weather-card-sun-ring weather-card-sun-ring-3" />
      <circle cx="170" cy="30" r="115" stroke="rgb(255 140 40 / 0.1)" strokeWidth="16" className="weather-card-sun-ring weather-card-sun-ring-4" />
    </svg>
  )
}

/** Código 1: sol dominante, nubecita mínima. */
function MostlyClearDecor() {
  return (
    <>
      <SunDecor />
      <svg className="absolute right-[8%] bottom-[18%] h-12 w-24 opacity-30" viewBox="0 0 96 48" fill="none">
        <ellipse cx="48" cy="32" rx="36" ry="14" fill="rgb(255 255 255 / 0.55)" />
      </svg>
    </>
  )
}

/** Código 2: nubes prominentes, sol asomándose detrás. */
function PartlyCloudyDecor() {
  return (
    <>
      <svg className="weather-card-sun-peek absolute right-[6%] top-[8%] h-[55%] w-[42%]" viewBox="0 0 200 200" fill="none">
        <circle cx="150" cy="70" r="20" fill="rgb(255 230 120 / 0.75)" />
        <circle cx="150" cy="70" r="34" stroke="rgb(255 210 90 / 0.25)" strokeWidth="8" className="weather-card-sun-ring" />
      </svg>
      <CloudDecor tone="heavy" />
      <svg className="absolute right-[12%] top-[28%] h-16 w-32 opacity-55" viewBox="0 0 128 64" fill="none">
        <ellipse cx="64" cy="40" rx="52" ry="18" fill="rgb(220 230 240 / 0.7)" />
        <ellipse cx="88" cy="34" rx="32" ry="14" fill="rgb(235 242 248 / 0.65)" />
      </svg>
    </>
  )
}

function MoonDecor() {
  return (
    <>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 140" fill="none">
        {[12, 18, 28, 42, 58, 72, 88, 95, 105, 118, 130, 145, 160, 175, 190, 205, 220, 235].map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={18 + (i % 5) * 22}
            r={1 + (i % 3) * 0.6}
            fill="white"
            opacity={0.35 + (i % 4) * 0.15}
            className="weather-card-star"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </svg>
      <svg className="absolute -right-2 -top-2 h-[110%] w-[65%]" viewBox="0 0 200 200" fill="none">
        <circle cx="165" cy="35" r="22" fill="***REMOVED***fde047" />
        <circle cx="165" cy="35" r="38" stroke="rgb(30 45 90 / 0.7)" strokeWidth="8" />
        <circle cx="165" cy="35" r="56" stroke="rgb(25 38 80 / 0.5)" strokeWidth="10" />
        <circle cx="165" cy="35" r="76" stroke="rgb(20 32 70 / 0.35)" strokeWidth="12" />
        <circle cx="165" cy="35" r="98" stroke="rgb(15 26 60 / 0.2)" strokeWidth="14" />
      </svg>
    </>
  )
}

function CloudDecor({ tone = 'normal' }: { tone?: 'normal' | 'heavy' | 'subtle' }) {
  const strokes =
    tone === 'heavy'
      ? ['rgb(235 242 248 / 0.75)', 'rgb(210 222 232 / 0.65)', 'rgb(190 205 218 / 0.55)']
      : tone === 'subtle'
        ? ['rgb(255 255 255 / 0.25)', 'rgb(200 235 255 / 0.3)', 'rgb(160 210 240 / 0.25)']
        : ['rgb(255 255 255 / 0.35)', 'rgb(200 235 255 / 0.45)', 'rgb(160 210 240 / 0.35)']

  return (
    <svg className="absolute -right-2 bottom-0 h-[85%] w-[72%]" viewBox="0 0 240 160" fill="none">
      <path
        d="M20 110 Q60 80 100 95 T180 85 T260 100"
        stroke={strokes[0]}
        strokeWidth={tone === 'heavy' ? 34 : 28}
        strokeLinecap="round"
        fill="none"
        className="weather-card-wave"
      />
      <path
        d="M0 130 Q50 100 110 115 T210 105 T280 125"
        stroke={strokes[1]}
        strokeWidth={tone === 'heavy' ? 38 : 32}
        strokeLinecap="round"
        fill="none"
        className="weather-card-wave weather-card-wave-2"
      />
      <path
        d="M10 150 Q70 120 130 135 T230 125"
        stroke={strokes[2]}
        strokeWidth={tone === 'heavy' ? 28 : 24}
        strokeLinecap="round"
        fill="none"
        className="weather-card-wave weather-card-wave-3"
      />
    </svg>
  )
}

function FogDecor() {
  return (
    <>
      <svg className="absolute -right-4 bottom-0 h-[70%] w-[80%]" viewBox="0 0 260 120" fill="none">
        <ellipse cx="180" cy="90" rx="90" ry="28" fill="rgb(255 255 255 / 0.55)" />
        <ellipse cx="200" cy="105" rx="70" ry="22" fill="rgb(255 255 255 / 0.4)" />
        <ellipse cx="160" cy="110" rx="60" ry="18" fill="rgb(255 255 255 / 0.35)" />
      </svg>
      {[30, 55, 80, 110, 140, 170, 200].map((x, i) => (
        <span
          key={i}
          className="weather-card-mist-dot absolute rounded-full bg-white/40"
          style={{
            width: 3 + (i % 2),
            height: 3 + (i % 2),
            top: `${15 + (i % 4) * 12}%`,
            left: `${x / 2.6}%`,
            animationDelay: `${i * 0.4}s`,
          }}
        />
      ))}
    </>
  )
}

function RainDecor() {
  return (
    <>
      <svg className="absolute -right-2 bottom-0 h-[85%] w-[72%]" viewBox="0 0 240 160" fill="none">
        <path
          d="M20 110 Q60 80 100 95 T180 85 T260 100"
          stroke="rgb(35 45 58 / 0.75)"
          strokeWidth="28"
          strokeLinecap="round"
          fill="none"
          className="weather-card-wave"
        />
        <path
          d="M0 130 Q50 100 110 115 T210 105 T280 125"
          stroke="rgb(50 62 78 / 0.55)"
          strokeWidth="32"
          strokeLinecap="round"
          fill="none"
          className="weather-card-wave weather-card-wave-2"
        />
      </svg>
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          className="weather-card-rain-line absolute"
          style={{
            left: `${48 + (i % 8) * 6}%`,
            top: `${8 + Math.floor(i / 8) * 18}%`,
            animationDelay: `${(i * 0.12) % 0.9}s`,
            animationDuration: `${0.5 + (i % 3) * 0.1}s`,
          }}
        />
      ))}
    </>
  )
}

function SnowDecor() {
  return (
    <>
      <svg className="absolute -right-4 bottom-0 h-[55%] w-[75%]" viewBox="0 0 240 80" fill="none">
        <ellipse cx="170" cy="55" rx="80" ry="22" fill="rgb(255 255 255 / 0.7)" />
        <ellipse cx="190" cy="68" rx="55" ry="16" fill="rgb(255 255 255 / 0.5)" />
      </svg>
      {Array.from({ length: 10 }, (_, i) => (
        <svg
          key={i}
          className="weather-card-snowflake-icon absolute text-white/70"
          style={{
            width: 10 + (i % 3) * 4,
            height: 10 + (i % 3) * 4,
            top: `${10 + (i % 5) * 14}%`,
            left: `${52 + (i % 4) * 10}%`,
            animationDelay: `${i * 0.35}s`,
            animationDuration: `${2.2 + (i % 3) * 0.5}s`,
          }}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2v20M2 12h20M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4M12 2l-2 4 2 2 2-2-2-4zM12 22l-2-4 2-2 2 2-2 4zM2 12l4-2 2 2-2 2-4-2zM22 12l-4-2-2 2 2 2 4-2z" />
        </svg>
      ))}
    </>
  )
}

function StormDecor({ withRain = false }: { withRain?: boolean }) {
  return (
    <>
      <svg className="absolute -right-2 bottom-0 h-[80%] w-[70%]" viewBox="0 0 240 160" fill="none">
        <path
          d="M20 110 Q60 80 100 95 T180 85 T260 100"
          stroke="rgb(60 50 90 / 0.6)"
          strokeWidth="28"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M0 130 Q50 100 110 115 T210 105"
          stroke="rgb(80 65 110 / 0.45)"
          strokeWidth="32"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <svg
        className="weather-card-bolt absolute right-[18%] top-[22%] h-8 w-8 text-yellow-300"
        viewBox="0 0 24 36"
        fill="currentColor"
      >
        <path d="M13 0L4 16h6l-3 20 13-22h-7l0-14z" />
      </svg>
      {withRain
        ? Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className="weather-card-rain-line absolute"
              style={{
                left: `${48 + (i % 5) * 7}%`,
                top: `${20 + Math.floor(i / 5) * 20}%`,
                animationDelay: `${(i * 0.12) % 0.9}s`,
              }}
            />
          ))
        : null}
    </>
  )
}
