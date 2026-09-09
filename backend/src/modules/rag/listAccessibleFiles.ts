import { loadAccessibleInventory, type AccessibleDriveFile } from './accessibleDriveInventory.js'
import type { RagConfig } from './types.js'
import type { drive_v3 } from 'googleapis'

const DEFAULT_LIMIT = 150

export async function listAccessibleFilesTool(input: {
  drive: drive_v3.Drive
  config: RagConfig
  searchSubject: string
  args: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  const inventory = await loadAccessibleInventory({
    drive: input.drive,
    config: input.config,
    searchSubject: input.searchSubject,
  })

  const fileKindFilter =
    typeof input.args.fileKind === 'string' ? input.args.fileKind.trim().toLowerCase() : ''
  const limitRaw = typeof input.args.limit === 'number' ? input.args.limit : DEFAULT_LIMIT
  const limit = Math.min(200, Math.max(1, Math.floor(limitRaw)))

  let files = inventory.files
  if (fileKindFilter) {
    files = files.filter((file) => file.fileKind.toLowerCase().includes(fileKindFilter))
  }

  files = [...files].sort((a, b) => a.name.localeCompare(b.name, 'es'))

  const byType: Record<string, AccessibleDriveFile[]> = {}
  for (const file of files) {
    if (!byType[file.fileKind]) byType[file.fileKind] = []
    byType[file.fileKind].push(file)
  }

  const listed = files.slice(0, limit).map((file) => ({
    fileName: file.name,
    fileKind: file.fileKind,
    modifiedTime: file.modifiedTime,
    webViewLink: file.webViewLink,
  }))

  const typeSummary = Object.fromEntries(
    Object.entries(byType).map(([kind, items]) => [kind, items.length]),
  )

  return {
    areaLabel: inventory.areaLabel,
    totalFiles: inventory.files.length,
    matchCount: files.length,
    returnedCount: listed.length,
    truncated: files.length > limit,
    byType: typeSummary,
    files: listed,
    note:
      'Listado completo de archivos visibles (metadata). Incluye Word, PDF y demás tipos accesibles.',
  }
}
