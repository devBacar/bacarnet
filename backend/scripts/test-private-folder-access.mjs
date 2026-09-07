/**
 * Crea carpeta privada como usuario común y verifica acceso de datos@ (super_admin).
 *
 *   node backend/scripts/test-private-folder-access.mjs
 *   TEST_EMAIL=implementaciones.it@bacarsa.com.ar node backend/scripts/test-private-folder-access.mjs
 */

import { getAdminDb, getTestIdToken } from './get-test-token.mjs'

const SISTEMAS_DRIVE = '188-zgNhMIfeUjAI8GracINlItBbFwoUb'

function apiBase() {
  return (
    process.env.FUNCTIONS_API_BASE?.trim() ||
    'https://intranet-bacar.web.app'
  )
}

async function apiFetch(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function main() {
  if (!process.env.TEST_EMAIL) {
    process.env.TEST_EMAIL = 'implementaciones.it@bacarsa.com.ar'
  }

  const creator = await getTestIdToken({ requireSuperAdmin: false })
  const admin = await (async () => {
    process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
    return getTestIdToken({ requireSuperAdmin: true })
  })()

  const name = `Privada prueba ${Date.now()}`

  const created = await apiFetch('/api/drive/files', {
    token: creator.idToken,
    method: 'POST',
    body: {
      name,
      type: 'folder',
      parentFolderId: SISTEMAS_DRIVE,
      privateFolder: true,
      reason: 'Prueba automatizada de carpeta privada y acceso datos@',
    },
  })

  console.log('create (creator)', created.status, JSON.stringify(created.json, null, 2))
  const folderId = created.json.id
  if (!folderId) {
    process.exit(1)
  }

  const creatorList = await apiFetch(
    `/api/drive/files?folderId=${encodeURIComponent(SISTEMAS_DRIVE)}`,
    { token: creator.idToken },
  )
  const creatorSees = creatorList.json.files?.some((file) => file.id === folderId)

  const adminList = await apiFetch(
    `/api/drive/files?folderId=${encodeURIComponent(SISTEMAS_DRIVE)}`,
    { token: admin.idToken },
  )
  const adminSees = adminList.json.files?.some((file) => file.id === folderId)

  const adminPerms = await apiFetch(`/api/drive/files/${encodeURIComponent(folderId)}/permissions`, {
    token: admin.idToken,
  })

  const sidecar = await getAdminDb().collection('driveFiles').doc(folderId).get()

  const trashed = await apiFetch(`/api/drive/files/${encodeURIComponent(folderId)}/trash`, {
    token: admin.idToken,
    method: 'POST',
    body: { reason: 'Limpieza tras prueba de carpeta privada' },
  })

  const creatorInside = await apiFetch(
    `/api/drive/files?folderId=${encodeURIComponent(folderId)}`,
    { token: creator.idToken },
  )

  const checks = [
    ['create 201', created.status === 201],
    ['privateFolder true', created.json.privateFolder === true],
    ['governanceCanReadPrivate', created.json.governanceCanReadPrivate === true],
    ['privateAccess.governanceGranted', created.json.privateAccess?.governanceGranted === true],
    [
      'creator acceso (grant o listado interno)',
      created.json.privateAccess?.creatorGranted === true || creatorInside.status === 200,
    ],
    ['classification RESTRINGIDO', created.json.classification === 'RESTRINGIDO'],
    ['creator ve carpeta en listado', creatorSees === true],
    ['super_admin ve carpeta en listado', adminSees === true],
    ['permisos listables por super_admin', adminPerms.status === 200],
    ['sidecar classification', sidecar.get('classification') === 'RESTRINGIDO'],
    ['trash cleanup', trashed.status === 200],
  ]

  console.log('\n--- Resultados ---')
  let failed = 0
  for (const [label, ok] of checks) {
    console.log(`${ok ? 'OK' : 'FAIL'}  ${label}`)
    if (!ok) failed += 1
  }

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
