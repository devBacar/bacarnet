import { loadInterbankingTransferConfig, type InterbankingTransferConfig } from './interbanking-transfer.config.js'

export interface InterbankingTransferTokenResult {
  accessToken: string
  expiresIn: number
  tokenType: string
}

let cachedToken: string | null = null
let cachedExpiryMs = 0

function tokenStillValid(): boolean {
  return Boolean(cachedToken && Date.now() < cachedExpiryMs)
}

function parseTokenResponse(payload: unknown): InterbankingTransferTokenResult {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Respuesta de token Interbanking inválida (no JSON)')
  }
  const data = payload as Record<string, unknown>
  const accessToken = typeof data.access_token === 'string' ? data.access_token : ''
  const expiresIn =
    typeof data.expires_in === 'number'
      ? data.expires_in
      : typeof data.expires_in === 'string'
        ? Number.parseInt(data.expires_in, 10)
        : NaN
  const tokenType = typeof data.token_type === 'string' ? data.token_type : 'Bearer'

  if (!accessToken) {
    const err =
      typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : 'sin access_token'
    throw new Error(`Interbanking rechazó el login OAuth (password): ${err}`)
  }
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Interbanking devolvió expires_in inválido')
  }

  return { accessToken, expiresIn, tokenType }
}

/**
 * OAuth2 resource-owner password contra CAS Interbanking.
 * Parámetros en query string (mismo quirk que client_credentials en Saldos).
 */
export async function fetchInterbankingTransferAccessToken(options?: {
  config?: InterbankingTransferConfig
  forceRefresh?: boolean
}): Promise<InterbankingTransferTokenResult> {
  const config = options?.config ?? loadInterbankingTransferConfig()

  if (!options?.forceRefresh && tokenStillValid() && cachedToken) {
    const remainingSec = Math.max(0, Math.floor((cachedExpiryMs - Date.now()) / 1000))
    return { accessToken: cachedToken, expiresIn: remainingSec, tokenType: 'Bearer' }
  }

  const params = new URLSearchParams({
    grant_type: 'password',
    username: config.usuario,
    password: config.clave,
    scope: config.scope,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })

  const url = `${config.tokenUrl}?${params.toString()}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      service: config.redirectUrl,
    },
  })

  const text = await res.text()
  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(
      `Interbanking token HTTP ${res.status}: respuesta no JSON (${text.slice(0, 200)})`,
    )
  }

  if (!res.ok) {
    const err =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${res.status}`
    throw new Error(`Interbanking token HTTP ${res.status}: ${err}`)
  }

  const parsed = parseTokenResponse(payload)
  cachedToken = parsed.accessToken
  cachedExpiryMs = Date.now() + parsed.expiresIn * 1000 - 60_000

  return parsed
}

/** Limpia cache (tests). */
export function resetInterbankingTransferTokenCache(): void {
  cachedToken = null
  cachedExpiryMs = 0
}
