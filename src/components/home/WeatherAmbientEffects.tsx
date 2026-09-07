import type { WeatherIcon } from '../../services/dailyUtilityService'

interface WeatherAmbientEffectsProps {
  icon: WeatherIcon
}

function SunRays() {
  return (
    <div className="weather-effect-sun" aria-hidden>
      <div className="weather-effect-sun-core" />
      <div className="weather-effect-sun-rays" />
    </div>
  )
}

function MoonStars() {
  const stars = [
    { top: '18%', left: '72%', size: 2, delay: 0 },
    { top: '32%', left: '88%', size: 1.5, delay: 0.8 },
    { top: '12%', left: '92%', size: 2.5, delay: 1.4 },
    { top: '42%', left: '78%', size: 1.5, delay: 2.1 },
    { top: '24%', left: '82%', size: 1, delay: 0.4 },
    { top: '8%', left: '80%', size: 1.5, delay: 1.9 },
  ]
  return (
    <div className="weather-effect-stars" aria-hidden>
      {stars.map((star, i) => (
        <span
          key={i}
          className="weather-effect-star"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

function CloudShape({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 48"
      className={className}
      aria-hidden
      fill="currentColor"
    >
      <ellipse cx="40" cy="32" rx="28" ry="16" />
      <ellipse cx="68" cy="26" rx="34" ry="20" />
      <ellipse cx="92" cy="32" rx="22" ry="14" />
    </svg>
  )
}

function Clouds({ count = 2 }: { count?: number }) {
  return (
    <div className="weather-effect-clouds" aria-hidden>
      <CloudShape className="weather-effect-cloud weather-effect-cloud-1" />
      {count >= 2 ? <CloudShape className="weather-effect-cloud weather-effect-cloud-2" /> : null}
    </div>
  )
}

function RainDrops() {
  const drops = Array.from({ length: 14 }, (_, i) => ({
    left: `${58 + (i % 7) * 5.5}%`,
    delay: `${(i * 0.17) % 1.2}s`,
    duration: `${0.55 + (i % 3) * 0.12}s`,
  }))
  return (
    <div className="weather-effect-rain" aria-hidden>
      {drops.map((drop, i) => (
        <span
          key={i}
          className="weather-effect-rain-drop"
          style={{
            left: drop.left,
            animationDelay: drop.delay,
            animationDuration: drop.duration,
          }}
        />
      ))}
    </div>
  )
}

function Snowflakes() {
  const flakes = Array.from({ length: 12 }, (_, i) => ({
    left: `${55 + (i % 6) * 6}%`,
    delay: `${(i * 0.25) % 2}s`,
    duration: `${2.5 + (i % 4) * 0.4}s`,
    size: 3 + (i % 3),
  }))
  return (
    <div className="weather-effect-snow" aria-hidden>
      {flakes.map((flake, i) => (
        <span
          key={i}
          className="weather-effect-snowflake"
          style={{
            left: flake.left,
            width: flake.size,
            height: flake.size,
            animationDelay: flake.delay,
            animationDuration: flake.duration,
          }}
        />
      ))}
    </div>
  )
}

function FogLayers() {
  return (
    <div className="weather-effect-fog" aria-hidden>
      <div className="weather-effect-fog-layer weather-effect-fog-layer-1" />
      <div className="weather-effect-fog-layer weather-effect-fog-layer-2" />
    </div>
  )
}

function LightningFlash() {
  return (
    <div className="weather-effect-lightning" aria-hidden>
      <CloudShape className="weather-effect-cloud weather-effect-cloud-1" />
      <svg viewBox="0 0 24 36" className="weather-effect-bolt" aria-hidden fill="currentColor">
        <path d="M13 0L4 16h6l-3 20 13-22h-7l0-14z" />
      </svg>
    </div>
  )
}

export function WeatherAmbientEffects({ icon }: WeatherAmbientEffectsProps) {
  switch (icon) {
    case 'sun':
      return <SunRays />
    case 'moon':
      return <MoonStars />
    case 'mostly-clear':
      return (
        <>
          <SunRays />
          <Clouds count={1} />
        </>
      )
    case 'partly-cloudy':
      return <Clouds count={2} />
    case 'fog':
      return <FogLayers />
    case 'cloud-rain':
      return (
        <>
          <Clouds />
          <RainDrops />
        </>
      )
    case 'cloud-snow':
      return (
        <>
          <Clouds />
          <Snowflakes />
        </>
      )
    case 'cloud-lightning':
      return <LightningFlash />
    case 'cloud-lightning-rain':
      return (
        <>
          <LightningFlash />
          <RainDrops />
        </>
      )
    case 'cloud':
    default:
      return <Clouds />
  }
}
