import { getTestIdToken } from './get-test-token.mjs'

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'

const user = await getTestIdToken()
const sessionRes = await fetch(`${base}/api/boards/session`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${user.idToken}` },
})
console.log('session status', sessionRes.status)
const setCookies = sessionRes.headers.getSetCookie?.() ?? [sessionRes.headers.get('set-cookie')]
console.log('setCookies count', setCookies.filter(Boolean).length)
for (const sc of setCookies.filter(Boolean)) {
  console.log('raw Set-Cookie:', sc)
}

const listRes = await fetch(`${base}/api/boards`, {
  headers: { Authorization: `Bearer ${user.idToken}` },
})
const listBody = await listRes.json()
const boardId = listBody.boards?.[0]?.id
console.log('board', boardId)

for (const sc of setCookies.filter(Boolean)) {
  const cookiePair = sc.split(';')[0].trim()
  console.log('cookie pair length', cookiePair.length)
  const htmlRes = await fetch(`${base}/api/boards/${boardId}/index.html`, {
    headers: { Cookie: cookiePair },
  })
  const text = await htmlRes.text()
  console.log('html status', htmlRes.status, text.slice(0, 200))
}

// Sin cookie
const bare = await fetch(`${base}/api/boards/${boardId}/index.html`)
console.log('html sin cookie', bare.status, (await bare.text()).slice(0, 80))

const cookiePair = setCookies.filter(Boolean)[0].split(';')[0].trim()
const runBase = process.env.CLOUD_RUN_BASE?.trim() || 'https://api-u4bp6pm7aa-rj.a.run.app'
for (const [label, host] of [
  ['hosting', base],
  ['cloud-run', runBase],
]) {
  const url = `${host}/api/boards/${boardId}/index.html`
  const res = await fetch(url, { headers: { Cookie: cookiePair } })
  const text = await res.text()
  console.log(`${label} con cookie`, res.status, text.slice(0, 120))
}
