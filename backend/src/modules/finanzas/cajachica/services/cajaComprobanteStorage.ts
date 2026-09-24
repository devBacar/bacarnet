import { randomUUID } from 'node:crypto'
import { pendingUploadsBucket } from '../../../../lib/google/pendingUploadsStorage.js'

export function cajaComprobanteObjectPath(cajaId: string, fileName: string): string {
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.jpg'
  const safeExt = ext.replace(/[^\w.]/g, '').slice(0, 8) || '.jpg'
  return `finanzas-caja-chica/${cajaId}/${randomUUID()}${safeExt}`
}

export async function saveCajaComprobante(
  cajaId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const objectPath = cajaComprobanteObjectPath(cajaId, fileName)
  const file = pendingUploadsBucket().file(objectPath)
  await file.save(buffer, {
    contentType: mimeType || 'application/octet-stream',
    resumable: false,
  })
  return objectPath
}

export async function signedComprobanteUrl(
  storagePath: string | null,
  expiresMs = 60 * 60 * 1000,
): Promise<string | null> {
  if (!storagePath) return null
  const [url] = await pendingUploadsBucket().file(storagePath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresMs,
    responseDisposition: 'inline',
  })
  return url
}
