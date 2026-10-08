import { UserRound } from 'lucide-react'
import type { GoverningArea } from '../../services/areaService'
import type { UserRole } from '../../services/userService'
import { EtiquetaRol } from './EtiquetaRol'
import { SeccionFicha } from './SeccionFicha'

export function SeccionDatos({
  nombre,
  email,
  departamento,
  nacimiento,
  rol,
  areas,
  cargandoAreas,
  puedeEditarNacimiento,
  esSuperAdmin,
  onNombre,
  onDepartamento,
  onNacimiento,
}: {
  nombre: string
  email: string
  departamento: string
  nacimiento: string
  rol: UserRole
  areas: GoverningArea[]
  cargandoAreas: boolean
  puedeEditarNacimiento: boolean
  esSuperAdmin: boolean
  onNombre: (valor: string) => void
  onDepartamento: (valor: string) => void
  onNacimiento: (valor: string) => void
}) {
  const opciones = opcionesDepartamento(areas, departamento)

  return (
    <SeccionFicha icono={UserRound} titulo="Datos">
      <div>
        <p className="mb-1.5 text-sm font-medium text-neutral-700 dark:text-gray-300">Correo</p>
        <p className="break-all text-sm text-neutral-600 dark:text-gray-300">{email}</p>
      </div>

      <div>
        <label htmlFor="ficha-nombre" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
          Nombre
        </label>
        <input
          id="ficha-nombre"
          type="text"
          value={nombre}
          onChange={(event) => onNombre(event.target.value)}
          className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        {nombre.trim().length === 0 && (
          <p className="mt-1.5 text-xs text-danger">El nombre es obligatorio.</p>
        )}
      </div>

      <div>
        <label htmlFor="ficha-departamento" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
          Departamento
        </label>
        <select
          id="ficha-departamento"
          value={departamento}
          disabled={cargandoAreas || opciones.length === 0}
          onChange={(event) => onDepartamento(event.target.value)}
          className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {cargandoAreas ? (
            <option value={departamento}>Cargando áreas...</option>
          ) : opciones.length === 0 ? (
            <option value={departamento}>{departamento || 'Sin áreas disponibles'}</option>
          ) : (
            opciones.map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))
          )}
        </select>
      </div>

      {puedeEditarNacimiento && (
        <div>
          <label htmlFor="ficha-nacimiento" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
            Fecha de nacimiento
          </label>
          <input
            id="ficha-nacimiento"
            type="date"
            value={nacimiento}
            onChange={(event) => onNacimiento(event.target.value)}
            className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm [color-scheme:light] dark:border-zinc-700 dark:bg-zinc-900 dark:[color-scheme:dark]"
          />
        </div>
      )}

      {esSuperAdmin && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-neutral-700 dark:text-gray-300">Rol</p>
          <div className="space-y-1.5">
            <EtiquetaRol rol={rol} />
            <p className="text-xs text-neutral-500 dark:text-gray-400">
              Este rol no se cambia desde acá.
            </p>
          </div>
        </div>
      )}
    </SeccionFicha>
  )
}

function opcionesDepartamento(areas: GoverningArea[], actual: string): string[] {
  const nombres = areas.map((area) => area.name)
  if (actual.trim() && !nombres.includes(actual)) return [actual, ...nombres]
  return nombres
}
