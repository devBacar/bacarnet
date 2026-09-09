import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchPublicAssignableRootAreas,
  listAssignableRootAreas,
  listRootAreas,
} from '../../services/areaService'
import { ensureBoardSession, fetchBoardsVisibility, listBoards } from '../../services/boardsApi'
import { getLinks } from '../../services/linkService'
import { CATALOG_STALE_MS } from '../../lib/queryClient'
import { queryKeys } from '../../lib/queryKeys'

export function useRootAreasQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.areas.root(),
    queryFn: listRootAreas,
    enabled,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useAssignableAreasQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.areas.assignable(),
    queryFn: listAssignableRootAreas,
    enabled,
    staleTime: CATALOG_STALE_MS,
  })
}

/** Áreas reales para formularios públicos (p. ej. registro sin sesión). */
export function usePublicAssignableAreasQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.areas.publicAssignable(),
    queryFn: fetchPublicAssignableRootAreas,
    enabled,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useBoardsQuery(uid: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.boards.list(uid),
    queryFn: async () => {
      await ensureBoardSession()
      return listBoards()
    },
    enabled: Boolean(uid) && enabled,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useBoardsVisibilityQuery(
  uid: string | undefined,
  enabled = true,
  isSuperAdminUser = false,
) {
  return useQuery({
    queryKey: queryKeys.boards.visibility(uid),
    queryFn: fetchBoardsVisibility,
    enabled: Boolean(uid) && enabled && !isSuperAdminUser,
    staleTime: CATALOG_STALE_MS,
    initialData: isSuperAdminUser ? { visible: true } : undefined,
  })
}

export function useLinksQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.links.list(),
    queryFn: getLinks,
    enabled,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useInvalidateCatalog() {
  const client = useQueryClient()
  return {
    invalidateAreas: () =>
      client.invalidateQueries({ queryKey: ['areas'] }),
    invalidateBoards: (uid: string | undefined) =>
      client.invalidateQueries({ queryKey: ['boards', 'list', uid ?? 'anon'] }),
    invalidateLinks: () =>
      client.invalidateQueries({ queryKey: queryKeys.links.list() }),
  }
}
