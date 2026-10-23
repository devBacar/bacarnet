import { LayoutDashboard, Mail, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react'
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
  type PendingUserSetupPermissions,
} from '../services/pendingUserSetupService'
import { DEFAULT_PERMISSIONS, type UserPermissions } from '../services/userService'
import { apagarFinanzasSinVista, flagsFinanzasDe } from './finanzas/permisosFinanzas'
import { SeccionAreas } from './usuarios/SeccionAreas'
import { SeccionFicha } from './usuarios/SeccionFicha'
import { SeccionFinanzas } from './usuarios/SeccionFinanzas'
import { SeccionModulos } from './usuarios/SeccionModulos'
import { rolSegunAreas } from './usuarios/util'

function permisosIniciales(inicial: PendingUserSetup | null | undefined): UserPermissions {
  const permisos = inicial?.permissions
  return {
    ...DEFAULT_PERMISSIONS,
    view_directory: permisos ? permisos.view_directory : true,
    view_drive: permisos ? permisos.view_drive : true,
    rag_assistant: permisos?.rag_assistant === true,
    rrhh_detalle: permisos?.rrhh_detalle === true,
    ...flagsFinanzasDe(permisos),
  }
}

function permisosParaGuardar(permissions: UserPermissions): PendingUserSetupPermissions {
  const listos = apagarFinanzasSinVista(permissions)
  return {
    view_directory: listos.view_directory,
    view_drive: listos.view_drive,
    rag_assistant: listos.rag_assistant === true,
    rrhh_detalle: listos.rrhh_detalle === true,
    view_finanzas: listos.view_finanzas === true,
    finanzas_agenda: listos.finanzas_agenda === true,
    finanzas_cheques: listos.finanzas_cheques === true,
    finanzas_categorias: listos.finanzas_categorias === true,
    finanzas_transferencias: listos.finanzas_transferencias === true,
    finanzas_destinatarios: listos.finanzas_destinatarios === true,
    finanzas_saldos: listos.finanzas_saldos === true,
    finanzas_inversiones: listos.finanzas_inversiones === true,
    finanzas_inversiones_aprobar: listos.finanzas_inversiones_aprobar === true,
    manage_finanzas_caja: listos.manage_finanzas_caja === true,
  }
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
  const [email, setEmail] = useState(initial?.email ?? '')
  const [role, setRole] = useState<'admin' | 'user'>(initial?.role ?? 'user')
  const [managedAreaIds, setManagedAreaIds] = useState<string[]>(
    () => [...(initial?.managedAreaIds ?? [])],
  )
  const [memberAreaIds, setMemberAreaIds] = useState<string[]>(
    () => [...(initial?.memberAreaIds ?? [])],
  )
  const [permissions, setPermissions] = useState<UserPermissions>(() => permisosIniciales(initial))
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

  const toggleBoard = (id: string) => {
    setSelectedBoardIds((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const rolDestino = rolSegunAreas(
        initial?.role ?? 'user',
        {
          memberAreaIds: initial?.memberAreaIds ?? [],
          managedAreaIds: initial?.managedAreaIds ?? [],
        },
        { memberAreaIds, managedAreaIds },
      )
      const roleToSave = rolDestino === 'admin' ? 'admin' : 'user'
      const managedToSave = roleToSave === 'admin' ? managedAreaIds : []
      const input: PendingUserSetupInput = {
        email,
        role: roleToSave,
        managedAreaIds: managedToSave,
        memberAreaIds: [...new Set([...memberAreaIds, ...managedToSave])],
        permissions: permisosParaGuardar(permissions),
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
          <div className="app-drawer-scroll space-y-6 px-6 py-5">
            <SeccionFicha icono={Mail} titulo="Email">
              <p className="text-xs text-neutral-500 dark:text-gray-400">
                Se aplica sola cuando esa persona entra por primera vez.
              </p>
              <input
                id="pending-email"
                type="email"
                required
                disabled={Boolean(initial)}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-label="Email"
                className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm disabled:bg-neutral-100 dark:border-zinc-700 dark:bg-zinc-900 dark:disabled:bg-zinc-800"
                placeholder="persona@bacarsa.com.ar"
              />
            </SeccionFicha>

            <SeccionAreas
              areas={areas}
              cargando={loadingAreas}
              rolEsAdmin={role === 'admin'}
              miembroIds={memberAreaIds}
              jefeIds={managedAreaIds}
              motivo=""
              mostrarMotivo={false}
              puedeEditarMiembro
              puedeEditarJefe
              esSuperAdmin={false}
              puedeAsignarRol
              onMiembro={setMemberAreaIds}
              onJefe={(ids) => {
                setManagedAreaIds(ids)
                setRole(ids.length > 0 ? 'admin' : 'user')
              }}
              onMotivo={() => undefined}
            />

            <SeccionModulos
              permissions={permissions}
              puedeEditar
              esSuperAdmin={false}
              mostrarResumenFinanzas={false}
              ayuda="Lo que va a poder abrir cuando entre."
              onToggle={(clave, valor) =>
                setPermissions((prev) => ({ ...prev, [clave]: valor }))
              }
            />

            <SeccionFinanzas
              permissions={permissions}
              puedeEditar
              incluirPersonalizado={false}
              ayuda="Elegí qué puede hacer en Finanzas."
              onPermisos={setPermissions}
            />

            {(loadingBoards || boards.length > 0) && (
              <SeccionFicha icono={LayoutDashboard} titulo="Acceso a tableros">
                <p className="text-xs text-neutral-500 dark:text-gray-400">
                  Los tableros a los que va a entrar.
                </p>
                {loadingBoards ? (
                  <p className="text-sm text-neutral-500 dark:text-gray-400">Cargando tableros…</p>
                ) : (
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
                )}
              </SeccionFicha>
            )}

            <SeccionFicha icono={StickyNote} titulo="Nota interna">
              <p className="text-xs text-neutral-500 dark:text-gray-400">
                Solo la ven quienes administran. La persona no la ve.
              </p>
              <textarea
                id="pending-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                aria-label="Nota interna"
                className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </SeccionFicha>
          </div>

          <footer className="app-drawer-footer flex gap-3 px-6 py-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium dark:border-zinc-700">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
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
            Definí áreas, qué puede usar y tableros para personas que todavía no iniciaron sesión.
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
          key={drawer === 'new' ? 'new' : drawer.email}
          initial={drawer === 'new' ? null : drawer}
          onClose={() => setDrawer(null)}
          onSaved={() => void load()}
        />
      )}
    </section>
  )
}
