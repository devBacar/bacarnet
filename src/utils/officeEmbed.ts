const OFFICE_EMBED_BASE = 'https://view.officeapps.live.com/op/embed.aspx'

function fileExtension(fileName: string): string {
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] ?? ''
}

/** URL del visor Microsoft Office Online para un archivo staging accesible por URL pública/token. */
export function resolveOfficeEmbedUrl(previewUrl: string, _fileName?: string): string | null {
  try {
    const url = new URL(OFFICE_EMBED_BASE)
    url.searchParams.set('src', previewUrl)
    url.searchParams.set('embedded', 'true')
    return url.toString()
  } catch {
    return null
  }
}

export function isLegacyOfficeFileName(fileName: string): boolean {
  return ['doc', 'xls', 'ppt'].includes(fileExtension(fileName))
}
