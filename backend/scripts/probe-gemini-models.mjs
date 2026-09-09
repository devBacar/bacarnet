import { google } from 'googleapis'
import { loadTestEnv } from './get-test-token.mjs'
import { resolve } from 'node:path'

loadTestEnv()
const key = process.env.DRIVE_SERVICE_ACCOUNT_KEY_PATH
const jwt = new google.auth.JWT({
  keyFile: resolve(key),
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})
const { token } = await jwt.getAccessToken()
const projectId = process.env.GCP_PROJECT_ID || 'bacar-web'

const models = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite-001',
  'gemini-1.5-flash-002',
  'gemini-1.5-flash',
]

for (const location of ['us-central1', 'global']) {
  console.log(`\n=== location=${location} ===`)
  for (const model of models) {
    const host =
      location === 'global'
        ? 'https://aiplatform.googleapis.com'
        : `https://${location}-aiplatform.googleapis.com`
    const url = `${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Di hola en una palabra' }] }],
      }),
    })
    const body = await res.json().catch(() => ({}))
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text
    const err = body.error?.message?.split('\n')[0] ?? body.error?.status
    console.log(`${model}: HTTP ${res.status}${text ? ` → ${text}` : err ? ` → ${String(err).slice(0, 90)}` : ''}`)
  }
}
