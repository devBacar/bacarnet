import type { ObsParseada, OperacionUsdParseada, RenovacionParseada } from './cheque-ocasional.types.js'

const RE_RENOVACION_CON_IDS = /renovaci[oó]n\s+cheques?\s*(?:n[°ºo]?\s*)?([\d\s,y/]+)/i
const RE_RENOVACION_SOLA = /^renovaci[oó]n$/i

const RE_USD = /u\$?\s*s?d?\s*([\d.]+)\s*tc\s*\$?\s*([\d.]+)/i

function limpiarNumero(raw: string): number {
  return Number(raw.replace(/\./g, '').replace(',', '.').trim())
}

function expandirBarras(bloque: string): string[] {
  const partes = bloque.replace(/\s*y\s*/gi, '/').replace(/,/g, '/').split('/')
  const ids: string[] = []
  let ultimoCompleto = ''
  for (const p of partes) {
    const t = p.trim()
    if (!t || !/^\d+$/.test(t)) continue
    if (t.length >= 6) {
      ultimoCompleto = t
      ids.push(t)
    } else if (ultimoCompleto) {
      ids.push(ultimoCompleto.slice(0, ultimoCompleto.length - t.length) + t)
    } else {
      ids.push(t)
    }
  }
  return ids
}

function parsearRenovacion(obs: string): RenovacionParseada | null {
  const m = RE_RENOVACION_CON_IDS.exec(obs)
  if (m) {
    const ids = expandirBarras(m[1])
    if (ids.length > 0) return { chequeIds: ids }
  }
  if (RE_RENOVACION_SOLA.test(obs.trim())) return { chequeIds: [] }
  return null
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
