/**
 * Chequeo rápido pre-deploy: rol commenter en Drive API.
 * node backend/scripts/verify-commenter-role.mjs
 */

import { getTestIdToken } from './get-test-token.mjs'

const PARENT = '1xSy-TSp4EFeqYJ2n772X46Pj5WM42WZ5'
const GRANTEE = 'implementaciones.ti@bacarsa.com.ar'
const REASON = 'Verificación rol Comentarista pre-deploy'

function apiBase() {
  return (
    process.env.FUNCTIONS_API_BASE?.trim() ||
    'https://bacarnet.web.app'
  )
}

async function api(idToken, method, path, body) {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // keep text
  }
  return { status: res.status, body: parsed }
}

async function main() {
  const { idToken } = await getTestIdToken()
  const stamp = Date.now()

  const created = await api(idToken, 'POST', '/api/drive/files', {
    name: `Verify commenter ${stamp}`,
    type: 'google_doc',
    parentFolderId: PARENT,
    reason: REASON,
    classification: 'USO_INTERNO',
  })
  if (created.status !== 201) {
    console.error('FAIL create file', created.status, created.body)
    process.exit(1)
  }
  const fileId = created.body.id

  const grant = await api(idToken, 'POST', `/api/drive/files/${fileId}/permissions`, {
    type: 'user',
    email: GRANTEE,
    role: 'commenter',
    reason: REASON,
  })
  if (grant.status !== 201 && grant.status !== 200) {
    console.error('FAIL grant commenter', grant.status, grant.body)
    process.exit(1)
  }

  const listed = await api(idToken, 'GET', `/api/drive/files/${fileId}/permissions`)
  const match = listed.body?.permissions?.find(
    (p) => p.emailAddress?.toLowerCase() === GRANTEE.toLowerCase(),
  )

  if (!match || match.role !== 'commenter' || match.driveRole !== 'commenter') {
    console.error('FAIL permission not commenter', JSON.stringify(match, null, 2))
    process.exit(1)
  }

  console.log('OK commenter grant verified', {
    fileId,
    permissionId: match.id,
    role: match.role,
    driveRole: match.driveRole,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
