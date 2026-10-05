import { Wallet } from 'lucide-react'
import { useState } from 'react'
import type { UserPermissions } from '../../services/userService'
import {
  PERFILES_FINANZAS,
  apagarFinanzasSinVista,
  flagsFinanzasDe,
  perfilDePermisos,
  permisosDePerfil,
  type FlagsPermisosFinanzas,
  type PerfilFinanzas,
} from '../finanzas/permisosFinanzas'
import { Interruptor } from './Interruptor'
import { SeccionFicha } from './SeccionFicha'
import { INTERRUPTORES_FINANZAS, resumenFinanzas } from './util'

export function SeccionFinanzas({
  permissions,
  puedeEditar,
  onPermisos,
}: {
  permissions: UserPermissions
  puedeEditar: boolean
  onPermisos: (permissions: UserPermissions) => void
}) {
  const [verDetalle, setVerDetalle] = useState(false)
  const flags = flagsFinanzasDe(permissions)
  const perfil = perfilDePermisos(flags)
  const mostrarDetalle = perfil === 'personalizado' || verDetalle

  const elegir = (siguiente: PerfilFinanzas) => {
    if (!puedeEditar) return
    if (siguiente === 'personalizado') {
      setVerDetalle(true)
      return
    }
    onPermisos(apagarFinanzasSinVista({ ...permissions, ...permisosDePerfil(siguiente) }))
  }

  const alternar = (clave: keyof FlagsPermisosFinanzas, valor: boolean) => {
    if (!puedeEditar) return
    onPermisos(apagarFinanzasSinVista({ ...permissions, [clave]: valor }))
  }

  return (
    <SeccionFicha icono={Wallet} titulo="Finanzas">
      <div className="flex flex-wrap gap-2">
        {PERFILES_FINANZAS.map((opcion) => {
          const activo = perfil === opcion.id
          return (
            <button
              key={opcion.id}
              type="button"
              aria-pressed={activo}
              disabled={!puedeEditar}
              onClick={() => elegir(opcion.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                activo
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700'
              }`}
            >
              {opcion.label}
            </button>
          )
        })}
      </div>
      <p className="text-sm text-neutral-600 dark:text-gray-300">{resumenFinanzas(flags)}</p>
      {perfil !== 'personalizado' && (
        <button
          type="button"
          onClick={() => setVerDetalle((actual) => !actual)}
          className="text-sm font-medium text-brand-primary hover:underline"
        >
          {verDetalle ? 'Ocultar detalle' : 'Ver detalle'}
        </button>
      )}
      {mostrarDetalle &&
        INTERRUPTORES_FINANZAS.map((campo) => {
          const apagado = campo.pideVer && !permissions.view_finanzas
          return (
            <Interruptor
              key={campo.clave}
              titulo={campo.titulo}
              ayuda={campo.ayuda}
              activo={apagado ? false : permissions[campo.clave] === true}
              deshabilitado={!puedeEditar || apagado}
              onChange={(valor) => alternar(campo.clave, valor)}
            />
          )
        })}
      <p className="text-xs text-neutral-500 dark:text-gray-400">
        El encargado de una caja chica se asigna desde Finanzas › Cajas.
      </p>
    </SeccionFicha>
  )
}
