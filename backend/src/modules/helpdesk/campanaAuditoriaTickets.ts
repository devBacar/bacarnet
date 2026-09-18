import type { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import {
  HELPDESK_TICKETS_COLLECTION,
  type HelpdeskTicket,
} from './types.js'
import type { CampanaTicketRef } from './campanaAuditoriaEnrich.js'
import { normalizeCampanaEmail } from './campanaAuditoriaEnrich.js'

const FIRESTORE_IN_LIMIT = 30

function timestampToIso(value: Timestamp | undefined): string | null {
  if (!value || typeof value.toDate !== 'function') return null
  return value.toDate().toISOString()
}

export async function mapHelpdeskTicketsByRequesterEmail(
  emails: string[],
): Promise<Map<string, CampanaTicketRef[]>> {
  const normalized = [
    ...new Set(
      emails
        .map((e) => normalizeCampanaEmail(e))
        .filter((e): e is string => e != null),
    ),
  ]
  const map = new Map<string, CampanaTicketRef[]>()
  if (normalized.length === 0) return map

  for (let offset = 0; offset < normalized.length; offset += FIRESTORE_IN_LIMIT) {
    const chunk = normalized.slice(offset, offset + FIRESTORE_IN_LIMIT)
    const snap = await adminDb()
      .collection(HELPDESK_TICKETS_COLLECTION)
      .where('requesterEmail', 'in', chunk)
      .get()

    for (const doc of snap.docs) {
      const data = doc.data() as HelpdeskTicket
      const email = normalizeCampanaEmail(data.requesterEmail)
      const createdAtIso = timestampToIso(data.createdAt)
      if (!email || !createdAtIso) continue
      const hit: CampanaTicketRef = {
        ticketId: doc.id,
        createdAtIso,
        areaNombre: typeof data.areaNombre === 'string' ? data.areaNombre : '',
      }
      const list = map.get(email) ?? []
      list.push(hit)
      map.set(email, list)
    }
  }

  return map
}
