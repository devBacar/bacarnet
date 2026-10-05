import { X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import type { GoverningArea } from '../../services/areaService'
import type { UserProfile } from '../../services/userService'
import {
  agregarOperacion,
  aplicarOps,
  borradorInicial,
  fichaTieneCambios,
  guardarFicha,
  motivoAreasObligatorio,
  snapshotDe,
  type BorradorFicha,
  type SnapshotFicha,
} from './guardarFicha'
import { SeccionAreas } from './SeccionAreas'
import { SeccionCuenta } from './SeccionCuenta'
import { SeccionDatos } from './SeccionDatos'
import { SeccionFinanzas } from './SeccionFinanzas'
import { SeccionModulos } from './SeccionModulos'
import { SeccionPermisosEspeciales } from './SeccionPermisosEspeciales'

export function FichaUsuario({
  user,
  areas,
  cargandoAreas,
  puedeAsignarRol,
  puedeEditarNacimiento,
  esUnoMismo,
  eliminando,
  onClose,
  onSaved,
  onEliminar,
}: {
  user: UserProfile
  areas: GoverningArea[]
  cargandoAreas: boolean
  puedeAsignarRol: boolean
  puedeEditarNacimiento: boolean
  esUnoMismo: boolean
  eliminando: boolean
  onClose: () => void
  onSaved: (uid: string) => Promise<void>
  onEliminar: () => void
}) {
  const [base, setBase] = useState<SnapshotFicha>(() => snapshotDe(user))
  const [borrador, setBorrador] = useState<BorradorFicha>(() => borradorInicial(user))
  const [guardando, setGuardando] = useState(false)
  const [dialogoPermiso, setDialogoPermiso] = useState(false)
  const [claveAbierta, setClaveAbierta] = useState(false)
  const [claveVisible, setClaveVisible] = useState(false)

  const opciones = useMemo(
    () => ({ puedeAsignarRol, puedeEditarNacimiento }),
    [puedeAsignarRol, puedeEditarNacimiento],
  )
  const sucio = fichaTieneCambios(base, borrador, opciones)
  const esSuperAdmin = base.role === 'super_admin'
  const puedeEditarPermisos = puedeAsignarRol && !esSuperAdmin
  const jefeIds = borrador.role === 'admin' ? borrador.managedAreaIds : []
  const grants = useMemo(
    () => aplicarOps(base.actionGrants, borrador.grantOps),
    [base.actionGrants, borrador.grantOps],
  )

  const onDialogoPermiso = useCallback((abierto: boolean) => {
    setDialogoPermiso(abierto)
  }, [])

  const onEstadoClave = useCallback((estado: { abierto: boolean; temporalVisible: boolean }) => {
    setClaveAbierta(estado.abierto)
    setClaveVisible(estado.temporalVisible)
  }, [])

  const pedirCierre = useCallback(() => {
    if (guardando) return
    if (claveVisible) {
      const aviso = sucio
        ? 'Hay cambios sin guardar y la contraseña temporal no se va a volver a mostrar. ¿Cerrar de todos modos?'
        : 'La contraseña temporal no se va a volver a mostrar. ¿Cerrar de todos modos?'
      if (!window.confirm(aviso)) return
      onClose()
      return
    }
    if (sucio && !window.confirm('Hay cambios sin guardar. Si cerrás, se pierden. ¿Cerrar de todos modos?')) {
      return
    }
    onClose()
  }, [claveVisible, guardando, onClose, sucio])

  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (dialogoPermiso || claveAbierta) return
      pedirCierre()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [claveAbierta, dialogoPermiso, pedirCierre])

  const guardar = async () => {
    if (guardando || !sucio || borrador.displayName.trim().length === 0) return
    setGuardando(true)
    try {
      const resultado = await guardarFicha(user, base, borrador, opciones)
      setBase(resultado.base)
      setBorrador((prev) => ({ ...prev, grantOps: resultado.grantOps }))
      if (resultado.ok) {
        toast.success(resultado.mensajeExito ?? 'Cambios guardados.')
        await onSaved(user.uid)
        onClose()
      } else {
        toast.error(resultado.mensajeError ?? 'No se pudieron guardar los cambios.')
        await onSaved(user.uid)
      }
    } finally {
      setGuardando(false)
    }
  }

  const parche = (parcial: Partial<BorradorFicha>) => {
    setBorrador((prev) => ({ ...prev, ...parcial }))
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar ficha"
        className="absolute inset-0 bg-neutral-900/40"
        onClick={pedirCierre}
      />
      <aside className="app-drawer-aside max-w-md shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-primary-muted)] bg-[var(--color-primary-light)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-[var(--color-primary)]">
              {borrador.displayName.trim() || user.displayName || 'Sin nombre'}
            </h2>
            <p className="mt-0.5 break-all text-sm text-neutral-600 dark:text-gray-300">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={pedirCierre}
            className="rounded-lg p-2 text-[var(--color-primary)] hover:bg-white/60 dark:hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="app-drawer-scroll space-y-6 px-5 py-5">
          <SeccionDatos
            nombre={borrador.displayName}
            email={user.email}
            departamento={borrador.department}
            nacimiento={borrador.birthDate}
            rol={borrador.role}
            areas={areas}
            cargandoAreas={cargandoAreas}
            puedeEditarRol={puedeAsignarRol}
            puedeEditarNacimiento={puedeEditarNacimiento}
            esSuperAdmin={esSuperAdmin}
            onNombre={(displayName) => parche({ displayName })}
            onDepartamento={(department) => parche({ department })}
            onNacimiento={(birthDate) => parche({ birthDate })}
            onRol={(role) => parche({ role })}
          />
          <SeccionAreas
            areas={areas}
            cargando={cargandoAreas}
            rolEsAdmin={borrador.role === 'admin'}
            miembroIds={borrador.memberAreaIds}
            jefeIds={borrador.managedAreaIds}
            motivo={borrador.areasReason}
            mostrarMotivo={motivoAreasObligatorio(base, borrador, opciones)}
            puedeEditarMiembro={!esSuperAdmin}
            puedeEditarJefe={puedeEditarPermisos && borrador.role === 'admin'}
            esSuperAdmin={esSuperAdmin}
            puedeAsignarRol={puedeAsignarRol}
            onMiembro={(memberAreaIds) => parche({ memberAreaIds })}
            onJefe={(managedAreaIds) => parche({ managedAreaIds })}
            onMotivo={(areasReason) => parche({ areasReason })}
          />
          <SeccionModulos
            permissions={borrador.permissions}
            puedeEditar={puedeEditarPermisos}
            esSuperAdmin={esSuperAdmin}
            onToggle={(clave, valor) =>
              setBorrador((prev) => ({
                ...prev,
                permissions: { ...prev.permissions, [clave]: valor },
              }))
            }
          />
          <SeccionFinanzas
            permissions={borrador.permissions}
            puedeEditar={puedeEditarPermisos}
            onPermisos={(permissions) => parche({ permissions })}
          />
          <SeccionPermisosEspeciales
            grants={grants}
            areas={areas}
            cargandoAreas={cargandoAreas}
            jefeIds={jefeIds}
            puedeEditar={puedeEditarPermisos}
            onAgregar={(action, areaId, reason) =>
              setBorrador((prev) => ({
                ...prev,
                grantOps: agregarOperacion(prev.grantOps, {
                  action,
                  areaId,
                  operation: 'grant',
                  reason,
                }),
              }))
            }
            onQuitar={(action, areaId, reason) =>
              setBorrador((prev) => ({
                ...prev,
                grantOps: agregarOperacion(prev.grantOps, {
                  action,
                  areaId,
                  operation: 'revoke',
                  reason,
                }),
              }))
            }
            onDialogo={onDialogoPermiso}
          />
          <SeccionCuenta
            uid={user.uid}
            nombre={user.displayName}
            email={user.email}
            esUnoMismo={esUnoMismo}
            puedeRestablecer={puedeAsignarRol && !esUnoMismo}
            puedeEliminar={!esUnoMismo}
            eliminando={eliminando}
            onEliminar={onEliminar}
            onEstadoClave={onEstadoClave}
          />
        </div>

        <footer className="app-drawer-footer flex gap-3 px-5 py-4">
          <button
            type="button"
            onClick={pedirCierre}
            disabled={guardando}
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-950"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || !sucio || borrador.displayName.trim().length === 0}
            className="btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </footer>
      </aside>
    </div>
  )
}
