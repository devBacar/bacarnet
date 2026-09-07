/**
 * Verifica que tras crear un archivo el listado lo incluye de inmediato (sin depender del TTL).
 *
 *   FUNCTIONS_API_BASE=https://bacarnet.web.app node backend/scripts/test-drive-cache-invalidation.mjs
 */

import { getTestIdToken } from './get-test-token.mjs'

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const SISTEMAS_DRIVE = '188-zgNhMIfeUjAI8GracINlItBbFwoUb'

async function main() {
  process.env.TEST_EMAIL = process.env.TEST_EMAIL || 'implementaciones.it@bacarsa.com.ar'
  const user = await getTestIdToken({ requireSuperAdmin: false })
  const name = `Cache invalidation ${Date.now()}`

  const listBefore = await fetch(`${base}/api/drive/files?folderId=${SISTEMAS_DRIVE}`, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  })
  const beforeBody = await listBefore.json().catch(() => ({}))
  const beforeCount = beforeBody.files?.length ?? 0

  const created = await fetch(`${base}/api/drive/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      type: 'google_doc',
      parentFolderId: SISTEMAS_DRIVE,
      classification: 'USO_INTERNO',
      reason: 'Prueba de invalidación de caché fase 1',
    }),
  })
  const createBody = await created.json().catch(() => ({}))
  const id = createBody.id

  const listAfter = await fetch(`${base}/api/drive/files?folderId=${SISTEMAS_DRIVE}`, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  })
  const afterBody = await listAfter.json().catch(() => ({}))
  const found = afterBody.files?.find((file) => file.id === id)
  const afterCount = afterBody.files?.length ?? 0

  if (id) {
    await fetch(`${base}/api/drive/files/${id}/trash`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Limpieza tras prueba de caché' }),
    })
  }

  const checks = [
    ['usuario no super_admin', user.role !== 'super_admin'],
    ['create 201', created.status === 201],
    ['listado inmediato incluye archivo', Boolean(found && found.name === name)],
    ['conteo aumentó', afterCount >= beforeCount + 1],
  ]

  for (const [label, ok] of checks) {
    console.log(ok ? 'OK' : 'FAIL', label)
  }

  console.log(
    JSON.stringify(
      {
        user: user.email,
        role: user.role,
        id,
        beforeCount,
        afterCount,
        listedImmediately: Boolean(found),
      },
      null,
      2,
    ),
  )

  if (!checks.every(([, ok]) => ok)) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
