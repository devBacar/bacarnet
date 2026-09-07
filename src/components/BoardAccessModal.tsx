import { KeyRound, Loader2, Trash2, UserPlus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { CollapsibleSection } from './access/CollapsibleSection'
import { UserMultiPicker } from './access/UserMultiPicker'
import {
  grantBoardAccess,
  listBoardAccess,
  revokeBoardAccess,
  type BoardAccessUserDto,
} from '../services/boardsApi'
import { getAllUsers, type UserProfile } from '../services/userService'
import { isPrivilegedAccessIdentity } from '../utils/privilegedAccess'

interface BoardAccessModalProps {
  boardId: string
  boardName: string
  onClose: () => void
}

export function BoardAccessModal({ boardId, boardName, onClose }: BoardAccessModalProps) {
  const [allowedUsers, setAllowedUsers] = useState<BoardAccessUserDto[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [grantReason, setGrantReason] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<BoardAccessUserDto | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [access, users] = await Promise.all([listBoardAccess(boardId), getAllUsers()])
      setAllowedUsers(access.allowedUsers)
      setAllUsers(users)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar el acceso')
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const userRoleByEmail = useMemo(() => {
    const map = new Map<string, UserProfile['role']>()
    for (const user of allUsers) {
      map.set(user.email.trim().toLowerCase(), user.role)
    }
    return map
  }, [allUsers])

  const visibleAllowedUsers = useMemo(
    () =>
      allowedUsers.filter(
        (row) => !isPrivilegedAccessIdentity(row.email, userRoleByEmail.get(row.email)),
      ),
    [allowedUsers, userRoleByEmail],
  )

  const grantedEmails = useMemo(
    () => new Set(allowedUsers.map((row) => row.email.trim().toLowerCase())),
    [allowedUsers],
  )

  const handleGrant = async (event: FormEvent) => {
    event.preventDefault()
    if (selectedEmails.length === 0 || !grantReason.trim()) return

    setActing(true)
    try {
      let grantedCount = 0
      let skippedCount = 0
      let failedCount = 0

      for (const email of selectedEmails) {
        try {
          const result = await grantBoardAccess(boardId, email, grantReason.trim())
          setAllowedUsers(result.allowedUsers)
          if (result.granted) grantedCount += 1
          else skippedCount += 1
        } catch {
          failedCount += 1
        }
      }

      if (grantedCount === 0 && failedCount > 0) {
        toast.error('No se pudo otorgar acceso')
      } else if (failedCount > 0) {
        toast.success(`Acceso otorgado a ${grantedCount}; ${failedCount} fallo(s)`)
      } else if (skippedCount > 0 && grantedCount === 0) {
        toast.success('Los usuarios seleccionados ya tenían acceso')
      } else {
        toast.success(
          grantedCount === 1
            ? 'Acceso otorgado'
            : `Acceso otorgado a ${grantedCount} usuarios`,
        )
      }

      setSelectedEmails([])
      setGrantReason('')
      setQuery('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo otorgar acceso')
    } finally {
      setActing(false)
    }
  }

  const handleRevoke = async (event: FormEvent) => {
    event.preventDefault()
    if (!revokeTarget || !revokeReason.trim()) return
    setActing(true)
    try {
      const result = await revokeBoardAccess(boardId, revokeTarget.uid, revokeReason.trim())
      setAllowedUsers(result.allowedUsers)
      setRevokeTarget(null)
      setRevokeReason('')
      toast.success('Acceso revocado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo revocar acceso')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-neutral-900/50"
        onClick={onClose}
      />

      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <header className="flex items-start justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <div className="mb-2 flex items-center gap-2 text-brand-primary">
              <KeyRound className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Acceso al tablero</p>
            </div>
            <h2 className="text-lg font-semibold">{boardName}</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-zinc-400">
              Solo los usuarios listados pueden ver este tablero.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <CollapsibleSection
            title="Usuarios autorizados"
            count={loading ? undefined : visibleAllowedUsers.length}
          >
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              </div>
            ) : visibleAllowedUsers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500 dark:border-zinc-700 dark:text-zinc-400">
                Nadie tiene acceso todavía.
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {visibleAllowedUsers.map((row) => (
                  <li
                    key={row.uid}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-zinc-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.displayName || row.email}</p>
                      <p className="truncate text-xs text-neutral-500 dark:text-zinc-400">{row.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRevokeTarget(row)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-brand-tint dark:hover:bg-brand-primary-hover/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <section>
            <h3 className="mb-2 text-sm font-medium">Agregar usuarios</h3>
            <form onSubmit={handleGrant} className="space-y-3">
              <UserMultiPicker
                allUsers={allUsers}
                excludeEmails={grantedEmails}
                selectedEmails={selectedEmails}
                onSelectedEmailsChange={setSelectedEmails}
                query={query}
                onQueryChange={setQuery}
                placeholder="Nombre o email"
              />

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-zinc-400">
                  Motivo
                </span>
                <textarea
                  required
                  rows={2}
                  value={grantReason}
                  onChange={(event) => setGrantReason(event.target.value)}
                  className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <button
                type="submit"
                disabled={acting || selectedEmails.length === 0 || !grantReason.trim()}
                className="btn-primary inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {acting
                  ? 'Guardando…'
                  : selectedEmails.length > 1
                    ? `Otorgar acceso a ${selectedEmails.length} usuarios`
                    : 'Otorgar acceso'}
              </button>
            </form>
          </section>
        </div>
      </div>

      {revokeTarget ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={handleRevoke}
            className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h3 className="font-semibold">Revocar acceso</h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-zinc-400">
              {revokeTarget.displayName || revokeTarget.email}
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium">Motivo</span>
              <textarea
                required
                rows={3}
                autoFocus
                value={revokeReason}
                onChange={(event) => setRevokeReason(event.target.value)}
                className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRevokeTarget(null)
                  setRevokeReason('')
                }}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={acting || !revokeReason.trim()}
                className="rounded-lg btn-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {acting ? 'Revocando…' : 'Revocar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
