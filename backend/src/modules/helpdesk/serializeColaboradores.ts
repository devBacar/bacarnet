import type { Timestamp } from 'firebase-admin/firestore'
import type {
  HelpdeskColaboradorSistemas,
  HelpdeskColaboradorSolicitante,
} from './types.js'

function timestampToIso(value: Timestamp | undefined): string | null {
  if (!value || typeof value.toDate !== 'function') return null
  return value.toDate().toISOString()
}

export function serializeColaboradorSistemas(row: HelpdeskColaboradorSistemas) {
  return {
    teamMemberId: row.teamMemberId,
    nombre: row.nombre,
    email: row.email,
    addedByEmail: row.addedByEmail,
    addedAt: timestampToIso(row.addedAt),
  }
}

export function serializeColaboradorSolicitante(row: HelpdeskColaboradorSolicitante) {
  return {
    email: row.email,
    uid: row.uid ?? null,
    nombre: row.nombre,
    rol: row.rol,
    addedAt: timestampToIso(row.addedAt),
  }
}
