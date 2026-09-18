/**
 * Pruebas OAuth widgets Gmail/Calendar (backend).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-google-widgets-oauth.mjs
 *
 * Opcional (refresh real contra Google):
 *   WIDGETS_OAUTH_* en backend/.env.local + TEST_GOOGLE_WIDGETS_REFRESH_TOKEN
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAuth } from 'firebase-admin/auth'
import { google } from 'googleapis'
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const API_PORT = 8796
const VITE_PORT = 5193
const API = `http://127.0.0.1:${API_PORT}`

function pass(label, detail = '') {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
}

function fail(label, detail = '') {
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  process.exitCode = 1
}

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()

const { encryptSecret, decryptSecret } = await import('../lib/lib/crypto/secretBox.js')

const encKey = process.env.WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY?.trim() || 'test-key-local-only'
const sample = 'refresh_token_sample_' + randomBytes(8).toString('hex')
const boxed = encryptSecret(sample, encKey)
const roundtrip = decryptSecret(boxed, encKey)
if (roundtrip === sample) {
  pass('Cifrado AES-GCM roundtrip')
} else {
  fail('Cifrado AES-GCM roundtrip')
}

const refreshFromEnv = process.env.TEST_GOOGLE_WIDGETS_REFRESH_TOKEN?.trim()
if (refreshFromEnv) {
  const clientId = process.env.WIDGETS_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.WIDGETS_OAUTH_CLIENT_SECRET?.trim()
  const redirectUri =
    process.env.WIDGETS_OAUTH_REDIRECT_URI?.trim() ||
    'http://localhost:5173/api/me/google/oauth/callback'
  if (!clientId || !clientSecret) {
    fail('Refresh real', 'faltan WIDGETS_OAUTH_CLIENT_ID/SECRET')
  } else {
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
    client.setCredentials({ refresh_token: refreshFromEnv })
    const t1 = await client.getAccessToken()
    const t2 = await client.getAccessToken()
    if (t1.token && t2.token) {
      pass('Refresh token → access token (2 llamadas sin interacción)', t2.token.slice(0, 12) + '…')
    } else {
      fail('Refresh token → access token')
    }
  }
} else {
  console.log('SKIP  Refresh real (definí TEST_GOOGLE_WIDGETS_REFRESH_TOKEN para probar contra Google)')
}

if (!process.env.WIDGETS_OAUTH_CLIENT_ID || !process.env.WIDGETS_OAUTH_CLIENT_SECRET) {
  console.log('SKIP  API E2E (configurá WIDGETS_OAUTH_* en backend/.env.local)')
  process.exit(process.exitCode ?? 0)
}

process.env.WIDGETS_OAUTH_STATE_SECRET =
  process.env.WIDGETS_OAUTH_STATE_SECRET || randomBytes(32).toString('hex')
process.env.WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY =
  process.env.WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY || randomBytes(32).toString('hex')

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const instance = app.listen(API_PORT, '127.0.0.1', (error) =>
    error ? reject(error) : resolvePromise(instance),
  )
})

try {
  await waitOk(`${API}/api/health`)
  const { idToken, uid } = await getTestIdToken()

  const statusRes = await fetch(`${API}/api/me/google/status`, {
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (statusRes.ok) {
    const body = await statusRes.json()
    pass('GET /api/me/google/status', JSON.stringify(body))
  } else {
    fail('GET /api/me/google/status', String(statusRes.status))
  }

  const startRes = await fetch(`${API}/api/me/google/oauth/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ returnTo: '/intranet' }),
  })
  if (!startRes.ok) {
    fail('POST oauth/start', String(startRes.status))
  } else {
    const { authorizeUrl } = await startRes.json()
    const url = new URL(authorizeUrl)
    if (url.searchParams.get('access_type') === 'offline') {
      pass('authorizeUrl incluye access_type=offline')
    } else {
      fail('authorizeUrl access_type=offline')
    }
    if (url.searchParams.get('prompt') === 'consent') {
      pass('authorizeUrl prompt=consent solo en inicio OAuth (no en lecturas API)')
    } else {
      fail('authorizeUrl prompt=consent en start')
    }
  }

  const gmailRes = await fetch(`${API}/api/me/gmail/messages`, {
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (gmailRes.status === 401) {
    const body = await gmailRes.json()
    if (body.code === 'google_reconnect_required') {
      pass('Gmail sin integración → google_reconnect_required')
    } else {
      fail('Gmail sin integración', JSON.stringify(body))
    }
  } else {
    fail('Gmail sin integración', `status ${gmailRes.status}`)
  }

  const { encryptSecret: enc2 } = await import('../lib/lib/crypto/secretBox.js')
  const key = process.env.WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY
  const fakeRefresh = 'fake_refresh_for_disconnect_test'
  const { adminDb } = await import('../lib/lib/firebase/admin.js')
  await adminDb()
    .collection('user_google_integrations')
    .doc(uid)
    .set({
      encryptedRefreshToken: enc2(fakeRefresh, key),
      scope: 'test',
      googleEmail: 'test@bacarsa.com.ar',
      connectedAt: new Date(),
      updatedAt: new Date(),
    })

  const delRes = await fetch(`${API}/api/me/google/connection`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (delRes.ok) {
    pass('DELETE /api/me/google/connection')
  } else {
    fail('DELETE connection', String(delRes.status))
  }

  const snap = await adminDb().collection('user_google_integrations').doc(uid).get()
  if (!snap.exists) {
    pass('Refresh token borrado de Firestore tras desconectar')
  } else {
    fail('Firestore tras desconectar', 'doc aún existe')
  }
} finally {
  await new Promise((r) => server.close(() => r()))
}
