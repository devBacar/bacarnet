import { beforeEach, describe, expect, it, vi } from 'vitest'

const filesGet = vi.hoisted(() => vi.fn())
const docGet = vi.hoisted(() => vi.fn())

vi.mock('../../lib/google/driveClient.js', () => ({
  getDrive: async () => ({ files: { get: filesGet } }),
}))

vi.mock('../../lib/google/sharedDrive.js', () => ({
  getSharedDriveRootId: () => 'drive-root',
}))

vi.mock('../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: () => docGet(name, id),
      }),
    }),
  }),
}))

import { resolveFileGoverningAreaId } from './governDriveFile.js'

const AREA = 'area-sistemas'
const ROOT_FOLDER = 'folder-sistemas'
const SUBFOLDER = 'folder-sub'
const FILE = 'file-1'
const DRIVE_ROOT = 'drive-root'

const parents: Record<string, string> = {
  [ROOT_FOLDER]: DRIVE_ROOT,
  [SUBFOLDER]: ROOT_FOLDER,
  [FILE]: SUBFOLDER,
}

function snap(input: { exists: boolean; governingAreaId?: string | null }) {
  return {
    exists: input.exists,
    get: (field: string) => (field === 'governingAreaId' ? (input.governingAreaId ?? null) : null),
  }
}

beforeEach(() => {
  filesGet.mockReset()
  docGet.mockReset()
  filesGet.mockImplementation(async ({ fileId }: { fileId: string }) => ({
    data: {
      id: fileId,
      parents: parents[fileId] ? [parents[fileId]] : [],
      mimeType:
        fileId === FILE ? 'application/pdf' : 'application/vnd.google-apps.folder',
    },
  }))
  docGet.mockImplementation(async (collection: string, id: string) => {
    if (collection === 'driveFiles') return snap({ exists: false })
    if (collection === 'driveFolderAreas' && id === ROOT_FOLDER) {
      return snap({ exists: true, governingAreaId: AREA })
    }
    return snap({ exists: false })
  })
})

describe('resolveFileGoverningAreaId', () => {
  it('resuelve una carpeta raíz mapeada aunque el padre sea la Unidad', async () => {
    await expect(resolveFileGoverningAreaId(ROOT_FOLDER, DRIVE_ROOT)).resolves.toBe(AREA)
    expect(docGet).toHaveBeenCalledWith('driveFolderAreas', ROOT_FOLDER)
  })

  it('resuelve una subcarpeta caminando hasta el hijo directo de la raíz', async () => {
    await expect(resolveFileGoverningAreaId(SUBFOLDER, ROOT_FOLDER)).resolves.toBe(AREA)
  })

  it('resuelve un archivo caminando hasta el hijo directo de la raíz', async () => {
    await expect(resolveFileGoverningAreaId(FILE, SUBFOLDER)).resolves.toBe(AREA)
  })

  it('usa el área guardada en driveFiles sin caminar Drive', async () => {
    docGet.mockImplementation(async (collection: string, id: string) => {
      if (collection === 'driveFiles' && id === FILE) {
        return snap({ exists: true, governingAreaId: 'area-guardada' })
      }
      return snap({ exists: false })
    })
    await expect(resolveFileGoverningAreaId(FILE, SUBFOLDER)).resolves.toBe('area-guardada')
    expect(filesGet).not.toHaveBeenCalled()
  })
})
