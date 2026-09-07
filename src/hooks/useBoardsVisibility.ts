import { useAuth } from '../context'
import { useGlobalSettings } from '../context/GlobalSettingsContext'
import { useBoardsVisibilityQuery } from './queries/useCatalogQueries'
import { isSuperAdmin } from '../services/userService'

export function useBoardsVisibility(): boolean | null {
  const { user, userProfile, loading } = useAuth()
  const { settings, loading: settingsLoading } = useGlobalSettings()
  const superAdmin = isSuperAdmin(userProfile)
  const { data, isPending, isError } = useBoardsVisibilityQuery(
    user?.uid,
    !loading && !settingsLoading && settings.boardsEnabled && Boolean(user),
    superAdmin,
  )

  if (loading || settingsLoading) return null
  if (!settings.boardsEnabled) return false
  if (!user) return false
  if (superAdmin) return true
  if (isPending) return null
  if (isError) return false
  return data?.visible ?? false
}
