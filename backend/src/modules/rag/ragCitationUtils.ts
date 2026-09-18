import type { RagCitation } from './generateRagAnswer.js'
import type { LoadedRagCorpus } from './loadRagCorpus.js'
import type { RagIndexedChunk } from './types.js'

export const SHARED_DRIVE_ACCESS_FOOTNOTE =
  '(Visible por tu acceso a la Unidad Compartida Bacarsa, no por un permiso individual en el archivo.)'

export function resolveSharedDriveAccessFootnote(
  chunk: Pick<RagIndexedChunk, 'allowedReaders' | 'fileDirectReaders'>,
  userEmail: string,
): string | undefined {
  const normalized = userEmail.trim().toLowerCase()
  const direct = chunk.fileDirectReaders
  if (!direct || direct.length === 0) return undefined
  if (!chunk.allowedReaders.includes(normalized)) return undefined
  if (direct.includes(normalized)) return undefined
  return SHARED_DRIVE_ACCESS_FOOTNOTE
}

export function findIndexedChunkForFile(
  corpus: LoadedRagCorpus,
  fileId: string,
): RagIndexedChunk | undefined {
  return corpus.chunks.find((chunk) => chunk.fileId === fileId)
}

export function pushRagCitation(
  input: {
    citations: RagCitation[]
    searchSubject: string
    corpus: LoadedRagCorpus
  },
  citation: Omit<RagCitation, 'accessFootnote'>,
  chunk?: Pick<RagIndexedChunk, 'allowedReaders' | 'fileDirectReaders' | 'fileId'> | null,
): void {
  const resolvedChunk =
    chunk ??
    findIndexedChunkForFile(input.corpus, citation.fileId) ??
    null
  const accessFootnote = resolvedChunk
    ? resolveSharedDriveAccessFootnote(resolvedChunk, input.searchSubject)
    : undefined

  input.citations.push({
    ...citation,
    ...(accessFootnote ? { accessFootnote } : {}),
  })
}
