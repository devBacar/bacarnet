import { createHmac, timingSafeEqual } from 'node:crypto'
import { getEnv } from '../../config/env.js'

const DEFAULT_TTL_MS = 60 * 60 * 1000

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

export function createStagingPreviewToken(
  requestId: string,
  ttlMs = DEFAULT_TTL_MS,
): string {
  const exp = Date.now() + ttlMs
  const payload = `${requestId}.${exp}`
  return `${payload}.${signPayload(payload)}`
}

export function verifyStagingPreviewToken(requestId: string, token: string): boolean {
  if (!token || !requestId) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [id, expRaw, sig] = parts
  if (id !== requestId) return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const payload = `${id}.${expRaw}`
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
  ttlMs = DEFAULT_TTL_MS,
): string {
  const token = createStagingPreviewToken(requestId, ttlMs)
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  return `${normalizedBase}/api/approval-requests/${encodeURIComponent(requestId)}/staging-content?t=${encodeURIComponent(token)}`
}
