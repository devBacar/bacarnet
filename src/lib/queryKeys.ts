export const queryKeys = {
  drive: {
    files: (uid: string | undefined, folderId: string | null) =>
      ['drive', 'files', uid ?? 'anon', folderId ?? 'root'] as const,
  },
  areas: {
    root: () => ['areas', 'root'] as const,
    assignable: () => ['areas', 'assignable'] as const,
    publicAssignable: () => ['areas', 'public-assignable'] as const,
  },
  boards: {
    list: (uid: string | undefined) => ['boards', 'list', uid ?? 'anon'] as const,
    visibility: (uid: string | undefined) => ['boards', 'visibility', uid ?? 'anon'] as const,
  },
  news: {
    list: (includeExpired = false) => ['news', 'list', includeExpired ? 'all' : 'active'] as const,
  },
  links: {
    list: () => ['links', 'list'] as const,
  },
} as const
