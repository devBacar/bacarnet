import { randomUUID } from 'node:crypto'
import { getStorage } from 'firebase-admin/storage'
import { pendingUploadsBucket } from '../../../../lib/google/pendingUploadsStorage.js'

/**
 * Mutuos y pagarés firmados (PDF). Por defecto, el mismo bucket que los comprobantes de Cajas;
 * con INVERSIONES_DOCS_BUCKET se pueden guardar en uno propio (sin reglas de borrado automático).
 */
function bucketDocumentos() {
  const propio = process.env.INVERSIONES_DOCS_BUCKET?.trim()
  return propio ? getStorage().bucket(propio) : pendingUploadsBucket()
}

export async function guardarDocumento(inversionId: string, buffer: Buffer): Promise<string> {
  const path = `finanzas-inversiones/${inversionId}/${randomUUID()}.pdf`
  await bucketDocumentos().file(path).save(buffer, { contentType: 'application/pdf', resumable: false })
  return path
}

/** Enlace para ver el PDF, vence en una hora. */
export async function enlaceDocumento(path: string): Promise<string> {
  const [url] = await bucketDocumentos().file(path).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000,
    responseDisposition: 'inline',
  })
  return url
}
