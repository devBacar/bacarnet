import type { Request } from 'express'
import Busboy from 'busboy'
import { MULTIPART_UPLOAD_MAX_BYTES } from './uploadLimits.js'

export { MULTIPART_UPLOAD_MAX_BYTES as MAX_UPLOAD_BYTES }

export type ParsedMultipartUpload = {
  fields: Record<string, string>
  file: {
    originalname: string
    mimetype: string
    size: number
    buffer: Buffer
  } | null
}

export async function parseMultipartUpload(req: Request): Promise<ParsedMultipartUpload> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    let file: ParsedMultipartUpload['file'] = null
    let tooLarge = false
    let parser: ReturnType<typeof Busboy>

    try {
      parser = Busboy({
        headers: req.headers,
        limits: { fileSize: MULTIPART_UPLOAD_MAX_BYTES, files: 1, fields: 10 },
      })
    } catch (err) {
      reject(err)
      return
    }

    parser.on('field', (name, value) => {
      fields[name] = value
    })
    parser.on('file', (_fieldName, stream, info) => {
      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        size += chunk.length
      })
      stream.on('limit', () => {
        tooLarge = true
      })
      stream.on('end', () => {
        file = {
          originalname: info.filename,
          mimetype: info.mimeType,
          size,
          buffer: Buffer.concat(chunks),
        }
      })
    })
    parser.on('error', reject)
    parser.on('finish', () => {
      if (tooLarge) {
        reject(new Error('UPLOAD_TOO_LARGE'))
        return
      }
      resolve({ fields, file })
    })

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody
    if (rawBody && rawBody.length > 0) {
      parser.end(rawBody)
    } else if (req.readable) {
      req.pipe(parser)
    } else {
      reject(new Error('UPLOAD_BODY_UNAVAILABLE'))
    }
  })
}
