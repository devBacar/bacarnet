import { randomBytes } from 'node:crypto'

/**
 * Contraseña fija para cuentas de prueba (Auth createUser / signIn).
 * Definila en backend/.env.local — nunca en el repositorio.
 */
export function requireTestAccountPassword(envVar = 'TEST_ACCOUNT_PASSWORD') {
  const value = process.env[envVar]?.trim()
  if (!value) {
    throw new Error(
      `Falta ${envVar} en backend/.env.local (ver backend/.env.local.example).`,
    )
  }
  return value
}

/** Contraseña efímera aleatoria para tests UI (Playwright). Sin prefijos en código. */
export function generateEphemeralPassword(byteLength = 18) {
  return randomBytes(byteLength).toString('base64url')
}
