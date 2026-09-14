import type { WeatherIcon } from '../../services/dailyUtilityService'

export interface WeatherCardTheme {
  gradient: string
  timeColor: string
  decorClass: string
  /** Texto claro sobre el fondo (false en fondos muy claros como neblina). */
  usesLightText: boolean
}

export function getWeatherCardTheme(icon: WeatherIcon): WeatherCardTheme {
  switch (icon) {
    case 'sun':
      return {
        gradient: 'linear-gradient(125deg, #ff7a6a 0%, #e88830 58%, #c49828 100%)',
        timeColor: '#fff8dc',
        decorClass: 'weather-card-decor-sun',
        usesLightText: true,
      }
    case 'moon':
      return {
        gradient: 'linear-gradient(135deg, #141f45 0%, #24356a 55%, #1a2850 100%)',
        timeColor: '#ffffff',
        decorClass: 'weather-card-decor-moon',
        usesLightText: true,
      }
    case 'mostly-clear':
      return {
        gradient: 'linear-gradient(125deg, #ff9a56 0%, #e89830 52%, #c09838 100%)',
        timeColor: '#fff8dc',
        decorClass: 'weather-card-decor-mostly-clear',
        usesLightText: true,
      }
    case 'partly-cloudy':
      return {
        gradient: 'linear-gradient(125deg, #6b8fa3 0%, #8aaec0 42%, #a8c4d4 100%)',
        timeColor: '#ffffff',
        decorClass: 'weather-card-decor-partly-cloudy',
        usesLightText: true,
      }
    case 'fog':
      return {
        gradient: 'linear-gradient(135deg, #b8c5d4 0%, #d2dde8 50%, #e8eef4 100%)',
        timeColor: '#334155',
        decorClass: 'weather-card-decor-fog',
        usesLightText: false,
      }
    case 'cloud-rain':
      return {
        gradient: 'linear-gradient(135deg, #2f4054 0%, #44566a 50%, #566678 100%)',
        timeColor: '#ffffff',
        decorClass: 'weather-card-decor-rain',
        usesLightText: true,
      }
    case 'cloud-snow':
      return {
        gradient: 'linear-gradient(135deg, #8eb8d4 0%, #b8d4ea 55%, #d4e8f5 100%)',
        timeColor: '#ffffff',
        decorClass: 'weather-card-decor-snow',
        usesLightText: true,
      }
    case 'cloud-lightning':
      return {
        gradient: 'linear-gradient(135deg, #2a2548 0%, #44356b 50%, #534878 100%)',
        timeColor: '#fef08a',
        decorClass: 'weather-card-decor-storm',
        usesLightText: true,
      }
    case 'cloud-lightning-rain':
      return {
        gradient: 'linear-gradient(135deg, #252040 0%, #3a3058 45%, #4a4270 100%)',
        timeColor: '#fef08a',
        decorClass: 'weather-card-decor-storm-rain',
        usesLightText: true,
      }
    case 'cloud':
    default:
      return {
        gradient: 'linear-gradient(125deg, #3a8fd4 0%, #5eb8d4 50%, #7dd3e8 100%)',
        timeColor: '#ffffff',
        decorClass: 'weather-card-decor-cloud',
        usesLightText: true,
      }
  }
}

export function getWeatherCardLabel(icon: WeatherIcon): string {
  switch (icon) {
    case 'sun':
      return 'Soleado'
    case 'moon':
      return 'Despejado'
    case 'mostly-clear':
      return 'Mayormente despejado'
    case 'partly-cloudy':
      return 'Parcialmente nublado'
    case 'cloud':
      return 'Nublado'
    case 'fog':
      return 'Neblina'
    case 'cloud-rain':
      return 'Lluvia'
    case 'cloud-snow':
      return 'Nevando'
    case 'cloud-lightning':
      return 'Tormenta'
    case 'cloud-lightning-rain':
      return 'Tormenta con lluvia'
    default:
      return 'Clima'
  }
}
