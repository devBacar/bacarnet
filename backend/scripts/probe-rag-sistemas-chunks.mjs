/**
 * Estima chunks indexables bajo la carpeta Sistemas (piloto RAG-lite).
 *
 *   node backend/scripts/probe-rag-sistemas-chunks.mjs
 */

import { getDrive } from '../lib/lib/google/driveClient.js'
import { initAdmin, loadTestEnv, getAdminDb } from './get-test-token.mjs'

const SISTEMAS_FOLDER_ID = '188-zgNhMIfeUjAI8GracINlItBbFwoUb'
const SISTEMAS_GOVERNING_AREA_ID = 'r7QVKsrSiqDWC8DrXCac'
const EXCLUDED_GOVERNING_AREA_IDS = new Set(['OWWnpfsRRx0XQ6FCqlOa'])

/** ~512 tokens, ~2048 chars; overlap ~50 tokens (~200 chars) */
const CHUNK_CHARS = 2048
const CHUNK_OVERLAP_CHARS = 200
const CHUNK_STRIDE = CHUNK_CHARS - CHUNK_OVERLAP_CHARS
const MAX_TEXT_BYTES_PER_FILE = 1_048_576 // límite indexación Drive
const EMBEDDING_DIMS = 768
const BYTES_PER_FLOAT32 = 4

const GOOGLE_APPS = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.form',
  'application/vnd.google-apps.drawing',
])

const INDEXABLE_MIME_PREFIXES = [
  'application/pdf',
  'application/vnd.openxmlformats',
  'application/msword',
  'application/vnd.ms-',
  'text/',
  'application/json',
  'application/rtf',
]

const SKIP_MIME = new Set([
  'application/vnd.google-apps.folder',
  'application/vnd.google-apps.shortcut',
  'application/vnd.google-apps.map',
  'application/vnd.google-apps.site',
])

function estimateExtractableTextBytes(mimeType, sizeBytes) {
  const size = Number(sizeBytes) || 0
  if (size <= 0) return 0

  if (GOOGLE_APPS.has(mimeType)) {
    // Export textual suele ser mucho menor que el binario nativo; heurística conservadora.
    const factor = mimeType.includes('spreadsheet') ? 0.08 : 0.15
    return Math.min(MAX_TEXT_BYTES_PER_FILE, Math.round(size * factor))
  }

  if (mimeType.startsWith('text/')) {
    return Math.min(MAX_TEXT_BYTES_PER_FILE, size)
  }

  if (mimeType === 'application/pdf') {
    return Math.min(MAX_TEXT_BYTES_PER_FILE, Math.round(size * 0.25))
  }

  if (
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('msword') ||
    mimeType.includes('rtf')
  ) {
    return Math.min(MAX_TEXT_BYTES_PER_FILE, Math.round(size * 0.35))
  }

  if (mimeType.includes('spreadsheetml') || mimeType.includes('ms-excel')) {
    return Math.min(MAX_TEXT_BYTES_PER_FILE, Math.round(size * 0.12))
  }

  if (mimeType.includes('presentationml') || mimeType.includes('ms-powerpoint')) {
    return Math.min(MAX_TEXT_BYTES_PER_FILE, Math.round(size * 0.1))
  }

  if (INDEXABLE_MIME_PREFIXES.some((p) => mimeType.startsWith(p) || mimeType.includes(p))) {
    return Math.min(MAX_TEXT_BYTES_PER_FILE, Math.round(size * 0.2))
  }

  return 0
}

function chunksFromTextBytes(textBytes) {
  if (textBytes <= 0) return 0
  if (textBytes <= CHUNK_CHARS) return 1
  return 1 + Math.ceil((textBytes - CHUNK_CHARS) / CHUNK_STRIDE)
}

function formatBytes(n) {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

async function listChildren(drive, folderId) {
  const files = []
  let pageToken
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 200,
      pageToken,
    })
    files.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return files
}

async function walkFolder(drive, rootId) {
  const allFiles = []
  const queue = [rootId]
  let foldersVisited = 0

  while (queue.length > 0) {
    const folderId = queue.shift()
    foldersVisited += 1
    const children = await listChildren(drive, folderId)
    for (const item of children) {
      const mime = item.mimeType ?? ''
      if (mime === 'application/vnd.google-apps.folder') {
        queue.push(item.id)
        continue
      }
      allFiles.push(item)
    }
  }

  return { allFiles, foldersVisited }
}

async function loadRestrictedFileIds(db) {
  const restricted = new Set()
  const snap = await db.collection('driveFiles').where('classification', '==', 'RESTRINGIDO').get()
  for (const doc of snap.docs) {
    restricted.add(doc.id)
  }
  return restricted
}

loadTestEnv()
initAdmin()

const drive = await getDrive()
const db = getAdminDb()

console.log('=== Probe RAG-lite: carpeta Sistemas ===')
console.log(`folderId: ${SISTEMAS_FOLDER_ID}`)
console.log(`governingAreaId: ${SISTEMAS_GOVERNING_AREA_ID}`)
console.log('')

const { allFiles, foldersVisited } = await walkFolder(drive, SISTEMAS_FOLDER_ID)
const restrictedIds = await loadRestrictedFileIds(db)

let totalBinaryBytes = 0
let totalTextBytes = 0
let totalChunks = 0
let indexableFiles = 0
let skippedRestricted = 0
let skippedNoText = 0

const byMime = new Map()

for (const file of allFiles) {
  const mime = file.mimeType ?? 'unknown'
  const size = Number(file.size) || 0
  totalBinaryBytes += size

  if (SKIP_MIME.has(mime)) continue
  if (restrictedIds.has(file.id)) {
    skippedRestricted += 1
    continue
  }

  const textBytes = estimateExtractableTextBytes(mime, size)
  if (textBytes <= 0) {
    skippedNoText += 1
    continue
  }

  const chunks = chunksFromTextBytes(textBytes)
  indexableFiles += 1
  totalTextBytes += textBytes
  totalChunks += chunks

  const row = byMime.get(mime) ?? { files: 0, binaryBytes: 0, textBytes: 0, chunks: 0 }
  row.files += 1
  row.binaryBytes += size
  row.textBytes += textBytes
  row.chunks += chunks
  byMime.set(mime, row)
}

const embeddingBytes = totalChunks * EMBEDDING_DIMS * BYTES_PER_FLOAT32
const manifestBytesEst = totalChunks * 600 // fileId, title, acl, offsets
const snapshotBytesEst = embeddingBytes + manifestBytesEst
const queryMemoryEst = snapshotBytesEst + 64 * 1024 * 1024 // + ~64 MiB runtime JS/GC

const mem512Margin = 512 * 1024 * 1024 - queryMemoryEst
const mem256Margin = 256 * 1024 * 1024 - queryMemoryEst

console.log('--- Inventario ---')
console.log(`Subcarpetas visitadas (incl. raíz): ${foldersVisited}`)
console.log(`Archivos totales (sin carpetas): ${allFiles.length}`)
console.log(`Archivos indexables estimados: ${indexableFiles}`)
console.log(`Omitidos RESTRINGIDO (Firestore): ${skippedRestricted}`)
console.log(`Omitidos sin texto estimable: ${skippedNoText}`)
console.log(`Tamaño binario total: ${formatBytes(totalBinaryBytes)}`)
console.log('')

console.log('--- Estimación de indexación ---')
console.log(`Texto extraíble estimado: ${formatBytes(totalTextBytes)}`)
console.log(`Chunks estimados (512 tok, overlap 50): ${totalChunks.toLocaleString('es-AR')}`)
console.log(`Embedding dims: ${EMBEDDING_DIMS} float32`)
console.log(`Solo vectores: ${formatBytes(embeddingBytes)}`)
console.log(`Snapshot GCS (vectores + manifest): ~${formatBytes(snapshotBytesEst)}`)
console.log('')

console.log('--- Memoria en consulta (estimada) ---')
console.log(`Uso pico aprox: ~${formatBytes(queryMemoryEst)}`)
console.log(`Margen vs 512 MiB: ${mem512Margin >= 0 ? formatBytes(mem512Margin) : `EXCEDE ${formatBytes(-mem512Margin)}`}`)
console.log(`Margen vs 256 MiB: ${mem256Margin >= 0 ? formatBytes(mem256Margin) : `EXCEDE ${formatBytes(-mem256Margin)}`}`)
console.log('')

console.log('--- Top MIME types indexables ---')
const sorted = [...byMime.entries()].sort((a, b) => b[1].chunks - a[1].chunks)
for (const [mime, row] of sorted.slice(0, 12)) {
  console.log(
    `${mime}\n  files=${row.files} binary=${formatBytes(row.binaryBytes)} text≈${formatBytes(row.textBytes)} chunks=${row.chunks}`,
  )
}

console.log('')
console.log('--- Config RAG-lite piloto ---')
console.log(`Áreas excluidas regulatorias (plan): ${[...EXCLUDED_GOVERNING_AREA_IDS].join(', ')}`)
console.log('Nota: este probe solo recorre Sistemas; Cumplimiento queda fuera por scope.')
