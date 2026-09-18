import { google } from 'googleapis'
import jwt from 'jsonwebtoken'
import { getEnv } from '../../config/env.js'
import { logError } from '../../lib/log.js'
import { OAUTH_STATE_TTL_SECONDS, WIDGET_OAUTH_SCOPES } from './constants.js'
import {
  GoogleReconnectRequiredError,
  isInvalidGrantError,
} from './errors.js'
import {
  deleteGooglePersonalIntegration,
  loadGoogleRefreshToken,
  saveGooglePersonalIntegration,
} from './store.js'

function requireOAuthClientConfig(): { clientId: string; clientSecret: string } {
  const clientId = getEnv().widgetsOAuthClientId
  const clientSecret = getEnv().widgetsOAuthClientSecret
  if (!clientId || !clientSecret) {
    throw new Error('WIDGETS_OAUTH_CLIENT_ID / WIDGETS_OAUTH_CLIENT_SECRET no configurados')
  }
  return { clientId, clientSecret }
}

export function getGoogleOAuthRedirectUri(): string {
  const override = getEnv().widgetsOAuthRedirectUri
  if (override) return override
  return `${getEnv().publicAppUrl}/api/me/google/oauth/callback`
}

function createOAuth2Client() {
  const { clientId, clientSecret } = requireOAuthClientConfig()
  return new google.auth.OAuth2(clientId, clientSecret, getGoogleOAuthRedirectUri())
}

function oauthStateSecret(): string {
  const secret = getEnv().widgetsOAuthStateSecret
  if (!secret) {
    throw new Error('WIDGETS_OAUTH_STATE_SECRET no está configurado')
  }
  return secret
}

export function createOAuthStateToken(uid: string, returnPath: string): string {
  return jwt.sign({ uid, returnPath }, oauthStateSecret(), {
    expiresIn: OAUTH_STATE_TTL_SECONDS,
  })
}

export function verifyOAuthStateToken(state: string): { uid: string; returnPath: string } {
  const decoded = jwt.verify(state, oauthStateSecret()) as jwt.JwtPayload
  const uid = typeof decoded.uid === 'string' ? decoded.uid.trim() : ''
  const returnPath =
    typeof decoded.returnPath === 'string' && decoded.returnPath.startsWith('/')
      ? decoded.returnPath
      : '/intranet'
  if (!uid) {
    throw new Error('Estado OAuth inválido')
  }
  return { uid, returnPath }
}

/**
 * Inicia consentimiento: access_type=offline + prompt=consent solo aquí (primera conexión o reconexión).
 */
export function buildAuthorizationUrl(state: string): string {
  const client = createOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [...WIDGET_OAUTH_SCOPES],
    state,
    include_granted_scopes: true,
    prompt: 'consent',
  })
}

export async function exchangeAuthorizationCode(input: {
  uid: string
  code: string
}): Promise<void> {
  const client = createOAuth2Client()
  const { tokens } = await client.getToken(input.code)
  const refreshToken = tokens.refresh_token
  if (!refreshToken) {
    throw new Error(
      'Google no devolvió refresh token. Probá desconectar la app en tu cuenta Google y conectar de nuevo.',
    )
  }

  client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const me = await oauth2.userinfo.get()
  const googleEmail = (me.data.email ?? '').trim().toLowerCase()
  if (!googleEmail) {
    throw new Error('No se pudo leer el email de la cuenta Google conectada')
  }

  await saveGooglePersonalIntegration({
    uid: input.uid,
    refreshToken,
    scope: tokens.scope ?? WIDGET_OAUTH_SCOPES.join(' '),
    googleEmail,
  })
}

export async function revokeAndDeleteIntegration(uid: string): Promise<void> {
  const refreshToken = await loadGoogleRefreshToken(uid)
  if (refreshToken) {
    const client = createOAuth2Client()
    try {
      await client.revokeToken(refreshToken)
    } catch (err) {
      logError('Revocación de refresh token en Google (continuamos borrando local)', err)
    }
  }
  await deleteGooglePersonalIntegration(uid)
}

export async function getUserOAuth2Client(uid: string) {
  const refreshToken = await loadGoogleRefreshToken(uid)
  if (!refreshToken) {
    throw new GoogleReconnectRequiredError()
  }

  const client = createOAuth2Client()
  client.setCredentials({ refresh_token: refreshToken })

  try {
    await client.getAccessToken()
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await deleteGooglePersonalIntegration(uid)
      throw new GoogleReconnectRequiredError()
    }
    throw err
  }

  return client
}
