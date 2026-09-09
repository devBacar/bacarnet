/** Debe coincidir con backend uploadLimits.ts */
export const MULTIPART_UPLOAD_MAX_BYTES = 30 * 1024 * 1024
export const STAGING_UPLOAD_THRESHOLD_BYTES = 20 * 1024 * 1024
export const STAGING_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024

export function formatUploadSizeLimit(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    const gb = bytes / (1024 * 1024 * 1024)
    return Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB`
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${bytes} B`
}

export function usesStagingUpload(file: File): boolean {
  return file.size >= STAGING_UPLOAD_THRESHOLD_BYTES
}

export function isWithinUploadLimit(file: File): boolean {
  return file.size > 0 && file.size <= STAGING_UPLOAD_MAX_BYTES
}

export function partitionUploadFilesByLimit(files: File[]): {
  accepted: File[]
  tooLarge: File[]
} {
  const accepted: File[] = []
  const tooLarge: File[] = []
  for (const file of files) {
    if (isWithinUploadLimit(file)) accepted.push(file)
    else tooLarge.push(file)
  }
  return { accepted, tooLarge }
}

export function uploadFileLabel(file: File): string {
  return file.webkitRelativePath || file.name
}
