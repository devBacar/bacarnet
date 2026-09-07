import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const API = 'https://bacarnet.web.app'
const approveFileId = '1AQyKOX8YJ_owtpITAvwunoQgEgvpIKu8wPMcg3aWjRk'

process.env.TEST_EMAIL = 'visual.requester@bacarsa.com.ar'
const requester = await getTestIdToken({ requireSuperAdmin: false })
const fileRes = await fetch(`${API}/api/drive/files/${approveFileId}`, {
  headers: { Authorization: `Bearer ${requester.idToken}` },
})
console.log('GET file', fileRes.status, await fileRes.text())

const db = getAdminDb()
const reqs = await db.collection('approvalRequests').where('fileId', '==', approveFileId).get()
for (const d of reqs.docs) {
  console.log('request', d.id, d.get('status'), d.get('requesterEmail'))
}

const notifs = await db
  .collection('users')
  .doc(requester.uid)
  .collection('notifications')
  .orderBy('createdAt', 'desc')
  .limit(5)
  .get()
for (const n of notifs.docs) {
  console.log('notif', n.get('type'), n.get('title'), n.get('read'))
}
