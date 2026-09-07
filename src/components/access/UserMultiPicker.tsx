import { Search, X } from 'lucide-react'
import { useMemo } from 'react'
import type { UserProfile } from '../../services/userService'
import { isPrivilegedAccessIdentity } from '../../utils/privilegedAccess'

interface UserMultiPickerProps {
  allUsers: UserProfile[]
  excludeEmails: Set<string>
  selectedEmails: string[]
  onSelectedEmailsChange: (emails: string[]) => void
  query: string
  onQueryChange: (query: string) => void
  placeholder?: string
  allowedDomain?: string
  hidePrivileged?: boolean
}

export function UserMultiPicker({
  allUsers,
  excludeEmails,
  selectedEmails,
  onSelectedEmailsChange,
  query,
  onQueryChange,
  placeholder = 'Nombre o email',
  allowedDomain,
  hidePrivileged = true,
}: UserMultiPickerProps) {
  const selectedSet = useMemo(() => new Set(selectedEmails.map((e) => e.toLowerCase())), [selectedEmails])

  const candidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es')
    const typedEmail =
      allowedDomain &&
      normalized.includes('@') &&
      normalized.endsWith(`@${allowedDomain}`)
        ? normalized
        : null

    const fromDirectory = allUsers
      .filter((user) => !excludeEmails.has(user.email.trim().toLowerCase()))
      .filter((user) => !selectedSet.has(user.email.trim().toLowerCase()))
      .filter((user) => !hidePrivileged || !isPrivilegedAccessIdentity(user.email, user.role))
      .filter((user) => {
        if (!normalized) return true
        const haystack = `${user.displayName ?? ''} ${user.email}`.toLocaleLowerCase('es')
        return haystack.includes(normalized)
      })
      .slice(0, 8)

    if (
      typedEmail &&
      !excludeEmails.has(typedEmail) &&
      !selectedSet.has(typedEmail) &&
      !fromDirectory.some((user) => user.email.toLowerCase() === typedEmail)
    ) {
      return [{ uid: typedEmail, email: typedEmail, displayName: typedEmail } as UserProfile, ...fromDirectory]
    }

    return fromDirectory
  }, [allUsers, allowedDomain, excludeEmails, hidePrivileged, query, selectedSet])

  const selectedProfiles = useMemo(() => {
    return selectedEmails.map((email) => {
      const normalized = email.toLowerCase()
      const user = allUsers.find((row) => row.email.toLowerCase() === normalized)
      return {
        email,
        displayName: user?.displayName || email,
      }
    })
  }, [allUsers, selectedEmails])

  const toggleCandidate = (email: string) => {
    const normalized = email.trim().toLowerCase()
    if (selectedSet.has(normalized)) {
      onSelectedEmailsChange(selectedEmails.filter((row) => row.toLowerCase() !== normalized))
      return
    }
    onSelectedEmailsChange([...selectedEmails, normalized])
    onQueryChange('')
  }

  const removeSelected = (email: string) => {
    const normalized = email.toLowerCase()
    onSelectedEmailsChange(selectedEmails.filter((row) => row.toLowerCase() !== normalized))
  }

  return (
    <div className="space-y-3">
      {selectedProfiles.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selectedProfiles.map((user) => (
            <li key={user.email}>
              <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-primary/30 bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand-primary dark:bg-brand-primary/10">
                <span className="truncate">{user.displayName}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${user.displayName}`}
                  onClick={() => removeSelected(user.email)}
                  className="rounded-full p-0.5 hover:bg-brand-primary/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-zinc-400">
          Buscar por nombre o email
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            className="h-10 w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-3 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
      </label>

      {candidates.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-neutral-200 dark:border-zinc-800">
          {candidates.map((user) => {
            const checked = selectedSet.has(user.email.toLowerCase())
            return (
              <li key={user.uid}>
                <button
                  type="button"
                  onClick={() => toggleCandidate(user.email)}
                  className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800 ${
                    checked ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? 'border-brand-primary bg-brand-primary text-white'
                        : 'border-neutral-300 bg-white dark:border-zinc-600 dark:bg-zinc-950'
                    }`}
                  >
                    {checked ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{user.displayName || user.email}</span>
                    <span className="block text-xs text-neutral-500 dark:text-zinc-400">{user.email}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
