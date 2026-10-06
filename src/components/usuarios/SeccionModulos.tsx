import { LayoutGrid } from 'lucide-react'
import type { UserPermissions } from '../../services/userService'
import { flagsFinanzasDe, perfilDePermisos } from '../finanzas/permisosFinanzas'
import { Interruptor } from './Interruptor'
import { SeccionFicha } from './SeccionFicha'
import { MODULOS_USO, NIVELES_RRHH, etiquetaPerfil, nivelRrhhDe, permisosDeNivelRrhh, type NivelRrhh } from './util'

export function SeccionModulos({
  permissions,
  puedeEditar,
  esSuperAdmin,
  onToggle,
}: {
  permissions: UserPermissions
  puedeEditar: boolean
  esSuperAdmin: boolean
  onToggle: (
    clave: 'view_directory' | 'view_drive' | 'rag_assistant' | 'view_rrhh' | 'rrhh_detalle',
    valor: boolean,
  ) => void
}) {
  const perfil = etiquetaPerfil(perfilDePermisos(flagsFinanzasDe(permissions)))
  const nivelRrhh = nivelRrhhDe(permissions)
  const ayudaRrhh = NIVELES_RRHH.find((item) => item.id === nivelRrhh)?.ayuda ?? ''

  function cambiarNivelRrhh(nivel: NivelRrhh) {
    const nuevos = permisosDeNivelRrhh(nivel)
    onToggle('view_rrhh', nuevos.view_rrhh)
    onToggle('rrhh_detalle', nuevos.rrhh_detalle)
  }

  return (
    <SeccionFicha icono={LayoutGrid} titulo="Qué puede usar">
      {!puedeEditar && (
        <p className="text-xs text-neutral-500 dark:text-gray-400">
          {esSuperAdmin
            ? 'Un super admin puede usar todo. Esto no se cambia desde acá.'
            : 'Solo un super admin puede cambiar lo que esta persona puede usar.'}
        </p>
      )}
      {MODULOS_USO.map((modulo) => (
        <Interruptor
          key={modulo.clave}
          titulo={modulo.titulo}
          ayuda={modulo.ayuda}
          activo={permissions[modulo.clave] === true}
          deshabilitado={!puedeEditar}
          onChange={(valor) => onToggle(modulo.clave, valor)}
        />
      ))}
      <div className="flex items-start justify-between gap-4 rounded-lg border border-neutral-100 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900 dark:text-gray-100">Finanzas</p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-gray-400">
            El perfil se elige en la sección de abajo.
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium text-[var(--color-primary)]">{perfil}</span>
      </div>
      <div
        className={`flex items-start justify-between gap-4 rounded-lg border border-neutral-100 px-4 py-3 dark:border-zinc-800 ${
          puedeEditar ? '' : 'opacity-60'
        }`}
      >
        <div className="min-w-0">
          <label htmlFor="ficha-nivel-rrhh" className="text-sm font-medium text-neutral-900 dark:text-gray-100">
            RRHH
          </label>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-gray-400">{ayudaRrhh}</p>
        </div>
        <select
          id="ficha-nivel-rrhh"
          value={nivelRrhh}
          disabled={!puedeEditar}
          onChange={(event) => cambiarNivelRrhh(event.target.value as NivelRrhh)}
          className="shrink-0 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-900 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
        >
          {NIVELES_RRHH.map((nivel) => (
            <option key={nivel.id} value={nivel.id}>
              {nivel.label}
            </option>
          ))}
        </select>
      </div>
    </SeccionFicha>
  )
}
