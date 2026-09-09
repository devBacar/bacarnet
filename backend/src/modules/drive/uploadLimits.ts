/** Multipart vía Cloud Function (tope infra ~32 MB). */
export const MULTIPART_UPLOAD_MAX_BYTES = 30 * 1024 * 1024

/** Por encima de esto: subida directa a GCS + copia a Drive. */
export const STAGING_UPLOAD_THRESHOLD_BYTES = 20 * 1024 * 1024

/** Tope vía staging (GCS → Drive). ISO/ZIP de Office suelen superar 2 GB. */
export const STAGING_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024

export function formatUploadSizeLimit(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`
}
