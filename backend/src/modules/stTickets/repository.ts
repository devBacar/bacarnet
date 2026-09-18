import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import {
  ST_TICKET_LINKS_COLLECTION,
  type StTicketAttachment,
  type StTicketLink,
  type StTicketStatus,
} from './types.js'

function linkRef(stTicketId: number) {
  return adminDb().collection(ST_TICKET_LINKS_COLLECTION).doc(String(stTicketId))
}

export async function createStTicketLink(
  link: Omit<StTicketLink, 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const now = FieldValue.serverTimestamp()
  await linkRef(link.stTicketId).set({ ...link, createdAt: now, updatedAt: now })
}

export async function getStTicketLink(stTicketId: number): Promise<StTicketLink | null> {
  const snap = await linkRef(stTicketId).get()
  return snap.exists ? (snap.data() as StTicketLink) : null
}

export async function requireOwnedStTicketLink(
  stTicketId: number,
  uid: string,
): Promise<StTicketLink> {
  const link = await getStTicketLink(stTicketId)
  if (!link || link.ownerUid !== uid) {
    const err = new Error('Ticket no encontrado o sin acceso')
    ;(err as Error & { statusCode?: number }).statusCode = 404
    throw err
  }
  return link
}

export async function listStTicketLinksForOwner(uid: string): Promise<StTicketLink[]> {
  const snap = await adminDb()
    .collection(ST_TICKET_LINKS_COLLECTION)
    .where('ownerUid', '==', uid)
    .get()
  return snap.docs
    .map((doc) => doc.data() as StTicketLink)
    .sort((a, b) => b.createdAt?.toMillis?.() - a.createdAt?.toMillis?.())
}

export async function updateStTicketLinkStatus(
  stTicketId: number,
  status: StTicketStatus,
): Promise<void> {
  await linkRef(stTicketId).update({ status, updatedAt: FieldValue.serverTimestamp() })
}

export async function appendStTicketAttachments(
  stTicketId: number,
  attachments: StTicketAttachment[],
): Promise<void> {
  if (attachments.length === 0) return
  await linkRef(stTicketId).update({
    attachments: FieldValue.arrayUnion(...attachments),
    updatedAt: FieldValue.serverTimestamp(),
  })
}
