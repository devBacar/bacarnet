import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
process.env.TEST_EMAIL = 'implementaciones.it@bacarsa.com.ar'
const { idToken } = await getTestIdToken({ requireSuperAdmin: false })

const res = await fetch('https://bacarnet.web.app/api/drive/ask', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ question: '¿Puedo ver los correos que recibí hoy en Gmail?' }),
})
const body = await res.json()
console.log('tools:', body.toolsUsed)
console.log('answer:', body.answer?.slice(0, 280))
