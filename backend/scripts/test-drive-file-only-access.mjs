/**
 * Verifica permiso directo a un archivo sin acceso previo al archivo.
 * Idealmente el grantee no debería listar la carpeta contenedora; si ya es miembro
 * de la unidad compartida o tiene acceso heredado, igual debe poder abrir el archivo por id/link.
 *
 *   FUNCTIONS_API_BASE=https://bacarnet.web.app node backend/scripts/test-drive-file-only-access.mjs
 */

import { getTestIdToken } from './get-test-token.mjs'

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const SISTEMAS_DRIVE = '188-zgNhMIfeUjAI8GracINlItBbFwoUb'
const GRANTEE_EMAIL =
  process.env.TEST_GRANTEE_EMAIL?.trim().toLowerCase() || 'implementaciones.it@bacarsa.com.ar'
const REASON = 'Prueba acceso a archivo puntual sin permiso previo en el archivo'

async function api(idToken, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const parsed = await res.json().catch(() => ({}))
  return { status: res.status, body: parsed }
}

async function main() {
  process.env.TEST_EMAIL = process.env.TEST_ACTOR_EMAIL || 'admin@bacarsa.com.ar'
  const actor = await getTestIdToken()
  process.env.TEST_EMAIL = GRANTEE_EMAIL
  const grantee = await getTestIdToken({ requireSuperAdmin: false })

  const stamp = Date.now()
  const created = await api(actor.idToken, 'POST', '/api/drive/files', {
    name: `Prueba acceso puntual ${stamp}`,
    type: 'google_doc',
    parentFolderId: SISTEMAS_DRIVE,
    classification: 'USO_INTERNO',
    reason: REASON,
  })
  const fileId = created.body?.id
  if (created.status !== 201 || !fileId) {
    console.error('No se pudo crear archivo de prueba', created)
    process.exit(1)
  }

  const beforeFileGet = await api(grantee.idToken, 'GET', `/api/drive/files/${fileId}`)
  const beforeFolderList = await api(
    grantee.idToken,
    'GET',
    `/api/drive/files?folderId=${SISTEMAS_DRIVE}`,
  )
  const beforeInFolder = beforeFolderList.body?.files?.some((row) => row.id === fileId)

  const grant = await api(actor.idToken, 'POST', `/api/drive/files/${fileId}/permissions`, {
    email: grantee.email,
    role: 'reader',
    reason: REASON,
  })
  const permissionId = grant.body?.id

  const afterFileGet = await api(grantee.idToken, 'GET', `/api/drive/files/${fileId}`)
  const afterFolderList = await api(
    grantee.idToken,
    'GET',
    `/api/drive/files?folderId=${SISTEMAS_DRIVE}`,
  )
  const afterInFolder = afterFolderList.body?.files?.some((row) => row.id === fileId)

  if (permissionId) {
    await api(
      actor.idToken,
      'POST',
      `/api/drive/files/${fileId}/permissions/${permissionId}/revoke`,
      { reason: 'Limpieza tras prueba acceso puntual' },
    )
  }
  await api(actor.idToken, 'POST', `/api/drive/files/${fileId}/trash`, {
    reason: 'Limpieza tras prueba acceso puntual',
  })

  const checks = [
    ['grant 201', grant.status === 201],
    ['sin permiso previo: GET archivo falla', beforeFileGet.status === 403 || beforeFileGet.status === 404],
    ['con permiso: GET archivo ok', afterFileGet.status === 200 && afterFileGet.body?.id === fileId],
    [
      'archivo no visible en listado antes del grant (si puede listar carpeta)',
      beforeFolderList.status === 403 || beforeInFolder !== true,
    ],
    [
      'aislamiento carpeta: sin listado o archivo fuera del listado tras grant',
      afterFolderList.status === 403 || afterInFolder !== true,
    ],
  ]

  for (const [label, ok] of checks) {
    console.log(ok ? 'OK' : 'FAIL', label)
  }

  console.log(
    JSON.stringify(
      {
        actor: actor.email,
        grantee: grantee.email,
        fileId,
        beforeFileGet: beforeFileGet.status,
        afterFileGet: afterFileGet.status,
        beforeFolderList: beforeFolderList.status,
        afterFolderList: afterFolderList.status,
        beforeInFolder,
        afterInFolder,
        webViewLink: afterFileGet.body?.webViewLink ?? null,
        note:
          afterFolderList.status === 200 && afterInFolder
            ? 'El grantee ya podía listar la carpeta (miembro/heredado); el acceso puntual igual funciona por id/link.'
            : null,
      },
      null,
      2,
    ),
  )

  const required = checks.slice(0, 3)
  if (!required.every(([, ok]) => ok)) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
