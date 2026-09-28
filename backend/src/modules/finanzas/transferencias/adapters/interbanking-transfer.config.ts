const DEFAULT_TOKEN_URL = 'https://auth.interbanking.com.ar/cas/oidc/accessToken'
const DEFAULT_API_BASE_URL = 'https://api-gw.interbanking.com.ar/api/prod'
const TRANSFER_SCOPE = 'transferencias-confeccion'

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function firstNonEmpty(...names: string[]): string {
  for (const name of names) {
    const v = readEnv(name)
    if (v) return v
  }
  return ''
}

export interface InterbankingTransferConfig {
  clientId: string
  clientSecret: string
  redirectUrl: string
  customerId: string
  usuario: string
  clave: string
  tokenUrl: string
  apiBaseUrl: string
  scope: string
}

export function loadInterbankingTransferConfig(): InterbankingTransferConfig {
  const clientId = firstNonEmpty('INTERBANKING_TRANSFER_CLIENT_ID', 'INTERBANKING_CLIENT_ID')
  const clientSecret = firstNonEmpty(
    'INTERBANKING_TRANSFER_CLIENT_SECRET',
    'INTERBANKING_CLIENT_SECRET',
  )
  const redirectUrl = firstNonEmpty(
    'INTERBANKING_TRANSFER_REDIRECT_URL',
    'INTERBANKING_REDIRECT_URL',
  )
  const customerId = firstNonEmpty(
    'INTERBANKING_TRANSFER_CUSTOMER_ID',
    'INTERBANKING_CUSTOMER_ID',
  )
  const usuario = readEnv('INTERBANKING_TRANSFER_USUARIO')
  const clave = readEnv('INTERBANKING_TRANSFER_CLAVE')
  const tokenUrl = readEnv('INTERBANKING_TRANSFER_TOKEN_URL') || DEFAULT_TOKEN_URL
  const apiBaseUrl = readEnv('INTERBANKING_TRANSFER_API_BASE_URL') || DEFAULT_API_BASE_URL

  const missing: string[] = []
  if (!clientId) missing.push('INTERBANKING_TRANSFER_CLIENT_ID o INTERBANKING_CLIENT_ID')
  if (!clientSecret) missing.push('INTERBANKING_TRANSFER_CLIENT_SECRET o INTERBANKING_CLIENT_SECRET')
  if (!redirectUrl) missing.push('INTERBANKING_TRANSFER_REDIRECT_URL o INTERBANKING_REDIRECT_URL')
  if (!customerId) missing.push('INTERBANKING_TRANSFER_CUSTOMER_ID o INTERBANKING_CUSTOMER_ID')
  if (!usuario) missing.push('INTERBANKING_TRANSFER_USUARIO')
  if (!clave) missing.push('INTERBANKING_TRANSFER_CLAVE')

  if (missing.length > 0) {
    throw new Error(
      `Transferencias Interbanking: faltan credenciales (${missing.join('; ')}). ` +
        'Con FINANZAS_TRANSFERENCIAS_PROVIDER=interbanking no hay fallback a mock.',
    )
  }

  if (!redirectUrl.startsWith('https://')) {
    throw new Error(
      'INTERBANKING_TRANSFER_REDIRECT_URL (o INTERBANKING_REDIRECT_URL) debe comenzar con https://',
    )
  }

  return {
    clientId,
    clientSecret,
    redirectUrl,
    customerId,
    usuario,
    clave,
    tokenUrl,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    scope: readEnv('INTERBANKING_TRANSFER_SCOPE') || TRANSFER_SCOPE,
  }
}
