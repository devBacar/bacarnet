const OPEN_METEO_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=-31.4135&longitude=-64.1810&current_weather=true'

export type WeatherIcon =
  | 'sun'
  | 'moon'
  | 'cloud'
  | 'mostly-clear'
  | 'partly-cloudy'
  | 'fog'
  | 'cloud-rain'
  | 'cloud-snow'
  | 'cloud-lightning'
  | 'cloud-lightning-rain'

export interface WeatherSnapshot {
  temperature: number
  description: string
  icon: WeatherIcon
  isDay: boolean
}

export interface FxQuote {
  id: string
  label: string
  compra: number
  venta: number
}

interface OpenMeteoResponse {
  current_weather: {
    temperature: number
    weathercode: number
    is_day?: 0 | 1
  }
}

function isCordobaDaytime(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Argentina/Cordoba',
    }).format(new Date()),
  )
  return hour >= 6 && hour < 20
}

export function getWeatherInfo(
  code: number,
  isDay = isCordobaDaytime(),
): Pick<WeatherSnapshot, 'description' | 'icon' | 'isDay'> {
  if (code === 0) {
    return {
      description: isDay ? 'Despejado' : 'Despejado',
      icon: isDay ? 'sun' : 'moon',
      isDay,
    }
  }
  if (code === 1) {
    return {
      description: isDay ? 'Mayormente despejado' : 'Despejado',
      icon: isDay ? 'mostly-clear' : 'moon',
      isDay,
    }
  }
  if (code === 2) {
    return { description: 'Parcialmente nublado', icon: 'partly-cloudy', isDay }
  }
  if (code === 3) {
    return { description: 'Nublado', icon: 'cloud', isDay }
  }
  if (code === 45 || code === 48) {
    return { description: 'Niebla', icon: 'fog', isDay }
  }
  if (code >= 51 && code <= 57) {
    return { description: 'Llovizna', icon: 'cloud-rain', isDay }
  }
  if (code >= 61 && code <= 67) {
    return { description: 'Lluvia', icon: 'cloud-rain', isDay }
  }
  if (code >= 71 && code <= 77) {
    return { description: 'Nieve', icon: 'cloud-snow', isDay }
  }
  if (code >= 80 && code <= 82) {
    return { description: 'Chaparrones', icon: 'cloud-rain', isDay }
  }
  if (code >= 85 && code <= 86) {
    return { description: 'Nieve', icon: 'cloud-snow', isDay }
  }
  if (code === 95) {
    return { description: 'Tormenta', icon: 'cloud-lightning', isDay }
  }
  if (code === 96 || code === 99) {
    return { description: 'Tormenta con granizo', icon: 'cloud-lightning-rain', isDay }
  }
  return { description: 'Nublado', icon: 'cloud', isDay }
}

export async function fetchCordobaWeather(signal?: AbortSignal): Promise<WeatherSnapshot> {
  const response = await fetch(OPEN_METEO_URL, { signal })
  if (!response.ok) throw new Error('Open-Meteo request failed')

  const data = (await response.json()) as OpenMeteoResponse
  const current = data.current_weather

  if (!current) throw new Error('Open-Meteo response incomplete')

  const isDay = current.is_day === 1 || (current.is_day === undefined && isCordobaDaytime())
  const info = getWeatherInfo(current.weathercode, isDay)

  return {
    temperature: current.temperature,
    ...info,
  }
}

interface DolarApiEntry {
  casa: string
  compra: number
  venta: number
}

export async function fetchFxQuotes(signal?: AbortSignal): Promise<FxQuote[]> {
  const response = await fetch('https://dolarapi.com/v1/dolares', { signal })
  if (!response.ok) throw new Error('DolarApi request failed')

  const dolarData = (await response.json()) as DolarApiEntry[]
  const targets = [
    { casa: 'oficial', id: 'oficial', label: 'Oficial' },
    { casa: 'blue', id: 'blue', label: 'Blue' },
    { casa: 'bolsa', id: 'mep', label: 'MEP' },
  ]

  const quotes: FxQuote[] = []

  for (const { casa, id, label } of targets) {
    const entry = dolarData.find((item) => item.casa === casa)
    if (!entry) continue
    quotes.push({
      id,
      label,
      compra: entry.compra,
      venta: entry.venta,
    })
  }

  return quotes
}

export function formatArs(value: number): string {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}
