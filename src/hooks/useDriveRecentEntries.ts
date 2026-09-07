import { useCallback, useEffect, useState } from 'react'
import { getDriveFile } from '../services/driveApi'
import {
  listDriveRecentFiles,
  pruneDriveRecentFiles,
  type DriveRecentEntry,
} from '../services/driveRecentFiles'

export function useDriveRecentEntries(uid: string | undefined) {
  const [entries, setEntries] = useState<DriveRecentEntry[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!uid) {
      setEntries([])
      return
    }
    const local = listDriveRecentFiles(uid)
    if (local.length === 0) {
      setEntries([])
      return
    }
    setLoading(true)
    try {
      const checks = await Promise.all(
        local.map(async (entry) => {
          try {
            await getDriveFile(entry.id)
            return entry
          } catch {
            return null
          }
        }),
      )
      const accessible = checks.filter((row): row is DriveRecentEntry => row !== null)
      pruneDriveRecentFiles(uid, new Set(accessible.map((row) => row.id)))
      setEntries(accessible)
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    setEntries(listDriveRecentFiles(uid))
    void refresh()
  }, [refresh, uid])

  useEffect(() => {
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return { entries, loading, refresh }
}
