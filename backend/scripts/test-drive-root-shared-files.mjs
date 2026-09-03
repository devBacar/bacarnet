/**
 * Lista raíz bacarsa como grantee y busca archivos de acceso directo.
 *
 *   FUNCTIONS_API_BASE=https://intranet-bacar.web.app node backend/scripts/test-drive-root-shared-files.mjs
 */

import { getTestIdToken } from './get-test-token.mjs'

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://intranet-bacar.web.app'
const GRANTEE_EMAIL =
  process.env.TEST_GRANTEE_EMAIL?.trim().toLowerCase() || 'implementaciones.it@bacarsa.com.ar'

async function main() {
  process.env.TEST_EMAIL = GRANTEE_EMAIL
  const grantee = await getTestIdToken({ requireSuperAdmin: false })

  const res = await fetch(`${base}/api/drive/files?folderId=root`, {
    headers: { Authorization: `Bearer ${grantee.idToken}` },
  })
  const body = await res.json().catch(() => ({}))
  const files = body.files ?? []
  const direct = files.filter((row) => row.directAccess)
  const folders = files.filter((row) => row.isFolder)

  console.log(`HTTP ${res.status} — ${files.length} items (${folders.length} carpetas, ${direct.length} acceso directo)`)
  for (const row of direct) {
    console.log(`  DIRECT  ${row.name}  (${row.id})`)
  }
  for (const row of folders) {
    console.log(`  FOLDER  ${row.name}`)
  }

  if (res.status !== 200) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
