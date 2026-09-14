import type { Timestamp } from 'firebase-admin/firestore'
import type { HelpdeskBitacoraEntrada } from './types.js'

function timestampToIso(value: Timestamp | undefined): string | null {
  if (!value || typeof value.toDate !== 'function') return null
  return value.toDate().toISOString()
}

export function serializeHelpdeskBitacoraEntrada(entrada: HelpdeskBitacoraEntrada & { id: string }) {
  return {
    id: entrada.id,
    autorNombre: entrada.autorNombre,
    autorEmail: entrada.autorEmail,
    tipo: entrada.tipo,
    texto: entrada.texto,
    adjuntoDriveLink: entrada.adjuntoDriveLink ?? null,
    createdAt: timestampToIso(entrada.createdAt),
  }
}
