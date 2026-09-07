import type { AuthedUser } from '../auth/middleware.js'

/**
 * Subject Drive para búsqueda RAG: siempre el usuario real.
 * Nunca datos@ / super_admin, para no ampliar resultados de búsqueda.
 */
export function resolveSearchSubject(user: AuthedUser): string {
  return user.email.trim().toLowerCase()
}
