/**
 * Prueba vista previa Office staging: docx + xlsx en GCS, URL firmada y embed Microsoft.
 *
 *   node backend/scripts/test-office-staging-preview.mjs
 *   node backend/scripts/test-office-staging-preview.mjs --api   ***REMOVED*** también GET staging-preview en prod
 */

import { FieldValue } from 'firebase-admin/firestore'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { minimalDocxBuffer } from './minimal-docx.mjs'
import { minimalXlsxBuffer } from './minimal-xlsx.mjs'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const useApi = process.argv.includes('--api')
const API = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

function officeEmbedUrl(previewUrl) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`
}

async function probeSignedUrl(label, previewUrl, expectedMime) {
  const results = []
  const res = await fetch(previewUrl, { redirect: 'follow' })
  results.push(line(res.ok, `${label} signed URL HTTP ${res.status}`, res.statusText))

  const contentType = res.headers.get('content-type') ?? ''
  results.push(
    line(
      contentType.includes(expectedMime.split('/')[1]?.split('.')[0] ?? '') ||
        contentType.includes('openxmlformats') ||
        contentType.includes('spreadsheet') ||
        contentType.includes('wordprocessing') ||
        contentType.includes('octet-stream'),
      `${label} Content-Type`,
      contentType || '(vacío)',
    ),
  )

  const buf = Buffer.from(await res.arrayBuffer())
  results.push(line(buf.length > 100, `${label} cuerpo descargable`, `${buf.length} bytes`))
  results.push(line(buf[0] === 0x50 && buf[1] === 0x4b, `${label} magic PK (Office zip)`, ''))

  const embed = officeEmbedUrl(previewUrl)
  const embedRes = await fetch(embed, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; intranet-preview-test/1.0)' },
  })
  const embedHtml = await embedRes.text()
  const embedOk =
    embedRes.ok &&
    !/errorpage|can't open|cannot open|File not found|Access denied|Invalid/i.test(embedHtml) &&
    (/iframe|WACFrame|officeapps|embed/i.test(embedHtml) || embedHtml.length > 500)
  results.push(
    line(embedOk, `${label} embed shell Microsoft`, embedRes.status + ` (${embedHtml.length} chars)`),
  )

  return { results, embedUrl: embed, allOk: results.every(Boolean) }
}

async function createPendingRequest(db, mods, { fileName, mimeType, buffer }) {
  const { uploadPendingFile, stagingObjectPath } = await import(
    pathToFileURL(resolve(ROOT, 'backend/lib/lib/google/pendingUploadsStorage.js')).href
  )

  const requestRef = db.collection('approvalRequests').doc()
  const requestId = requestRef.id
  const objectPath = stagingObjectPath(requestId, fileName)
  await uploadPendingFile(requestId, fileName, mimeType, buffer)

  await requestRef.set({
    kind: 'office_upload_request',
    status: 'pending',
    requesterUid: mods.requesterUid,
    requesterEmail: mods.requesterEmail,
    requesterDisplayName: mods.requesterDisplayName,
    fileName,
    mimeType,
    stagingObjectPath: objectPath,
    parentFolderId: mods.parentFolderId,
    parentFolderName: mods.parentFolderName,
    classification: 'USO_INTERNO',
    reason: mods.reason,
    governingAreaId: mods.governingAreaId,
    governingAreaName: mods.governingAreaName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return requestId
}

async function main() {
  const db = getAdminDb()
  const { createSignedStagingPreviewUrl } = await import(
    pathToFileURL(resolve(ROOT, 'backend/lib/lib/google/pendingUploadsStorage.js')).href
  )
  const { buildStagingContentUrl } = await import(
    pathToFileURL(resolve(ROOT, 'backend/lib/modules/approvalRequests/stagingPreviewToken.js')).href
  )

  const publicBase = API.replace(/\/+$/, '')

  if (process.env.OFFICE_TEST_REQUESTER_EMAIL?.trim()) {
    process.env.TEST_EMAIL = process.env.OFFICE_TEST_REQUESTER_EMAIL.trim()
  } else {
    delete process.env.TEST_EMAIL
    delete process.env.TEST_UID
  }
  const requester = await getTestIdToken({ requireSuperAdmin: false })

  process.env.TEST_EMAIL = process.env.OFFICE_TEST_APPROVER_EMAIL?.trim() || 'admin@bacarsa.com.ar'
  delete process.env.TEST_UID
  const approver = await getTestIdToken()

  const parentFolderId =
    process.env.OFFICE_TEST_DRIVE_FOLDER?.trim() || '1NeotsCiPgZaaL1NNTbjHGilltY-IIwq7'
  const ts = Date.now()

  const samples = [
    {
      label: 'DOCX',
      fileName: `preview-test-${ts}.docx`,
      mimeType: DOCX_MIME,
      buffer: minimalDocxBuffer(),
    },
    {
      label: 'XLSX',
      fileName: `preview-test-${ts}.xlsx`,
      mimeType: XLSX_MIME,
      buffer: minimalXlsxBuffer(),
    },
  ]

  console.log(`Bucket staging + signed URL + Microsoft embed`)
  console.log(`Solicitante: ${requester.email}`)
  console.log(`Aprobador (preview auth): ${approver.email}\n`)

  const created = []
  const allResults = []

  for (const sample of samples) {
    console.log(`=== ${sample.label} ===`)
    const requestId = await createPendingRequest(db, {
      requesterUid: requester.uid,
      requesterEmail: requester.email,
      requesterDisplayName: requester.email,
      parentFolderId,
      parentFolderName: 'Operaciones',
      governingAreaId: 'a36R9jwN4m47Ftn3wGCp',
      governingAreaName: 'Operaciones',
      reason: `Prueba vista previa staging ${sample.label}`,
    }, sample)
    created.push({ requestId, sample })

    const snap = await db.collection('approvalRequests').doc(requestId).get()
    const stagingObjectPath = snap.get('stagingObjectPath')
    const previewUrl = buildStagingContentUrl(requestId, publicBase)
    console.log(`requestId=${requestId}`)
    console.log(`previewUrl=${previewUrl.slice(0, 140)}…`)

    if (useApi) {
      const apiRes = await fetch(
        `${API}/api/approval-requests/${encodeURIComponent(requestId)}/staging-preview`,
        { headers: { Authorization: `Bearer ${approver.idToken}` } },
      )
      const apiBody = await apiRes.json().catch(() => ({}))
      allResults.push(
        line(
          apiRes.status === 200 && typeof apiBody.previewUrl === 'string',
          `${sample.label} GET staging-preview API`,
          String(apiRes.status),
        ),
      )
      if (apiBody.previewUrl) {
        const apiProbe = await probeSignedUrl(`${sample.label} API`, apiBody.previewUrl, sample.mimeType)
        allResults.push(...apiProbe.results)
      }
    }

    const directProbe = await fetch(previewUrl)
    allResults.push(
      line(directProbe.ok, `${sample.label} proxy content HTTP`, String(directProbe.status)),
    )

    const probe = await probeSignedUrl(sample.label, previewUrl, sample.mimeType)
    allResults.push(...probe.results)
    console.log(`embed=${probe.embedUrl.slice(0, 100)}…\n`)

    if (useApi) continue
  }

  const passed = allResults.filter(Boolean).length
  console.log(`\n${passed}/${allResults.length} checks OK`)
  console.log('\nURLs para verificación visual en navegador (proxy):')
  for (const row of created) {
    const previewUrl = buildStagingContentUrl(row.requestId, publicBase)
    console.log(`${row.sample.label}: ${officeEmbedUrl(previewUrl)}`)
  }

  if (passed !== allResults.length) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
