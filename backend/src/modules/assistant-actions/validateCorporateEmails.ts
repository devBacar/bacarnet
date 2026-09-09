import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeCorporateEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function assertCorporateEmail(raw: string, fieldLabel: string): string {
  const email = normalizeCorporateEmail(raw)
  if (!EMAIL_RE.test(email)) {
    throw new Error(`${fieldLabel} no es un email válido.`)
  }
  const domain = getEnv().allowedEmailDomain
  if (!isEmailInAllowedDomain(email, domain)) {
    throw new Error(`${fieldLabel} debe ser una cuenta @${domain}.`)
  }
  return email
}

export function isCorporateEmail(raw: string): boolean {
  const email = normalizeCorporateEmail(raw)
  if (!EMAIL_RE.test(email)) return false
  const domain = getEnv().allowedEmailDomain
  return isEmailInAllowedDomain(email, domain)
}

export function listExternalAttendees(attendees: string[]): string[] {
  return attendees.filter((email) => !isCorporateEmail(email))
}

export function assertEmail(raw: string, fieldLabel: string): string {
  const email = normalizeCorporateEmail(raw)
  if (!EMAIL_RE.test(email)) {
    throw new Error(`${fieldLabel} no es un email válido.`)
  }
  return email
}

export function assertEmailList(
  raw: unknown,
  fieldLabel: string,
  options?: { required?: boolean; max?: number },
): string[] {
  const max = options?.max ?? 20
  const required = options?.required ?? false

  let items: string[] = []
  if (Array.isArray(raw)) {
    items = raw.filter((item): item is string => typeof item === 'string')
  } else if (typeof raw === 'string' && raw.trim()) {
    items = raw.split(/[,;]+/g)
  }

  const normalized: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const email = assertEmail(item, fieldLabel)
    if (seen.has(email)) continue
    seen.add(email)
    normalized.push(email)
    if (normalized.length > max) {
      throw new Error(`${fieldLabel} admite hasta ${max} direcciones.`)
    }
  }

  if (required && normalized.length === 0) {
    throw new Error(`${fieldLabel} es obligatorio.`)
  }

  return normalized
}

export function assertCorporateEmailList(
  raw: unknown,
  fieldLabel: string,
  options?: { required?: boolean; max?: number },
): string[] {
  const max = options?.max ?? 20
  const required = options?.required ?? false

  let items: string[] = []
  if (Array.isArray(raw)) {
    items = raw.filter((item): item is string => typeof item === 'string')
  } else if (typeof raw === 'string' && raw.trim()) {
    items = raw.split(/[,;]+/g)
  }

  const normalized: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const email = assertCorporateEmail(item, fieldLabel)
    if (seen.has(email)) continue
    seen.add(email)
    normalized.push(email)
    if (normalized.length > max) {
      throw new Error(`${fieldLabel} admite hasta ${max} direcciones.`)
    }
  }

  if (required && normalized.length === 0) {
    throw new Error(`${fieldLabel} es obligatorio.`)
  }

  return normalized
}

export function assertNonEmptyString(raw: unknown, fieldLabel: string, maxLen: number): string {
  if (typeof raw !== 'string') {
    throw new Error(`${fieldLabel} es obligatorio.`)
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error(`${fieldLabel} es obligatorio.`)
  }
  if (trimmed.length > maxLen) {
    throw new Error(`${fieldLabel} supera el límite de ${maxLen} caracteres.`)
  }
  return trimmed
}
