import { getStorage } from 'firebase-admin/storage'
import { getEnv } from '../../config/env.js'
import { initFirebaseAdmin } from '../../lib/firebase/admin.js'

export function ragStagingBucket() {
  initFirebaseAdmin()
  return getStorage().bucket(getEnv().ragStagingBucket)
}

export async function uploadRagObject(
  objectPath: string,
  body: Buffer | string,
  contentType: string,
): Promise<void> {
  await ragStagingBucket().file(objectPath).save(body, {
    contentType,
    resumable: false,
    metadata: {
      cacheControl: 'no-cache',
    },
  })
}

export async function downloadRagObject(objectPath: string): Promise<Buffer> {
  const [buffer] = await ragStagingBucket().file(objectPath).download()
  return buffer
}
