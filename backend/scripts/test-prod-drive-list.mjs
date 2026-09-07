import { getTestIdToken } from './get-test-token.mjs'

const { idToken, email } = await getTestIdToken()
const res = await fetch(
  'https://bacarnet.web.app/api/drive/files?folderId=root',
  { headers: { Authorization: `Bearer ${idToken}` } },
)
const text = await res.text()
let parsed
try {
  parsed = JSON.parse(text)
} catch {
  parsed = text
}
console.log('user', email)
console.log('status', res.status)
if (parsed?.files) {
  console.log('files', parsed.files.length)
} else {
  console.log('body', typeof parsed === 'string' ? parsed.slice(0, 500) : JSON.stringify(parsed))
}
process.exit(res.ok ? 0 : 1)
