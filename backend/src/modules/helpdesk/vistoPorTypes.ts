import type { Timestamp } from 'firebase-admin/firestore'

export const HELPDESK_VISTO_POR_SUBCOLLECTION = 'vistoPor'

export const HELPDESK_VISTO_SECCIONES = [
  'seguimiento',
  'analisis',
  'reuniones',
  'bitacora',
  'correos',
] as const

export type HelpdeskVistoSeccion = (typeof HELPDESK_VISTO_SECCIONES)[number]

export function isHelpdeskVistoSeccion(value: unknown): value is HelpdeskVistoSeccion {
  return typeof value === 'string' && (HELPDESK_VISTO_SECCIONES as readonly string[]).includes(value)
}

export type HelpdeskVistoPorDoc = Partial<Record<HelpdeskVistoSeccion, Timestamp>>
