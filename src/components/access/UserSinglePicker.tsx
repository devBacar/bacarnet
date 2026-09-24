import { Search, X } from 'lucide-react'
import { useMemo } from 'react'
import type { UserProfile } from '../../services/userService'
import { isPrivilegedAccessIdentity } from '../../utils/privilegedAccess'

interface UserSinglePickerProps {
  allUsers: UserProfile[]
  selectedUid: string
  onSelectedUidChange: (uid: string) => void
  query: string
  onQueryChange: (query: string) => void
  placeholder?: string
  hidePrivileged?: boolean
  /** id del input de búsqueda (accesibilidad / htmlFor del label padre) */
  inputId?: string
  disabled?: boolean
}

export function UserSinglePicker({
  allUsers,
  selectedUid,
  onSelectedUidChange,
  query,
  onQueryChange,
  placeholder = 'Nombre o email',
  hidePrivileged = false,
  inputId,
  disabled = false,
}: UserSinglePickerProps) {
  const selected = useMemo(
    () => allUsers.find((user) => user.uid === selectedUid) ?? null,
    [allUsers, selectedUid],
  )

  const candidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es')
    return allUsers
      .filter((user) => user.uid !== selectedUid)
      .filter((user) => !hidePrivileged || !isPrivilegedAccessIdentity(user.email, user.role))
      .filter((user) => {
        if (!normalized) return true
        const haystack = `${user.displayName ?? ''} ${user.email}`.toLocaleLowerCase('es')
        return haystack.includes(normalized)
      })
      .slice(0, 8)
  }, [allUsers, hidePrivileged, query, selectedUid])

  const pick = (uid: string) => {
    onSelectedUidChange(uid)
    onQueryChange('')
  }

  const clear = () => {
    onSelectedUidChange('')
    onQueryChange('')
  }

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-brand-primary/30 bg-brand-tint px-3 py-2 dark:bg-brand-primary/10">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-heading">
              {selected.displayName || selected.email}
            </p>
            <p className="truncate text-xs text-neutral-500 dark:text-zinc-400">{selected.email}</p>
          </div>
          <button
            type="button"
            aria-label="Quitar persona seleccionada"
            disabled={disabled}
            onClick={clear}
            className="shrink-0 rounded-full p-1 text-brand-primary hover:bg-brand-primary/10 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              id={inputId}
              value={query}
              disabled={disabled}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-3 text-sm outline-none input-brand-focus disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
          {candidates.length > 0 ? (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-neutral-200 dark:border-zinc-800">
              {candidates.map((user) => (
                <li key={user.uid}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(user.uid)}
                    className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-50 dark:hover:bg-zinc-800"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-heading">
                        {user.displayName || user.email}
                      </span>
                      <span className="block text-xs text-neutral-500 dark:text-zinc-400">
                        {user.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="text-xs text-neutral-500 dark:text-zinc-400">Sin coincidencias</p>
          ) : null}
        </>
      )}
    </div>
  )
}
