import { randomUUID } from 'node:crypto'
import { pendingUploadsBucket } from '../../../../lib/google/pendingUploadsStorage.js'

/** Mutuos y pagarés firmados (PDF). Mismo bucket que los comprobantes de Cajas. */
export async function guardarDocumento(inversionId: string, buffer: Buffer): Promise<string> {
  const path = `finanzas-inversiones/${inversionId}/${randomUUID()}.pdf`
  await pendingUploadsBucket().file(path).save(buffer, { contentType: 'application/pdf', resumable: false })
  return path
}

/** Enlace para ver el PDF, vence en una hora. */
export async function enlaceDocumento(path: string): Promise<string> {
  const [url] = await pendingUploadsBucket().file(path).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000,
    responseDisposition: 'inline',
  })
  return url
}
