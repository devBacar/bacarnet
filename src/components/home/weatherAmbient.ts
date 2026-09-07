import type { WeatherIcon } from '../../services/dailyUtilityService'

export interface WeatherAmbientStyle {
  light: string
  dark: string
}

type AmbientSize = 'inline' | 'header'

/** Punto medio: visible en la esquina, desvanecido sin corte duro. */
function softCorner(stops: string, size: AmbientSize): string {
  const ellipse = size === 'header' ? 'ellipse 92% 72%' : 'ellipse 90% 75%'
  return `radial-gradient(${ellipse} at 100% 0%, ${stops})`
}

function fadeTail(size: AmbientSize): string {
  return size === 'header' ? 'transparent 84%' : 'transparent 75%'
}

/** Degradé ambiental según condición climática (esquina superior derecha). */
export function getWeatherAmbientStyle(
  icon: WeatherIcon,
  size: AmbientSize = 'inline',
): WeatherAmbientStyle {
  const tail = fadeTail(size)

  switch (icon) {
    case 'sun':
      return {
        light: softCorner(
          `rgb(250 204 21 / 0.58) 0%, rgb(253 224 71 / 0.34) 30%, rgb(253 224 71 / 0.14) 54%, ${tail}`,
          size,
        ),
        dark: softCorner(
          `rgb(234 179 8 / 0.42) 0%, rgb(202 138 4 / 0.24) 32%, rgb(202 138 4 / 0.08) 56%, ${tail}`,
          size,
        ),
      }
    case 'moon':
      return {
        light: softCorner(
          `rgb(129 140 248 / 0.34) 0%, rgb(199 210 254 / 0.18) 32%, rgb(199 210 254 / 0.07) 56%, ${tail}`,
          size,
        ),
        dark: softCorner(
          `rgb(99 102 241 / 0.38) 0%, rgb(67 56 202 / 0.2) 32%, rgb(67 56 202 / 0.07) 56%, ${tail}`,
          size,
        ),
      }
    case 'cloud-sun':
      return {
        light: softCorner(
          `rgb(251 191 36 / 0.36) 0%, rgb(253 224 71 / 0.18) 32%, rgb(148 163 184 / 0.07) 56%, ${tail}`,
          size,
        ),
        dark: softCorner(
          `rgb(217 119 6 / 0.22) 0%, rgb(202 138 4 / 0.11) 32%, rgb(100 116 139 / 0.05) 56%, ${tail}`,
          size,
        ),
      }
    case 'fog':
      return {
        light: softCorner(
          `rgb(203 213 225 / 0.34) 0%, rgb(226 232 240 / 0.16) 32%, rgb(226 232 240 / 0.05) 56%, ${tail}`,
          size,
        ),
        dark: softCorner(
          `rgb(100 116 139 / 0.26) 0%, rgb(71 85 105 / 0.13) 32%, rgb(71 85 105 / 0.05) 56%, ${tail}`,
          size,
        ),
      }
    case 'cloud-rain':
      return {
        light: softCorner(
          `rgb(56 189 248 / 0.22) 0%, rgb(100 116 139 / 0.13) 32%, rgb(148 163 184 / 0.05) 56%, ${tail}`,
          size,
        ),
        dark: softCorner(
          `rgb(14 116 144 / 0.24) 0%, rgb(51 65 85 / 0.12) 32%, rgb(51 65 85 / 0.05) 56%, ${tail}`,
          size,
        ),
      }
    case 'cloud-snow':
      return {
        light: softCorner(
          `rgb(186 230 253 / 0.34) 0%, rgb(224 242 254 / 0.16) 32%, rgb(148 163 184 / 0.05) 56%, ${tail}`,
          size,
        ),
        dark: softCorner(
          `rgb(125 211 252 / 0.22) 0%, rgb(71 85 105 / 0.11) 32%, rgb(71 85 105 / 0.05) 56%, ${tail}`,
          size,
        ),
      }
    case 'cloud-lightning':
      return {
        light: softCorner(
          `rgb(139 92 246 / 0.26) 0%, rgb(167 139 250 / 0.13) 32%, rgb(100 116 139 / 0.05) 56%, ${tail}`,
          size,
        ),
        dark: softCorner(
          `rgb(109 40 217 / 0.3) 0%, rgb(91 33 182 / 0.14) 32%, rgb(51 65 85 / 0.05) 56%, ${tail}`,
          size,
        ),
      }
    case 'cloud-lightning-rain':
      return {
        light: softCorner(
          `rgb(124 58 237 / 0.24) 0%, rgb(56 189 248 / 0.11) 32%, rgb(100 116 139 / 0.05) 56%, ${tail}`,
          size,
        ),
        dark: softCorner(
          `rgb(91 33 182 / 0.26) 0%, rgb(14 116 144 / 0.12) 32%, rgb(51 65 85 / 0.05) 56%, ${tail}`,
          size,
        ),
      }
    case 'cloud':
    default:
      return {
        light: softCorner(
          `rgb(148 163 184 / 0.26) 0%, rgb(203 213 225 / 0.12) 32%, rgb(226 232 240 / 0.04) 56%, ${tail}`,
          size,
        ),
        dark: softCorner(
          `rgb(100 116 139 / 0.26) 0%, rgb(71 85 105 / 0.12) 32%, rgb(51 65 85 / 0.04) 56%, ${tail}`,
          size,
        ),
      }
  }
}
