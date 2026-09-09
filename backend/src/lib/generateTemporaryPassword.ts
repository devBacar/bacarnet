import { randomBytes } from 'node:crypto'

const TEMP_PASSWORD_CHARS =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@***REMOVED***$%^&*'

/** Contraseña temporal criptográficamente aleatoria (sin prefijo fijo en código). */
export function generateTemporaryPassword(length = 20): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_CHARS[bytes[i]! % TEMP_PASSWORD_CHARS.length]
  }
  return out
}
