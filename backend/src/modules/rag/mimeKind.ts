const FOLDER = 'application/vnd.google-apps.folder'

export function mimeToKind(mimeType: string): string {
  const mime = mimeType.trim().toLowerCase()
  if (mime === FOLDER) return 'Carpeta'
  if (mime === 'application/vnd.google-apps.document') return 'Documento Google'
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'Hoja de cálculo'
  if (mime === 'application/vnd.google-apps.presentation') return 'Presentación'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'Word'
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'Excel'
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint') return 'PowerPoint'
  if (mime.startsWith('text/')) return 'Texto'
  if (mime.startsWith('image/')) return 'Imagen'
  if (mime.startsWith('video/')) return 'Video'
  if (mime.startsWith('audio/')) return 'Audio'
  if (mime.includes('zip') || mime.includes('compressed')) return 'Comprimido'
  return 'Otro'
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exp
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[exp]}`
}
