import { extname } from 'node:path'
import type { Request } from 'express'
import Busboy from 'busboy'

/**
 * ST acepta 50 MB, pero BacarNet limita a 25 MB para dejar margen bajo el
 * límite del request HTTP de Cloud Functions 2nd gen.
 */
export const ST_MAX_FILE_BYTES = 25 * 1024 * 1024

const ALLOWED_EXTENSIONS = new Set([
  '.jpeg', '.jpg', '.png', '.gif', '.webp', '.heic', '.heif', '.avif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp4', '.mov', '.avi', '.wmv', '.mkv',
])

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/avif',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/x-ms-wmv',
])

export interface StUploadFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

export function validateStUploadFile(file: StUploadFile): void {
  if (file.size > ST_MAX_FILE_BYTES) {
    throw new Error(`El archivo "${file.originalname}" supera el límite de 25 MB`)
  }
  const extensionAllowed = ALLOWED_EXTENSIONS.has(extname(file.originalname).toLowerCase())
  const genericMime = !file.mimetype || file.mimetype === 'application/octet-stream'
  if (!extensionAllowed || (!genericMime && !ALLOWED_MIME_TYPES.has(file.mimetype))) {
    throw new Error(`El archivo "${file.originalname}" no tiene un formato permitido`)
  }
}

export async function parseStMultipart(req: Request): Promise<{
  fields: Record<string, string>
  files: StUploadFile[]
}> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    const files: StUploadFile[] = []
    let failed: Error | null = null
    let parser: ReturnType<typeof Busboy>

    try {
      parser = Busboy({
        headers: req.headers,
        limits: { fileSize: ST_MAX_FILE_BYTES, fields: 20 },
      })
    } catch (err) {
      reject(err)
      return
    }

    parser.on('field', (name, value) => {
      fields[name] = value
    })
    parser.on('file', (_name, stream, info) => {
      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        size += chunk.length
      })
      stream.on('limit', () => {
        failed = new Error(`El archivo "${info.filename}" supera el límite de 25 MB`)
      })
      stream.on('end', () => {
        if (failed) return
        try {
          const file = {
            originalname: info.filename,
            mimetype: info.mimeType,
            size,
            buffer: Buffer.concat(chunks),
          }
          validateStUploadFile(file)
          files.push(file)
        } catch (err) {
          failed = err instanceof Error ? err : new Error(String(err))
        }
      })
    })
    parser.on('error', reject)
    parser.on('finish', () => {
      if (failed) reject(failed)
      else resolve({ fields, files })
    })

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody
    if (rawBody?.length) parser.end(rawBody)
    else if (req.readable) req.pipe(parser)
    else reject(new Error('No se pudo leer la carga multipart'))
  })
}
