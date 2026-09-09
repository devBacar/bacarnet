/**
 * Desglose real de extracción RAG en carpeta Sistemas.
 */
import { getDrive } from '../lib/lib/google/driveClient.js'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'
import { walkDriveFolder } from '../lib/modules/rag/walkDriveFolder.js'
import { canExtractDriveText, extractDriveText } from '../lib/modules/rag/extractDriveText.js'
import { getRagConfig } from '../lib/modules/rag/config.js'

loadTestEnv()
initAdmin()

const config = await getRagConfig()
const drive = await getDrive()
const { files } = await walkDriveFolder(drive, config.pilot.driveFolderId)

const unsupported = new Map()
const failed = new Map()
let ok = 0

for (const file of files) {
  if (!canExtractDriveText(file.mimeType)) {
    const row = unsupported.get(file.mimeType) ?? { count: 0, names: [] }
    row.count += 1
    if (row.names.length < 3) row.names.push(file.name)
    unsupported.set(file.mimeType, row)
    continue
  }

  const extracted = await extractDriveText(drive, file.id, file.mimeType)
  if (!extracted.ok) {
    const row = failed.get(file.mimeType) ?? { count: 0, reasons: new Map() }
    row.count += 1
    row.reasons.set(extracted.reason, (row.reasons.get(extracted.reason) ?? 0) + 1)
    failed.set(file.mimeType, row)
    continue
  }

  ok += 1
}

console.log('=== Desglose extracción Sistemas ===')
console.log(`Total archivos: ${files.length}`)
console.log(`Extraídos OK: ${ok}`)
console.log('')
console.log('--- MIME no soportados ---')
for (const [mime, row] of [...unsupported.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`${mime}: ${row.count} (ej. ${row.names.join(' · ')})`)
}
console.log('')
console.log('--- Extracción fallida (MIME soportado) ---')
for (const [mime, row] of failed.entries()) {
  const reasons = [...row.reasons.entries()].map(([r, n]) => `${r} (${n})`).join('; ')
  console.log(`${mime}: ${row.count} → ${reasons}`)
}
