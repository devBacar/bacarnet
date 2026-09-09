/**
 * Dispara POST /api/drive/rag/reindex en prod (super_admin).
 *   node backend/scripts/trigger-rag-reindex-prod.mjs
 */

import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const base = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'
const token = await getTestIdToken()
console.log(`POST ${base}/api/drive/rag/reindex`)

const res = await fetch(`${base}/api/drive/rag/reindex`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
})

const body = await res.json().catch(() => ({}))
console.log('HTTP', res.status)
console.log(JSON.stringify(body, null, 2))
if (!res.ok) process.exit(1)
