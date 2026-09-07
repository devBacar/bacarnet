import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context'
import {
  useAssignableAreasQuery,
  useBoardsQuery,
} from '../hooks/queries/useCatalogQueries'
import {
  deletePendingUserSetup,
  listPendingUserSetups,
  savePendingUserSetup,
  type PendingUserSetup,
  type PendingUserSetupInput,
} from '../services/pendingUserSetupService'

const PERMISSION_FIELDS = [
  {
    key: 'view_directory' as const,
    label: 'Ver contactos',
    description: 'Acceso a /directorio',
  },
  {
    key: 'view_drive' as const,
    label: 'Ver archivos',
    description: 'Acceso a /recursos y Drive',
  },
]

function PermissionSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-neutral-100 px-4 py-3 transition-colors hover:bg-neutral-50 dark:border-zinc-800 dark:hover:bg-zinc-950">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-gray-100">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-brand-primary' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-zinc-900 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}

interface PendingSetupDrawerProps {
  initial?: PendingUserSetup | null
  onClose: () => void
  onSaved: () => void
}

function PendingSetupDrawer({ initial, onClose, onSaved }: PendingSetupDrawerProps) {
  const { user } = useAuth()
  const { data: areas = [], isLoading: loadingAreas } = useAssignableAreasQuery()
  const { data: boardResult, isLoading: loadingBoards } = useBoardsQuery(user?.uid)
  const boards = boardResult?.boards ?? []
  const loading = loadingAreas || loadingBoards
  const [email, setEmail] = useState(initial?.email ?? '')
  const [role, setRole] = useState<'admin' | 'user'>(initial?.role ?? 'user')
  const [managedAreaIds, setManagedAreaIds] = useState<string[]>(
    () => [...(initial?.managedAreaIds ?? [])],
  )
  const [memberAreaIds, setMemberAreaIds] = useState<string[]>(
    () => [...(initial?.memberAreaIds ?? [])],
  )
  const [permissions, setPermissions] = useState({
    view_directory: initial?.permissions.view_directory ?? true,
    view_drive: initial?.permissions.view_drive ?? true,
  })
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>(
    () => initial?.boardAccess.map((row) => row.boardFolderId) ?? [],
  )
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const boardNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const board of boards) map.set(board.id, board.name)
    for (const row of initial?.boardAccess ?? []) {
      if (row.boardName) map.set(row.boardFolderId, row.boardName)
    }
    return map
  }, [boards, initial?.boardAccess])

  const toggleManagedArea = (id: string) => {
    setManagedAreaIds((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
    )
  }

  const toggleMemberArea = (id: string) => {
    setMemberAreaIds((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
    )
  }

  const toggleBoard = (id: string) => {
    setSelectedBoardIds((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const input: PendingUserSetupInput = {
        email,
        role,
        managedAreaIds: role === 'admin' ? managedAreaIds : [],
        memberAreaIds,
        permissions,
        boardAccess: selectedBoardIds.map((boardFolderId) => ({
          boardFolderId,
          boardName: boardNameById.get(boardFolderId),
        })),
        note: note.trim() || undefined,
      }
      await savePendingUserSetup(input)
      toast.success(initial ? 'Configuración pendiente actualizada' : 'Configuración pendiente creada')
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-neutral-900/40"
        onClick={onClose}
      />

      <aside className="app-drawer-aside max-w-lg">
        <header className="shrink-0 flex items-start justify-between border-b border-neutral-200 px-6 py-5 dark:border-zinc-800">
          <div>
            <p className="text-brand-primary text-xs font-semibold uppercase tracking-wide">
              {initial ? 'Editar pendiente' : 'Nueva configuración pendiente'}
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900 dark:text-gray-100">
              Antes del primer login
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="app-drawer-scroll space-y-5 px-6 py-5">
            <div>
              <label htmlFor="pending-email" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
                Email
              </label>
              <input
                id="pending-email"
                type="email"
                required
                disabled={Boolean(initial)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-brand-focus w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm disabled:bg-neutral-100 dark:border-zinc-700 dark:bg-zinc-900 dark:disabled:bg-zinc-800"
                placeholder="persona@bacarsa.com.ar"
              />
              <p className="mt-1.5 text-xs text-neutral-400">
                Se aplica automáticamente cuando esa persona crea su perfil por primera vez.
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-gray-100">Rol</p>
              <div className="flex gap-2">
                {(['user', 'admin'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRole(option)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      role === option
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                        : 'border-neutral-300 text-neutral-600 dark:border-zinc-700 dark:text-gray-400'
                    }`}
                  >
                    {option === 'admin' ? 'Admin de área' : 'Usuario'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-neutral-500">Cargando áreas y tableros…</p>
            ) : (
              <>
                {role === 'admin' && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-gray-100">
                      Áreas que gobierna
                    </p>
                    <div className="space-y-1 rounded-lg border border-neutral-200 p-2 dark:border-zinc-800">
                      {areas.map((area) => (
                        <label key={area.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-zinc-950">
                          <input
                            type="checkbox"
                            checked={managedAreaIds.includes(area.id!)}
                            onChange={() => toggleManagedArea(area.id!)}
                          />
                          <span className="text-sm">{area.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-gray-100">
                    Áreas de pertenencia
                  </p>
                  <div className="space-y-1 rounded-lg border border-neutral-200 p-2 dark:border-zinc-800">
                    {areas.map((area) => (
                      <label key={`member-${area.id}`} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-zinc-950">
                        <input
                          type="checkbox"
                          checked={memberAreaIds.includes(area.id!)}
                          onChange={() => toggleMemberArea(area.id!)}
                        />
                        <span className="text-sm">{area.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-gray-100">Permisos de módulos</p>
                  <div className="space-y-2">
                    {PERMISSION_FIELDS.map((field) => (
                      <PermissionSwitch
                        key={field.key}
                        checked={permissions[field.key]}
                        onChange={(value) =>
                          setPermissions((prev) => ({ ...prev, [field.key]: value }))
                        }
                        label={field.label}
                        description={field.description}
                      />
                    ))}
                  </div>
                </div>

                {boards.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-gray-100">
                      Acceso a tableros
                    </p>
                    <div className="space-y-1 rounded-lg border border-neutral-200 p-2 dark:border-zinc-800">
                      {boards.map((board) => (
                        <label key={board.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-zinc-950">
                          <input
                            type="checkbox"
                            checked={selectedBoardIds.includes(board.id)}
                            onChange={() => toggleBoard(board.id)}
                          />
                          <span className="text-sm">{board.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label htmlFor="pending-note" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
                Nota interna (opcional)
              </label>
              <textarea
                id="pending-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input-brand-focus w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          </div>

          <footer className="app-drawer-footer flex gap-3 px-6 py-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium dark:border-zinc-700">
              Cancelar
            </button>
            <button type="submit" disabled={saving || loading} className="btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  )
}

export function PendingUserSetupPanel() {
  const [rows, setRows] = useState<PendingUserSetup[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<PendingUserSetup | null | 'new'>(null)
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listPendingUserSetups()
      setRows(data)
    } catch (err) {
      console.error(err)
      toast.error('No se pudo cargar la configuración pendiente')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleDelete = async (row: PendingUserSetup) => {
    if (row.applied) {
      toast.error('No se puede eliminar una configuración ya aplicada')
      return
    }
    if (!window.confirm(`¿Eliminar la configuración pendiente de ${row.email}?`)) return
    setDeletingEmail(row.email)
    try {
      await deletePendingUserSetup(row.email)
      toast.success('Configuración eliminada')
      await load()
    } catch (err) {
      console.error(err)
      toast.error('No se pudo eliminar')
    } finally {
      setDeletingEmail(null)
    }
  }

  return (
    <section className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-gray-100">
            Configuración pendiente
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-gray-400">
            Definí áreas, permisos y tableros para personas que todavía no iniciaron sesión.
            Al crear su perfil por primera vez, el sistema aplica esta configuración automáticamente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawer('new')}
          className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          Agregar email
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-zinc-800 dark:bg-zinc-950">
                <th className="px-5 py-3.5 font-semibold">Email</th>
                <th className="px-5 py-3.5 font-semibold">Rol</th>
                <th className="px-5 py-3.5 font-semibold">Estado</th>
                <th className="px-5 py-3.5 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-neutral-500">
                    Cargando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-neutral-500">
                    No hay configuraciones pendientes.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.email} className="border-b border-neutral-100 dark:border-zinc-800">
                    <td className="px-5 py-4 font-medium">{row.email}</td>
                    <td className="px-5 py-4 text-neutral-600 dark:text-gray-400">
                      {row.role === 'admin' ? 'Admin de área' : 'Usuario'}
                    </td>
                    <td className="px-5 py-4">
                      {row.applied ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Aplicada
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {!row.applied && (
                          <>
                            <button
                              type="button"
                              onClick={() => setDrawer(row)}
                              aria-label={`Editar ${row.email}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 dark:text-gray-400 dark:hover:bg-zinc-800"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(row)}
                              disabled={deletingEmail === row.email}
                              aria-label={`Eliminar ${row.email}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-primary hover:bg-brand-tint disabled:opacity-50 dark:hover:bg-brand-primary-hover/40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawer !== null && (
        <PendingSetupDrawer
          initial={drawer === 'new' ? null : drawer}
          onClose={() => setDrawer(null)}
          onSaved={() => void load()}
        />
      )}
    </section>
  )
}
