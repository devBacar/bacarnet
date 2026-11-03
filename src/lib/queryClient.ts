import { QueryClient } from '@tanstack/react-query'

export const DRIVE_STALE_MS = 30_000
export const CATALOG_STALE_MS = 5 * 60_000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
})
