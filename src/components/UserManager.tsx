import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context'
import { useUrlEnumParam } from '../hooks/useUrlSearchState'
import { useAssignableAreasQuery } from '../hooks/queries/useCatalogQueries'
import { PendingExternalAccountsPanel } from './PendingExternalAccountsPanel'
import { PendingUserSetupPanel } from './PendingUserSetupPanel'
import { listPendingExternalAccounts } from '../services/usersApi'
import {
  deleteUser,
  getAllUsers,
  isSuperAdmin,
  isSuperAdminEmail,
  type UserProfile,
} from '../services/userService'
import { EncabezadoUsuarios, type PanelUsuarios } from './usuarios/EncabezadoUsuarios'
import { FichaUsuario } from './usuarios/FichaUsuario'
import { ListaUsuarios } from './usuarios/ListaUsuarios'

const PANELES: readonly PanelUsuarios[] = ['registered', 'pending_setup', 'external_approval']

export function UserManager() {
  const { user: currentAuthUser, userProfile, refreshProfile } = useAuth()
  const puedeAsignarRol = isSuperAdmin(userProfile) || isSuperAdminEmail(userProfile?.email)
  const mostrarPendientes = isSuperAdmin(userProfile)
  const puedeEditarNacimiento = isSuperAdmin(userProfile)
  const [panel, setPanel] = useUrlEnumParam('panel', PANELES, 'registered')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [areaId, setAreaId] = useState('')
  const [rol, setRol] = useState('')
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [cuentasPendientes, setCuentasPendientes] = useState<number | null>(null)
  const { data: areas = [], isLoading: cargandoAreas } = useAssignableAreasQuery()

  const loadUsers = useCallback(async () => {
    try {
      const data = await getAllUsers()
      setUsers(data)
      setError(null)
    } catch (err) {
      console.error('Error al cargar usuarios:', err)
      setUsers([])
      setError('No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!mostrarPendientes) return
    let cancelado = false
    listPendingExternalAccounts()
      .then((filas) => {
        if (!cancelado) setCuentasPendientes(filas.length)
      })
      .catch(() => {
        if (!cancelado) setCuentasPendientes(null)
      })
    return () => {
      cancelado = true
    }
  }, [mostrarPendientes, panel])

  const handleSaved = async (uid: string) => {
    await loadUsers()
    if (currentAuthUser?.uid === uid) await refreshProfile()
  }

  const handleDelete = async (user: UserProfile) => {
    if (user.uid === currentAuthUser?.uid) {
      toast.error('No podés eliminar tu propia cuenta desde aquí')
      return
    }

    const confirmed = window.confirm(
      `¿Eliminar definitivamente a "${user.displayName || user.email}"?\n\n` +
        'Se borrará su perfil en Firestore.\n' +
        'La cuenta en Firebase Authentication deberá eliminarse por separado en la consola de Firebase.',
    )
    if (!confirmed) return

    setDeletingId(user.uid)
    try {
      await deleteUser(user.uid)
      toast.success('Usuario eliminado del sistema')
      if (selectedUid === user.uid) setSelectedUid(null)
      await loadUsers()
    } catch (err) {
      console.error('Error al eliminar usuario:', err)
      toast.error('No se pudo eliminar el usuario')
    } finally {
      setDeletingId(null)
    }
  }

  const seleccionado = users.find((user) => user.uid === selectedUid) ?? null
  const panelVisible: PanelUsuarios = mostrarPendientes ? panel : 'registered'

  return (
    <section className="w-full min-w-0">
      <EncabezadoUsuarios
        total={users.length}
        cargando={loading}
        mostrarPendientes={mostrarPendientes}
        cuentasPendientes={cuentasPendientes}
        panel={panelVisible}
        onPanel={(siguiente) => {
          setPanel(siguiente)
          setSelectedUid(null)
        }}
      />

      {panelVisible === 'pending_setup' ? (
        <PendingUserSetupPanel />
      ) : panelVisible === 'external_approval' ? (
        <PendingExternalAccountsPanel />
      ) : (
        <ListaUsuarios
          users={users}
          areas={areas}
          loading={loading}
          error={error}
          busqueda={busqueda}
          areaId={areaId}
          rol={rol}
          onBusqueda={setBusqueda}
          onArea={setAreaId}
          onRol={setRol}
          onAbrir={(user) => setSelectedUid(user.uid)}
        />
      )}

      {seleccionado && panelVisible === 'registered' && (
        <FichaUsuario
          key={seleccionado.uid}
          user={seleccionado}
          areas={areas}
          cargandoAreas={cargandoAreas}
          puedeAsignarRol={puedeAsignarRol}
          puedeEditarNacimiento={puedeEditarNacimiento}
          esUnoMismo={seleccionado.uid === currentAuthUser?.uid}
          eliminando={deletingId === seleccionado.uid}
          onClose={() => setSelectedUid(null)}
          onSaved={handleSaved}
          onEliminar={() => void handleDelete(seleccionado)}
        />
      )}
    </section>
  )
}
