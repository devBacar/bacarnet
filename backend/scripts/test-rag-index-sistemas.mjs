/**
 * Fase 1 — indexador RAG-lite piloto Sistemas.
 *
 *   npm run rag:index:sistemas              ***REMOVED*** dry-run (sin writes ni embeddings)
 *   npm run rag:index:sistemas -- --apply   ***REMOVED*** indexa + embeddings + Firestore + GCS
 *   npm run rag:index:sistemas -- --apply --no-embed  ***REMOVED*** metadata/manifest sin Vertex
 */

import { initAdmin, loadTestEnv } from './get-test-token.mjs'
import { indexPilotArea, verifyNoExcludedChunks } from '../lib/modules/rag/indexPilotArea.js'
import { getRagConfig } from '../lib/modules/rag/config.js'
import { RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID } from '../lib/modules/rag/constants.js'

loadTestEnv()
initAdmin()

const APPLY = process.argv.includes('--apply')
const NO_EMBED = process.argv.includes('--no-embed')

function formatBytes(n) {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function main() {
  const config = await getRagConfig()
  console.log('=== RAG-lite Fase 1: indexador Sistemas ===')
  console.log(`Modo: ${APPLY ? (NO_EMBED ? 'apply (sin embeddings)' : 'apply') : 'dry-run'}`)
  console.log(`Área piloto: ${config.pilot.label} (${config.pilot.governingAreaId})`)
  console.log(`Carpeta Drive: ${config.pilot.driveFolderId}`)
  console.log(`Excluidas: ${config.excludedGoverningAreaIds.join(', ')}`)
  console.log('')

  const result = await indexPilotArea({
    dryRun: !APPLY,
    embed: APPLY && !NO_EMBED,
  })

  const { stats, memoryEstimate } = result
  console.log('--- Resultado ---')
  console.log(`Subcarpetas visitadas: ${stats.foldersVisited}`)
  console.log(`Archivos vistos: ${stats.filesSeen}`)
  console.log(`Archivos indexados: ${stats.filesIndexed}`)
  console.log(`Chunks: ${stats.chunksWritten}`)
  console.log(`Omitidos RESTRINGIDO: ${stats.skippedRestricted}`)
  console.log(`Omitidos área excluida: ${stats.skippedExcludedArea}`)
  console.log(`Omitidos sin texto: ${stats.skippedNoText}`)
  console.log(`Omitidos MIME no soportado: ${stats.skippedUnsupported}`)
  console.log(`Embeddings generados: ${result.embedded ? 'sí' : 'no'}`)
  console.log(`Snapshot GCS: gs://${config.stagingBucket}/${result.snapshotPath}`)
  console.log(`Manifest GCS: gs://${config.stagingBucket}/${result.manifestPath}`)
  console.log(`Memoria consulta estimada: ~${formatBytes(memoryEstimate.queryPeakBytesEst)}`)
  console.log(
    `Margen vs 512 MiB: ${
      memoryEstimate.margin512MiB >= 0
        ? formatBytes(memoryEstimate.margin512MiB)
        : `EXCEDE ${formatBytes(-memoryEstimate.margin512MiB)}`
    }`,
  )

  if (stats.errors.length > 0) {
    console.log('')
    console.log('--- Errores parciales ---')
    for (const err of stats.errors.slice(0, 10)) {
      console.log(`${err.fileName} (${err.fileId}): ${err.reason}`)
    }
    if (stats.errors.length > 10) {
      console.log(`… y ${stats.errors.length - 10} más`)
    }
  }

  if (!APPLY) {
    console.log('')
    console.log('Dry-run OK. Para indexar: npm run rag:index:sistemas -- --apply')
    return
  }

  const verify = await verifyNoExcludedChunks(config.pilot.governingAreaId)
  line(verify.ok, '0 chunks RESTRINGIDO o área excluida en corpus', verify.violations.join('; '))

  const cumplimientoViolations = verify.violations.filter((v) =>
    v.includes(RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID),
  )
  line(
    cumplimientoViolations.length === 0,
    '0 chunks de Cumplimiento (ex UIF)',
    cumplimientoViolations.join('; '),
  )

  if (!verify.ok) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
