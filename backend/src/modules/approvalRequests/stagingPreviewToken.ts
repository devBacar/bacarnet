import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getEnv } from '../../config/env.js'

/** 15 min — suficiente para abrir preview Office; limita replay. */
export const STAGING_PREVIEW_TTL_MS = 15 * 60 * 1000

function previewSecret(): string {
  const secret = getEnv().boardsSessionSecret
  if (!secret) {
    throw new Error('BOARDS_SESSION_SECRET requerido para tokens de vista previa staging')
  }
  return secret
}

function signPayload(payload: string): string {
  return createHmac('sha256', previewSecret()).update(payload).digest('base64url')
}

export function createStagingPreviewNonce(): string {
  return randomBytes(16).toString('base64url')
}

export function createStagingPreviewToken(
  requestId: string,
  nonce: string,
  ttlMs = STAGING_PREVIEW_TTL_MS,
): string {
  const exp = Date.now() + ttlMs
  const payload = `${requestId}.${exp}.${nonce}`
  return `${payload}.${signPayload(payload)}`
}

export function verifyStagingPreviewToken(
  requestId: string,
  token: string,
  expectedNonce: string | null | undefined,
): boolean {
  if (!token || !requestId || !expectedNonce) return false
  const parts = token.split('.')
  if (parts.length !== 4) return false
  const [id, expRaw, nonce, sig] = parts
  if (id !== requestId || nonce !== expectedNonce) return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const payload = `${id}.${expRaw}.${nonce}`
  const expected = signPayload(payload)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function buildStagingContentUrl(
  requestId: string,
  baseUrl: string,
  nonce: string,
  ttlMs = STAGING_PREVIEW_TTL_MS,
): string {
  const token = createStagingPreviewToken(requestId, nonce, ttlMs)
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  return `${normalizedBase}/api/approval-requests/${encodeURIComponent(requestId)}/staging-content?t=${encodeURIComponent(token)}`
}
