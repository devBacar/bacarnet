import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { getEnv } from '../../config/env.js'
import {
  HelpdeskTokenAlreadyUsedError,
  HelpdeskTokenError,
  HELPDESK_TOKEN_INVALID_MESSAGE,
} from './errors.js'
import { isHelpdeskTokenJtiUsed, runConsumirTokenTransaction } from './repository.js'
import type { HelpdeskAccessTokenClaims } from './types.js'

export { HELPDESK_TOKEN_INVALID_MESSAGE, HelpdeskTokenError, HelpdeskTokenAlreadyUsedError }

export const HELPDESK_TOKEN_TTL = '7d'

function getHelpdeskTokenSecret(): string {
  const secret = getEnv().helpdeskTokenSecret
  if (!secret) {
    throw new Error('HELPDESK_TOKEN_SECRET no está configurado')
  }
  return secret
}

export function generarTokenSolicitud(input: {
  uid?: string | null
  email: string
  nombre: string
  areaId: string
  areaNombre: string
}): string {
  const email = input.email.trim().toLowerCase()
  const nombre = input.nombre.trim()
  const areaId = input.areaId.trim()
  const areaNombre = input.areaNombre.trim()

  if (!email.includes('@')) {
    throw new Error('email inválido para token de solicitud')
  }
  if (!nombre || !areaId || !areaNombre) {
    throw new Error('nombre, areaId y areaNombre son obligatorios para el token')
  }

  const jti = randomBytes(16).toString('hex')
  return jwt.sign(
    {
      uid: input.uid ?? null,
      email,
      nombre,
      areaId,
      areaNombre,
    },
    getHelpdeskTokenSecret(),
    {
      expiresIn: HELPDESK_TOKEN_TTL,
      jwtid: jti,
    },
  )
}

function parseVerifiedClaims(decoded: jwt.JwtPayload): HelpdeskAccessTokenClaims {
  const jti = typeof decoded.jti === 'string' ? decoded.jti.trim() : ''
  const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : ''
  const nombre = typeof decoded.nombre === 'string' ? decoded.nombre.trim() : ''
  const areaId = typeof decoded.areaId === 'string' ? decoded.areaId.trim() : ''
  const areaNombre = typeof decoded.areaNombre === 'string' ? decoded.areaNombre.trim() : ''
  const uidRaw = decoded.uid
  const uid =
    uidRaw === null || uidRaw === undefined
      ? null
      : typeof uidRaw === 'string' && uidRaw.trim().length > 0
        ? uidRaw.trim()
        : null

  if (!jti || !email || !nombre || !areaId || !areaNombre) {
    throw new HelpdeskTokenError()
  }

  return { jti, email, nombre, areaId, areaNombre, uid }
}

function decodeVerifiedToken(token: string): HelpdeskAccessTokenClaims {
  const trimmed = token.trim()
  if (!trimmed) {
    throw new HelpdeskTokenError()
  }

  let decoded: jwt.JwtPayload
  try {
    decoded = jwt.verify(trimmed, getHelpdeskTokenSecret()) as jwt.JwtPayload
  } catch {
    throw new HelpdeskTokenError()
  }

  return parseVerifiedClaims(decoded)
}

/** Valida firma/expiración y que el jti no esté consumido (no marca uso). */
export async function verificarToken(token: string): Promise<HelpdeskAccessTokenClaims> {
  const claims = decodeVerifiedToken(token)
  if (await isHelpdeskTokenJtiUsed(claims.jti)) {
    throw new HelpdeskTokenAlreadyUsedError()
  }
  return claims
}

/** Marca el jti como usado en una transacción dedicada. */
export async function consumirToken(
  jti: string,
  meta?: { requesterEmail?: string },
): Promise<void> {
  await runConsumirTokenTransaction(jti, meta)
}
