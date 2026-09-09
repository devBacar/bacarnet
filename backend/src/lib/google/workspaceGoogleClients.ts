import { google, type calendar_v3, type gmail_v1 } from 'googleapis'
import {
  CALENDAR_EVENTS_SCOPES,
  GMAIL_READONLY_SCOPES,
  GMAIL_SEND_SCOPES,
  getEnv,
  isEmailInAllowedDomain,
} from '../../config/env.js'
import { logError } from '../log.js'
import { createDwdOAuth2Client } from './dwdIamAuth.js'

const CLIENT_TTL_MS = 50 * 60 * 1000
const MAX_CACHED_CLIENTS = 100

type WorkspaceAuthClient =
  | InstanceType<typeof google.auth.JWT>
  | InstanceType<typeof google.auth.OAuth2>

type CachedAuth = {
  auth: WorkspaceAuthClient
  expiresAt: number
}

const authCaches = new Map<string, Map<string, CachedAuth>>()
const authInFlight = new Map<string, Promise<WorkspaceAuthClient>>()

function cacheKeyForScopes(scopes: readonly string[]): string {
  return scopes.join('|')
}

async function resolveRuntimeServiceAccountEmail(): Promise<string> {
  const fromEnv = getEnv().driveServiceAccountEmail
  if (fromEnv) return fromEnv

  const metadataUrl =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email'

  try {
    const res = await fetch(metadataUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) {
      throw new Error(`metadata ${res.status}`)
    }
    const email = (await res.text()).trim()
    if (!email.includes('@')) {
      throw new Error('metadata email vacío')
    }
    return email
  } catch (err) {
    logError('No se pudo resolver el email de la SA vía metadata', err)
    throw new Error(
      'No hay cuenta de servicio para Google Workspace. En local definí DRIVE_SERVICE_ACCOUNT_KEY_PATH.',
    )
  }
}

export async function getWorkspaceAuth(
  subject: string,
  scopes: readonly string[],
): Promise<WorkspaceAuthClient> {
  const env = getEnv()
  const normalizedSubject = subject.trim().toLowerCase()
  if (!isEmailInAllowedDomain(normalizedSubject, env.allowedEmailDomain)) {
    throw new Error(`No se puede impersonar un email fuera de @${env.allowedEmailDomain}`)
  }

  const scopeKey = cacheKeyForScopes(scopes)
  let subjectCache = authCaches.get(scopeKey)
  if (!subjectCache) {
    subjectCache = new Map()
    authCaches.set(scopeKey, subjectCache)
  }

  const now = Date.now()
  for (const [email, cached] of subjectCache) {
    if (cached.expiresAt <= now) subjectCache.delete(email)
  }

  const cached = subjectCache.get(normalizedSubject)
  if (cached && cached.expiresAt > now) return cached.auth

  const inFlightKey = `${scopeKey}:${normalizedSubject}`
  const pending = authInFlight.get(inFlightKey)
  if (pending) return pending

  const authorize = (async () => {
    let auth: WorkspaceAuthClient
    let tokenExpiry: number

    if (env.driveServiceAccountKeyPath) {
      const jwt = new google.auth.JWT({
        keyFile: env.driveServiceAccountKeyPath,
        scopes: [...scopes],
        subject: normalizedSubject,
      })
      const credentials = await jwt.authorize()
      auth = jwt
      tokenExpiry =
        typeof credentials.expiry_date === 'number'
          ? credentials.expiry_date - 60_000
          : now + CLIENT_TTL_MS
    } else {
      const saEmail = await resolveRuntimeServiceAccountEmail()
      auth = createDwdOAuth2Client(saEmail, normalizedSubject, scopes)
      const { credentials } = await auth.refreshAccessToken()
      tokenExpiry =
        typeof credentials.expiry_date === 'number'
          ? credentials.expiry_date - 60_000
          : now + CLIENT_TTL_MS
    }

    const expiresAt = Math.min(now + CLIENT_TTL_MS, tokenExpiry)

    if (subjectCache.size >= MAX_CACHED_CLIENTS) {
      const oldest = subjectCache.keys().next().value
      if (oldest) subjectCache.delete(oldest)
    }
    subjectCache.set(normalizedSubject, { auth, expiresAt })
    return auth
  })()

  authInFlight.set(inFlightKey, authorize)
  try {
    return await authorize
  } finally {
    authInFlight.delete(inFlightKey)
  }
}

export async function getGmail(subject: string): Promise<gmail_v1.Gmail> {
  const auth = await getWorkspaceAuth(subject, GMAIL_SEND_SCOPES)
  return google.gmail({ version: 'v1', auth })
}

export async function getGmailReadonly(subject: string): Promise<gmail_v1.Gmail> {
  const auth = await getWorkspaceAuth(subject, GMAIL_READONLY_SCOPES)
  return google.gmail({ version: 'v1', auth })
}

export async function getCalendar(subject: string): Promise<calendar_v3.Calendar> {
  const auth = await getWorkspaceAuth(subject, CALENDAR_EVENTS_SCOPES)
  return google.calendar({ version: 'v3', auth })
}
