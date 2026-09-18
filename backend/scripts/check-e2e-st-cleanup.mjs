import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const requireFromSt = createRequire(resolve('C:\\sistema-de-tickets\\backend\\package.json'))
requireFromSt('dotenv').config({ path: 'C:\\sistema-de-tickets\\backend\\.env' })
const pool = requireFromSt('./src/config/db')

try {
  const [tickets] = await pool.execute(
    'SELECT COUNT(*) AS total FROM tickets WHERE title LIKE ?',
    ['E2E Soporte TI %'],
  )
  const [users] = await pool.execute(
    'SELECT COUNT(*) AS total FROM users WHERE email LIKE ?',
    ['e2e.st.%@bacarsa.com.ar'],
  )
  loadTestEnv()
  initAdmin()
  const links = await getAdminDb().collection('stTicketLinks').get()
  const firestoreLinks = links.docs.filter((doc) =>
    String(doc.get('requesterEmail') ?? '').startsWith('e2e.st.'),
  ).length
  console.log(JSON.stringify({
    tickets: Number(tickets[0].total),
    users: Number(users[0].total),
    firestoreLinks,
  }))
  if (Number(tickets[0].total) !== 0 || Number(users[0].total) !== 0 || firestoreLinks !== 0) {
    process.exitCode = 1
  }
} finally {
  await pool.end()
}
