import type { GoverningArea } from '../../services/areaService'
import type { UserProfile } from '../../services/userService'
import { TarjetaUsuario } from './TarjetaUsuario'
import { filtrarUsuarios, nombresPorId } from './util'

export function ListaUsuarios({
  users,
  areas,
  loading,
  error,
  busqueda,
  areaId,
  rol,
  onBusqueda,
  onArea,
  onRol,
  onAbrir,
}: {
  users: UserProfile[]
  areas: GoverningArea[]
  loading: boolean
  error: string | null
  busqueda: string
  areaId: string
  rol: string
  onBusqueda: (valor: string) => void
  onArea: (valor: string) => void
  onRol: (valor: string) => void
  onAbrir: (user: UserProfile) => void
}) {
  const nombresArea = nombresPorId(areas)
  const visibles = filtrarUsuarios(users, busqueda, areaId, rol)
  const hayFiltro = busqueda.trim().length > 0 || areaId.length > 0 || rol.length > 0

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_12rem]">
        <div className="min-w-0">
          <label htmlFor="buscar-usuario" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
            Buscar
          </label>
          <input
            id="buscar-usuario"
            type="search"
            value={busqueda}
            onChange={(event) => onBusqueda(event.target.value)}
            placeholder="Nombre o correo"
            className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="filtro-area" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
            Área
          </label>
          <select
            id="filtro-area"
            value={areaId}
            onChange={(event) => onArea(event.target.value)}
            className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Todas</option>
            {areas.map((area) =>
              area.id ? (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ) : null,
            )}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="filtro-rol" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
            Rol
          </label>
          <select
            id="filtro-rol"
            value={rol}
            onChange={(event) => onRol(event.target.value)}
            className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Todos</option>
            <option value="super_admin">Super admin</option>
            <option value="admin">Administrador de área</option>
            <option value="user">Usuario</option>
          </select>
        </div>
      </div>

      {hayFiltro && !loading && !error && (
        <p className="text-sm text-neutral-500 dark:text-gray-400">
          {visibles.length === 1 ? 'Se muestra 1 persona.' : `Se muestran ${visibles.length} personas.`}
        </p>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 5 }).map((_, indice) => (
            <div key={indice} className="h-24 rounded-xl bg-neutral-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-neutral-200 px-4 py-12 text-center text-sm text-danger dark:border-zinc-800">
          {error}
        </p>
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500 dark:border-zinc-800 dark:text-gray-400">
          No hay usuarios registrados.
        </p>
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500 dark:border-zinc-800 dark:text-gray-400">
          No hay personas con ese filtro.
        </p>
      ) : (
        <ul className="min-w-0 space-y-3">
          {visibles.map((user) => (
            <li key={user.uid} className="min-w-0">
              <TarjetaUsuario
                user={user}
                nombresArea={nombresArea}
                onAbrir={() => onAbrir(user)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
