import type { DocumentData } from 'firebase-admin/firestore'
import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { adminDb } from '../../lib/firebase/admin.js'
import { resolveAreaMembers, type AreaMember } from '../drive/resolveAreaMembers.js'

function mapUserDoc(uid: string, data: DocumentData): AreaMember | null {
  const domain = getEnv().allowedEmailDomain
  const emailRaw = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  if (!emailRaw || !isEmailInAllowedDomain(emailRaw, domain)) return null
  const displayName =
    typeof data.displayName === 'string' && data.displayName.trim().length > 0
      ? data.displayName.trim()
      : null
  return { uid, email: emailRaw, displayName }
}

export async function resolveUidByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  const q = await adminDb()
    .collection('users')
    .where('email', '==', normalized)
    .limit(1)
    .get()
  if (!q.empty) return q.docs[0].id

  const granteeUidFromMetadata = await resolveUidByEmailScan(normalized)
  return granteeUidFromMetadata
}

async function resolveUidByEmailScan(normalizedEmail: string): Promise<string | null> {
  const snaps = await adminDb().collection('users').limit(500).get()
  for (const doc of snaps.docs) {
    const email =
      typeof doc.get('email') === 'string' ? doc.get('email').trim().toLowerCase() : ''
    if (email === normalizedEmail) return doc.id
  }
  return null
}

/** Jefes de un área (`managedAreaIds`). */
export async function resolveAreaChiefs(areaId: string): Promise<AreaMember[]> {
  const domain = getEnv().allowedEmailDomain
  const snap = await adminDb()
    .collection('users')
    .where('managedAreaIds', 'array-contains', areaId)
    .get()

  const rows: AreaMember[] = []
  for (const doc of snap.docs) {
    const row = mapUserDoc(doc.id, doc.data())
    if (row) rows.push(row)
  }

  return rows.sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email, 'es'),
  )
}

/** Miembros + jefes del área (tipo 1). */
export async function resolveAreaMembersAndChiefs(areaId: string): Promise<AreaMember[]> {
  return resolveAreaMembers(areaId)
}

export async function resolveSuperAdminUids(): Promise<string[]> {
  const snaps = await adminDb().collection('users').limit(200).get()
  const uids: string[] = []
  for (const doc of snaps.docs) {
    const role = doc.get('role')
    const permissions = doc.get('permissions')
    const isSuper =
      role === 'super_admin' ||
      (permissions &&
        typeof permissions === 'object' &&
        !Array.isArray(permissions) &&
        (permissions as Record<string, unknown>).super_admin === true)
    if (isSuper) uids.push(doc.id)
  }
  return uids
}

export function excludeActor(members: AreaMember[], actorUid: string): AreaMember[] {
  return members.filter((member) => member.uid !== actorUid)
}

export function uniqueMembers(members: AreaMember[]): AreaMember[] {
  const byUid = new Map<string, AreaMember>()
  for (const member of members) {
    byUid.set(member.uid, member)
  }
  return [...byUid.values()]
}
