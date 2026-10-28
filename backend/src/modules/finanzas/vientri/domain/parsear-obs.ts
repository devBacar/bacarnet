import type { ObsParseada, OperacionUsdParseada, RenovacionParseada } from './cheque-ocasional.types.js'

const RE_RENOVACION = /renovaci[oó]n\s+cheques?\s+n[°ºo]?\s*([\d\s,y]+)/i

const RE_USD = /u\$?\s*s?d?\s*([\d.]+)\s*tc\s*\$?\s*([\d.]+)/i

function limpiarNumero(raw: string): number {
  return Number(raw.replace(/\./g, '').replace(',', '.').trim())
}

function parsearRenovacion(obs: string): RenovacionParseada | null {
  const m = RE_RENOVACION.exec(obs)
  if (!m) return null
  const bloque = m[1]
  const ids = bloque
    .replace(/\s*y\s*/gi, ',')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
  if (ids.length === 0) return null
  return { chequeIds: ids }
}

function parsearUsd(obs: string): OperacionUsdParseada | null {
  const m = RE_USD.exec(obs)
  if (!m) return null
  const montoUsd = limpiarNumero(m[1])
  const cotizacion = limpiarNumero(m[2])
  if (!Number.isFinite(montoUsd) || montoUsd <= 0) return null
  if (!Number.isFinite(cotizacion) || cotizacion <= 0) return null
  return { montoUsd, cotizacion }
}

export function parsearObs(obs: string | null | undefined): ObsParseada {
  const texto = (obs ?? '').trim()
  return {
    renovacion: parsearRenovacion(texto),
    operacionUsd: parsearUsd(texto),
    obsOriginal: texto,
  }
}
