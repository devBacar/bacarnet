import { callVertexGemini } from './vertexGemini.js'
import {
  chunkPassesIndexedAcl,
  chunkPassesRegulatoryFilters,
  resolveChunkContent,
} from './chunkAccess.js'
import {
  findAccessibleFileByName,
  loadAccessibleInventory,
} from './accessibleDriveInventory.js'
import type { RagToolContext } from './executeRagTool.js'

const MAX_SOURCE_CHARS = 60_000

export async function summarizeDocument(
  ctx: RagToolContext,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fileName = typeof args.fileName === 'string' ? args.fileName.trim() : ''
  if (!fileName) {
    return { error: 'INVALID_ARGS', message: 'Indicá el nombre del archivo a resumir.' }
  }

  const inventory = await loadAccessibleInventory({
    drive: ctx.drive,
    config: ctx.config,
    searchSubject: ctx.searchSubject,
  })

  const matches = findAccessibleFileByName(inventory, fileName)
  if (matches.length === 0) {
    return {
      error: 'NOT_FOUND',
      message: `No encontré "${fileName}" entre los documentos visibles para tu cuenta.`,
    }
  }

  if (matches.length > 1) {
    return {
      error: 'AMBIGUOUS',
      message: `Hay varios archivos que coinciden con "${fileName}". Pedí uno más específico.`,
      matches: matches.slice(0, 8).map((file) => ({
        fileName: file.name,
        fileKind: file.fileKind,
        modifiedTime: file.modifiedTime,
      })),
    }
  }

  const file = matches[0]

  try {
    const live = await ctx.drive.files.get({
      fileId: file.id,
      supportsAllDrives: true,
      fields: 'id,trashed',
    })
    if (live.data.trashed) {
      return {
        error: 'NOT_AVAILABLE',
        message: 'Ese archivo ya no está disponible.',
      }
    }
  } catch {
    return {
      error: 'NOT_AVAILABLE',
      message: 'No tengo permiso para acceder a ese archivo en Drive.',
    }
  }

  const fileChunks = ctx.corpus.chunks
    .filter((chunk) => chunk.fileId === file.id)
    .filter((chunk) => chunkPassesRegulatoryFilters(chunk, ctx.config))
    .filter((chunk) => chunkPassesIndexedAcl(chunk, ctx.searchSubject))
    .sort((a, b) => a.chunkIndex - b.chunkIndex)

  if (fileChunks.length === 0) {
    return {
      error: 'NOT_INDEXED',
      message:
        `Encontré "${file.name}" en Drive pero todavía no tiene contenido indexado para resumir.`,
    }
  }

  let content = ''
  let truncated = false
  for (const chunk of fileChunks) {
    const piece = resolveChunkContent(chunk, ctx.corpus.contents).trim()
    if (!piece) continue
    const separator = content ? '\n\n' : ''
    if (content.length + separator.length + piece.length > MAX_SOURCE_CHARS) {
      const remaining = MAX_SOURCE_CHARS - content.length - separator.length
      if (remaining > 0) {
        content += `${separator}${piece.slice(0, remaining)}`
      }
      truncated = true
      break
    }
    content += `${separator}${piece}`
  }

  if (!content.trim()) {
    return {
      error: 'NO_TEXT',
      message: `No pude extraer texto indexado de "${file.name}" para resumir.`,
    }
  }

  const focus =
    typeof args.focus === 'string' && args.focus.trim() ? args.focus.trim() : 'Resumen general del documento'

  const generated = await callVertexGemini({
    usageMeter: ctx.usageMeter,
    systemInstruction:
      'Sos un asistente interno de Bacarsa. Resumí documentos en español de forma clara y estructurada.\n' +
      'Usá solo el contenido provisto. No inventes información.\n' +
      'No menciones IDs técnicos ni detalles internos del sistema.',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Documento: ${file.name}\n` +
              `Enfoque pedido: ${focus}\n\n` +
              `Contenido indexado (${fileChunks.length} fragmento(s)${truncated ? ', truncado por límite' : ''}):\n` +
              content,
          },
        ],
      },
    ],
    temperature: 0.2,
    maxOutputTokens: 2048,
  })

  const firstExcerpt = resolveChunkContent(fileChunks[0], ctx.corpus.contents).slice(0, 400)
  ctx.citations.push({
    fileId: file.id,
    fileName: file.name,
    webViewLink: file.webViewLink,
    chunkIndex: fileChunks[0].chunkIndex,
    excerpt: firstExcerpt,
  })

  return {
    fileName: file.name,
    fileKind: file.fileKind,
    webViewLink: file.webViewLink,
    chunkCount: fileChunks.length,
    truncated,
    focus,
    summary: generated.text.trim(),
  }
}
