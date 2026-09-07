import { getAuth } from 'firebase-admin/auth'
import { getAdminDb, initAdmin } from './get-test-token.mjs'

initAdmin()
const email = 'checklist-pending-ui@example.com'
const auth = getAuth()
const db = getAdminDb()
try {
  await auth.deleteUser((await auth.getUserByEmail(email)).uid)
} catch {}
const u = await auth.createUser({
  email,
  password: 'REDACTED',
  emailVerified: true,
  displayName: 'Pending UI Test',
})
await db.collection('users').doc(u.uid).set({
  email,
  displayName: 'Pending UI Test',
  department: 'Externo',
  role: 'user',
  accountType: 'external',
  accountStatus: 'pending_approval',
  permissions: {
    view_directory: false,
    view_drive: false,
    view_links: false,
    manage_news: false,
    manage_links: false,
    manage_users: false,
    super_admin: false,
  },
  favoriteApps: [],
  widgetPreferences: { weather: true, dollar: true },
})
console.log('pending-ui-user', email, u.uid)
