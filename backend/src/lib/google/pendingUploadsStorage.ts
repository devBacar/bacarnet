import { getStorage } from 'firebase-admin/storage'
import { getEnv } from '../../config/env.js'

export function pendingUploadsBucket() {
  return getStorage().bucket(getEnv().pendingUploadsBucket)
}

export function stagingObjectPath(requestId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\-()+ ]/g, '_').slice(0, 180)
  return `pending-uploads/${requestId}/${safeName}`
}

export async function uploadPendingFile(
  requestId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const objectPath = stagingObjectPath(requestId, fileName)
  const file = pendingUploadsBucket().file(objectPath)
  await file.save(buffer, {
    contentType: mimeType,
    resumable: false,
    metadata: {
      metadata: {
        requestId,
        originalFileName: fileName,
      },
    },
  })
  return objectPath
}

export async function downloadPendingFile(objectPath: string): Promise<Buffer> {
  const [buffer] = await pendingUploadsBucket().file(objectPath).download()
  return buffer
}

export async function deletePendingFile(objectPath: string): Promise<void> {
  await pendingUploadsBucket()
    .file(objectPath)
    .delete({ ignoreNotFound: true })
}

export async function createSignedStagingPreviewUrl(
  objectPath: string,
  expiresMs = 60 * 60 * 1000,
): Promise<string> {
  const [url] = await pendingUploadsBucket().file(objectPath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresMs,
    responseDisposition: 'inline',
  })
  return url
}
