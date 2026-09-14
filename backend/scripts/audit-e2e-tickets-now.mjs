import { initAdmin, getAdminDb, loadTestEnv } from './get-test-token.mjs'

const LEGACY_IDS = [
  'PDO77JK3g5dBgMKRrirn',
  'etCQQaUet2AtofO0XBkO',
  'Yb3sorasmR4pl7fW3qIp',
  'z9JoHDQWw3bkvf0CFiK0',
]

loadTestEnv()
initAdmin()
const db = getAdminDb()

const legacy = []
for (const id of LEGACY_IDS) {
  const snap = await db.collection('helpdeskTickets').doc(id).get()
  legacy.push({ id, exists: snap.exists })
}

const snap = await db.collection('helpdeskTickets').get()
const e2e = []
for (const doc of snap.docs) {
  const d = doc.data()
  const area = String(d.areaNombre ?? '')
  if (
    area.includes('E2E') ||
    area === 'Sistemas' ||
    String(d.token ?? '').includes('e2e') ||
    String(d.token ?? '').includes('layout-probe')
  ) {
    e2e.push({
      id: doc.id,
      areaNombre: area,
      requesterNombre: d.requesterNombre ?? null,
      token: d.token ?? null,
      createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? null,
      estadoIdx: d.estadoIdx ?? null,
    })
  }
}
e2e.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))

console.log(JSON.stringify({ legacyIds: legacy, matchingTickets: e2e }, null, 2))
