import { getTestIdToken } from './get-test-token.mjs'

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const boardId = process.env.BOARD_ID?.trim() || '140_xtWc8wk4hl7Tfy9aU-VRm41AGjzv9'
const email = process.env.GRANT_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'

process.env.TEST_EMAIL = process.env.TEST_EMAIL || 'admin@bacarsa.com.ar'
const user = await getTestIdToken()

const res = await fetch(`${base}/api/boards/${boardId}/access`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${user.idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email,
    reason: 'Prueba otorgamiento acceso tablero compras',
  }),
})

const text = await res.text()
console.log('status', res.status)
console.log('body', text)
