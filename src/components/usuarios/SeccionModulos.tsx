import { LayoutGrid } from 'lucide-react'
import type { UserPermissions } from '../../services/userService'
import { flagsFinanzasDe, perfilDePermisos } from '../finanzas/permisosFinanzas'
import { Interruptor } from './Interruptor'
import { SeccionFicha } from './SeccionFicha'
import { MODULOS_USO, etiquetaPerfil } from './util'

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
    clave: 'view_directory' | 'view_drive' | 'rag_assistant' | 'rrhh_detalle',
    valor: boolean,
  ) => void
}) {
  const perfil = etiquetaPerfil(perfilDePermisos(flagsFinanzasDe(permissions)))

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
      <Interruptor
        titulo="RRHH: ver nombres, legajos y sueldos"
        ayuda="Para el Tablero de RRHH (rrhh_detalle). El acceso al tablero se da desde el tablero, botón Acceso."
        activo={permissions.rrhh_detalle === true}
        deshabilitado={!puedeEditar}
        onChange={(valor) => onToggle('rrhh_detalle', valor)}
      />
    </SeccionFicha>
  )
}
