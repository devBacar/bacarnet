import { getAuth } from 'firebase-admin/auth'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()
const auth = getAuth()
let next
let count = 0
do {
  const page = await auth.listUsers(100, next)
  for (const u of page.users) {
    if (u.email?.includes('bacarsa.com.ar')) {
      console.log(u.uid, u.email)
      count++
    }
  }
  next = page.pageToken
} while (next)
console.log(`total @bacarsa: ${count}`)
