import { requireTestAccountPassword } from './lib/testSecrets.mjs'
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const apiKey = process.env.VITE_FIREBASE_API_KEY
const password = requireTestAccountPassword()
const res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'checklist-pending-ui@example.com',
      password,
      returnSecureToken: true,
    }),
  },
)
console.log(await res.json())
