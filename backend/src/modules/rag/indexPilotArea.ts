import { FieldValue } from 'firebase-admin/firestore'
import type { drive_v3 } from 'googleapis'
import { adminDb } from '../../lib/firebase/admin.js'
import { uploadRagObject } from '../../lib/google/ragStagingStorage.js'
import { getDrive } from '../../lib/google/driveClient.js'
import { logError } from '../../lib/log.js'
import {
  getStoredClassification,
  type FileClassification,
} from '../drive/classification.js'
import { resolveFileGoverningAreaId } from '../drive/governDriveFile.js'
import { collectDriveFileAcl } from './collectReaders.js'
import { buildRagManifest, makeChunkId } from './buildSnapshot.js'
import { chunkText, textPreview } from './chunkText.js'
import {
  RAG_CHUNKS_COLLECTION,
  RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID,
  RAG_INDEX_STATE_COLLECTION,
} from './constants.js'
import {
  getRagConfig,
  ragManifestObjectPath,
  ragSnapshotObjectPath,
  ragChunksContentObjectPath,
} from './config.js'
import { canExtractDriveText, extractDriveText } from './extractDriveText.js'
import { embedTexts, encodeEmbeddingsSnapshot } from './embeddings.js'
import { estimateRagMemoryUsage } from './memoryEstimate.js'
import { isExcludedGoverningArea } from './regulatoryArea.js'
import type { RagIndexResult, RagIndexStats, RagIndexedChunk } from './types.js'
import { walkDriveFolder, type DriveWalkFile } from './walkDriveFolder.js'

export type IndexPilotAreaOptions = {
  dryRun?: boolean
  embed?: boolean
}

type DraftChunk = RagIndexedChunk & { content: string }

function emptyStats(): RagIndexStats {
  return {
    foldersVisited: 0,
    filesSeen: 0,
    filesIndexed: 0,
    chunksWritten: 0,
    skippedRestricted: 0,
    skippedExcludedArea: 0,
    skippedNoText: 0,
    skippedUnsupported: 0,
    errors: [],
  }
}

async function purgeExistingChunks(governingAreaId: string): Promise<number> {
  const db = adminDb()
  let deleted = 0
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined

  while (true) {
    let query = db
      .collection(RAG_CHUNKS_COLLECTION)
      .where('governingAreaId', '==', governingAreaId)
      .limit(400)

    if (lastDoc) {
      query = query.startAfter(lastDoc)
    }

    const snap = await query.get()
    if (snap.empty) break

    const batch = db.batch()
    for (const doc of snap.docs) {
      batch.delete(doc.ref)
    }
    await batch.commit()
    deleted += snap.size
    lastDoc = snap.docs[snap.docs.length - 1]
  }

  return deleted
}

async function processFile(
  drive: drive_v3.Drive,
  file: DriveWalkFile,
  input: {
    pilotGoverningAreaId: string
    excludedAreaIds: Set<string>
    chunkChars: number
    chunkOverlapChars: number
    stats: RagIndexStats
  },
): Promise<DraftChunk[]> {
  const classification: FileClassification = await getStoredClassification(file.id)
  if (classification === 'RESTRINGIDO') {
    input.stats.skippedRestricted += 1
    return []
  }

  const governingAreaId = await resolveFileGoverningAreaId(file.id, file.parentFolderId)
  if (
    isExcludedGoverningArea(governingAreaId, {
      excludedGoverningAreaIds: [...input.excludedAreaIds],
    })
  ) {
    input.stats.skippedExcludedArea += 1
    return []
  }

  if (!canExtractDriveText(file.mimeType)) {
    input.stats.skippedUnsupported += 1
    return []
  }

  const extracted = await extractDriveText(drive, file.id, file.mimeType)
  if (!extracted.ok) {
    input.stats.skippedNoText += 1
    if (extracted.reason !== 'Sin texto extraíble' && extracted.reason !== 'Archivo vacío') {
      input.stats.errors.push({
        fileId: file.id,
        fileName: file.name,
        reason: extracted.reason,
      })
    }
    return []
  }

  const parts = chunkText(extracted.text, input.chunkChars, input.chunkOverlapChars)
  if (parts.length === 0) {
    input.stats.skippedNoText += 1
    return []
  }

  const acl = await collectDriveFileAcl(drive, file.id)
  const resolvedAreaId = governingAreaId ?? input.pilotGoverningAreaId

  return parts.map((part) => ({
    id: makeChunkId(file.id, part.chunkIndex),
    fileId: file.id,
    fileName: file.name,
    webViewLink: file.webViewLink,
    mimeType: file.mimeType,
    classification,
    governingAreaId: resolvedAreaId,
    allowedReaders: acl.allowedReaders,
    domainAccess: acl.domainAccess,
    chunkIndex: part.chunkIndex,
    charStart: part.charStart,
    charEnd: part.charEnd,
    textPreview: textPreview(part.content),
    embeddingIndex: -1,
    content: part.content,
  }))
}

export async function indexPilotArea(
  options: IndexPilotAreaOptions = {},
): Promise<RagIndexResult> {
  const dryRun = options.dryRun === true
  const embed = options.embed !== false
  const config = await getRagConfig()
  const stats = emptyStats()
  const excludedAreaIds = new Set(config.excludedGoverningAreaIds)

  if (isExcludedGoverningArea(config.pilot.governingAreaId, config)) {
    throw new Error(
      `El área piloto (${config.pilot.label}) está en excludedGoverningAreaIds`,
    )
  }

  const drive = await getDrive()
  const { files, foldersVisited } = await walkDriveFolder(drive, config.pilot.driveFolderId)
  stats.foldersVisited = foldersVisited
  stats.filesSeen = files.length

  const draftChunks: DraftChunk[] = []

  for (const file of files) {
    try {
      const fileChunks = await processFile(drive, file, {
        pilotGoverningAreaId: config.pilot.governingAreaId,
        excludedAreaIds,
        chunkChars: config.chunkChars,
        chunkOverlapChars: config.chunkOverlapChars,
        stats,
      })
      draftChunks.push(...fileChunks)
    } catch (err) {
      logError(`RAG index file ${file.id} falló`, err)
      stats.errors.push({
        fileId: file.id,
        fileName: file.name,
        reason: err instanceof Error ? err.message : 'Error desconocido',
      })
    }
  }

  stats.filesIndexed = new Set(draftChunks.map((chunk) => chunk.fileId)).size
  stats.chunksWritten = draftChunks.length

  const manifestPath = ragManifestObjectPath(config.pilot.governingAreaId)
  const snapshotPath = ragSnapshotObjectPath(config.pilot.governingAreaId)
  const contentsPath = ragChunksContentObjectPath(config.pilot.governingAreaId)
  const memoryEstimate = estimateRagMemoryUsage({
    chunkCount: draftChunks.length,
    embeddingDims: config.embeddingDims,
  })

  if (dryRun) {
    return {
      governingAreaId: config.pilot.governingAreaId,
      dryRun: true,
      embedded: false,
      stats,
      memoryEstimate,
      manifestPath,
      snapshotPath,
    }
  }

  let vectors: number[][] = []
  if (embed && draftChunks.length > 0) {
    vectors = await embedTexts(draftChunks.map((chunk) => chunk.content))
    if (vectors.length > 0 && vectors[0].length !== config.embeddingDims) {
      throw new Error(
        `Vertex devolvió dims=${vectors[0].length}, config=${config.embeddingDims}`,
      )
    }
  }

  const indexedChunks: RagIndexedChunk[] = draftChunks.map((chunk, index) => {
    const { content: _content, ...rest } = chunk
    return {
      ...rest,
      embeddingIndex: embed ? index : -1,
    }
  })

  const manifest = buildRagManifest({
    governingAreaId: config.pilot.governingAreaId,
    pilotLabel: config.pilot.label,
    chunkChars: config.chunkChars,
    chunkOverlapChars: config.chunkOverlapChars,
    embeddingDims: config.embeddingDims,
    chunks: indexedChunks,
  })

  if (embed && vectors.length > 0) {
    const snapshot = encodeEmbeddingsSnapshot(vectors, config.embeddingDims)
    await uploadRagObject(snapshotPath, snapshot, 'application/octet-stream')
  }

  const contentsPayload = draftChunks.map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
  }))
  await uploadRagObject(
    contentsPath,
    JSON.stringify(contentsPayload),
    'application/json',
  )

  await uploadRagObject(manifestPath, JSON.stringify(manifest), 'application/json')

  const deleted = await purgeExistingChunks(config.pilot.governingAreaId)
  if (deleted > 0) {
    console.info(`RAG index: purgados ${deleted} chunks previos`)
  }

  const db = adminDb()
  const now = FieldValue.serverTimestamp()
  const batchSize = 400

  for (let offset = 0; offset < indexedChunks.length; offset += batchSize) {
    const batch = db.batch()
    const slice = indexedChunks.slice(offset, offset + batchSize)

    for (const chunk of slice) {
      const ref = db.collection(RAG_CHUNKS_COLLECTION).doc(chunk.id)
      batch.set(ref, {
        ...chunk,
        pilotLabel: config.pilot.label,
        indexedAt: now,
        embeddingModel: embed ? manifest.embeddingModel : null,
        manifestPath,
        snapshotPath,
      })
    }

    await batch.commit()
  }

  await db.collection(RAG_INDEX_STATE_COLLECTION).doc(config.pilot.governingAreaId).set(
    {
      governingAreaId: config.pilot.governingAreaId,
      pilotLabel: config.pilot.label,
      driveFolderId: config.pilot.driveFolderId,
      lastIndexedAt: now,
      chunkCount: indexedChunks.length,
      fileCount: stats.filesIndexed,
      manifestPath,
      snapshotPath,
      embeddingModel: embed ? manifest.embeddingModel : null,
      status: 'ready',
      stats,
      excludedGoverningAreaIds: config.excludedGoverningAreaIds,
    },
    { merge: true },
  )

  return {
    governingAreaId: config.pilot.governingAreaId,
    dryRun: false,
    embedded: embed && vectors.length > 0,
    stats,
    memoryEstimate,
    manifestPath,
    snapshotPath,
  }
}

export async function verifyNoExcludedChunks(
  governingAreaId: string,
): Promise<{ ok: boolean; violations: string[] }> {
  const config = await getRagConfig()
  const excluded = new Set(config.excludedGoverningAreaIds)
  excluded.add(RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID)

  const snap = await adminDb()
    .collection(RAG_CHUNKS_COLLECTION)
    .where('governingAreaId', '==', governingAreaId)
    .get()

  const violations: string[] = []
  for (const doc of snap.docs) {
    const areaId = doc.get('governingAreaId')
    const classification = doc.get('classification')
    if (typeof areaId === 'string' && excluded.has(areaId)) {
      violations.push(`${doc.id}: área excluida ${areaId}`)
    }
    if (classification === 'RESTRINGIDO') {
      violations.push(`${doc.id}: RESTRINGIDO`)
    }
  }

  return { ok: violations.length === 0, violations }
}
