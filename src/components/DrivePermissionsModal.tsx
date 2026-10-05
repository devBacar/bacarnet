import { Loader2, MoreHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import {
  grantDriveAreaPermission,
  grantDrivePermission,
  listDrivePermissions,
  revokeDriveAreaShare,
  revokeDrivePermission,
  type DriveAreaShareDto,
  type DriveClassification,
  type DrivePermissionDto,
  type DrivePermissionRole,
} from '../services/driveApi'
import { getAllUsers, type UserProfile } from '../services/userService'
import { listAssignableRootAreas, type GoverningArea } from '../services/areaService'
import { isPrivilegedAccessIdentity } from '../utils/privilegedAccess'

const ALLOWED_DOMAIN = 'bacarsa.com.ar'
const ACCESS_PREVIEW = 6
const SEARCH_LIMIT = 6
const AREA_SHARE_REASON = 'Compartido con el área desde Archivos'
const PERSON_SHARE_REASON = 'Compartido desde Archivos'
const ROLE_CHANGE_REASON = 'Cambio de rol desde Archivos'
const REVOKE_REASON = 'Acceso quitado desde Archivos'

const classificationLabel: Record<DriveClassification, string> = {
  RESTRINGIDO: 'Restringido',
  CONFIDENCIAL: 'Confidencial',
  USO_INTERNO: 'Uso interno',
}

const roleLabel: Record<DrivePermissionRole, string> = {
  reader: 'Lector',
  commenter: 'Comentador',
  writer: 'Editor',
}

const ROLE_OPTIONS: DrivePermissionRole[] = ['reader', 'commenter', 'writer']

interface DrivePermissionsModalProps {
  fileId: string
  fileName: string
  classification: DriveClassification | null
  onClose: () => void
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0] ?? ''
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1] ?? ''
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

function peopleLabel(count: number): string {
  return count === 1 ? '1 persona' : `${count} personas`
}

function areaLabelFor(user: UserProfile, areas: GoverningArea[]): string {
  const ids = [...new Set([...(user.memberAreaIds ?? []), ...(user.managedAreaIds ?? [])])]
  const names = ids
    .map((id) => areas.find((area) => area.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  if (names.length > 0) return names.join(', ')
  const department = user.department.trim()
  return department || 'Sin área'
}

function originLabel(
  row: DrivePermissionDto,
  shares: DriveAreaShareDto[],
  governingAreaName: string | null,
): string {
  const share = shares.find((item) => item.grants.some((grant) => grant.permissionId === row.id))
  if (share) return `por el área ${share.areaName}`
  if (row.inherited) {
    const folder = row.inheritedFromName || governingAreaName
    return folder ? `por la carpeta ${folder}` : 'por la carpeta padre'
  }
  return 'acceso directo'
}

export function DrivePermissionsModal({
  fileId,
  fileName,
  classification,
  onClose,
}: DrivePermissionsModalProps) {
  const [permissions, setPermissions] = useState<DrivePermissionDto[]>([])
  const [domainAccess, setDomainAccess] = useState<
    Awaited<ReturnType<typeof listDrivePermissions>>['domainAccess']
  >(null)
  const [resolvedClassification, setResolvedClassification] = useState<DriveClassification | null>(
    classification,
  )
  const [createdByLabel, setCreatedByLabel] = useState<string | null>(null)
  const [governingAreaName, setGoverningAreaName] = useState<string | null>(null)
  const [areaShares, setAreaShares] = useState<DriveAreaShareDto[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [grantRole, setGrantRole] = useState<DrivePermissionRole>('reader')
  const [areaGrantRole, setAreaGrantRole] = useState<DrivePermissionRole>('reader')
  const [areaGrantTargetId, setAreaGrantTargetId] = useState('')
  const [assignableAreas, setAssignableAreas] = useState<GoverningArea[]>([])
  const [acting, setActing] = useState(false)
  const [showAllAccess, setShowAllAccess] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const effectiveClassification = resolvedClassification ?? classification ?? 'USO_INTERNO'
  const isRestricted = effectiveClassification === 'RESTRINGIDO'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [access, users, areas] = await Promise.all([
        listDrivePermissions(fileId),
        getAllUsers(),
        listAssignableRootAreas(),
      ])
      setPermissions(access.permissions)
      setDomainAccess(access.domainAccess)
      setResolvedClassification(access.classification)
      setCreatedByLabel(access.createdByDisplayName || access.createdByEmail)
      setGoverningAreaName(access.governingAreaName)
      setAreaShares(access.areaShares ?? [])
      setAreaGrantTargetId((current) => current || access.governingAreaId || areas[0]?.id || '')
      setAssignableAreas(areas)
      setAllUsers(users)
      setShowAllAccess(false)
      setOpenMenuId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar los permisos')
    } finally {
      setLoading(false)
    }
  }, [fileId])

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

  const accessRows = useMemo(() => {
    return permissions
      .filter(
        (row) =>
          !isPrivilegedAccessIdentity(row.emailAddress, userRoleByEmail.get(row.emailAddress)),
      )
      .map((row) => {
        const origin = originLabel(row, areaShares, governingAreaName)
        const name = row.displayName || row.emailAddress
        return { row, origin, name, direct: origin === 'acceso directo' }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [areaShares, governingAreaName, permissions, userRoleByEmail])

  const visibleAccess = showAllAccess ? accessRows : accessRows.slice(0, ACCESS_PREVIEW)

  const grantedEmails = useMemo(
    () => new Set(permissions.map((row) => row.emailAddress)),
    [permissions],
  )

  const areaPeopleCount = useCallback(
    (areaId: string) => {
      const ids = new Set<string>()
      for (const user of allUsers) {
        const member = user.memberAreaIds ?? []
        const managed = user.managedAreaIds ?? []
        if (member.includes(areaId) || managed.includes(areaId)) ids.add(user.uid)
      }
      return ids.size
    },
    [allUsers],
  )

  const searchQuery = query.trim().toLocaleLowerCase('es')
  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return []
    return allUsers
      .filter((user) => !grantedEmails.has(user.email.trim().toLowerCase()))
      .filter((user) => !isPrivilegedAccessIdentity(user.email, user.role))
      .filter((user) => {
        const haystack = `${user.displayName ?? ''} ${user.email}`.toLocaleLowerCase('es')
        return haystack.includes(searchQuery)
      })
      .slice(0, SEARCH_LIMIT)
  }, [allUsers, grantedEmails, searchQuery])

  const addPerson = async (email: string) => {
    setActing(true)
    try {
      await grantDrivePermission(fileId, {
        email,
        role: grantRole,
        reason: PERSON_SHARE_REASON,
      })
      toast.success('Listo, ya tiene acceso')
      setQuery('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo dar acceso')
    } finally {
      setActing(false)
    }
  }

  const changeRole = async (row: DrivePermissionDto, role: DrivePermissionRole) => {
    if (row.role === role) {
      setOpenMenuId(null)
      return
    }
    setActing(true)
    try {
      await grantDrivePermission(fileId, {
        email: row.emailAddress,
        role,
        reason: ROLE_CHANGE_REASON,
      })
      toast.success(`Ahora es ${roleLabel[role]}`)
      setOpenMenuId(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el acceso')
    } finally {
      setActing(false)
    }
  }

  const removeAccess = async (row: DrivePermissionDto) => {
    setActing(true)
    try {
      await revokeDrivePermission(fileId, row.id, REVOKE_REASON)
      toast.success('Se quitó el acceso')
      setOpenMenuId(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo quitar el acceso')
    } finally {
      setActing(false)
    }
  }

  const handleAreaGrant = async (event: FormEvent) => {
    event.preventDefault()
    if (!areaGrantTargetId) return

    setActing(true)
    try {
      const result = await grantDriveAreaPermission(fileId, {
        role: areaGrantRole,
        reason: AREA_SHARE_REASON,
        areaId: areaGrantTargetId,
      })
      if (result.ruleSaved === false) {
        toast.error('No quedó guardado el acceso para quienes entren después al área.')
      } else if (result.failedCount > 0) {
        toast.success(
          `Se compartió con ${result.areaName}, pero ${result.failedCount} no se pudieron actualizar.`,
        )
      } else if (result.grantedCount === 0) {
        toast.success(
          `${result.areaName} queda compartida. Quienes entren después también van a tener acceso.`,
        )
      } else {
        toast.success(`Listo. ${result.areaName} tiene acceso.`)
      }
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo compartir con el área')
    } finally {
      setActing(false)
    }
  }

  const stopAreaShare = async (areaId: string) => {
    setActing(true)
    try {
      const result = await revokeDriveAreaShare(fileId, areaId)
      if (!result.deleted) {
        toast.error('No se pudo quitar el acceso de todas las personas del área.')
      } else {
        toast.success('Se dejó de compartir con el área')
      }
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo dejar de compartir con el área')
    } finally {
      setActing(false)
    }
  }

  const subtitle = governingAreaName
    ? `Carpeta de ${governingAreaName} · ${classificationLabel[effectiveClassification]}`
    : classificationLabel[effectiveClassification]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 min-[400px]:p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-neutral-900/50"
        onClick={onClose}
      />

      <div className="relative flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-primary-muted)] bg-[var(--color-primary-light)] px-4 py-3">
          <div className="min-w-0">
            <h2
              className="truncate text-base font-semibold text-[var(--color-primary)]"
              title={fileName}
            >
              Permisos de {fileName}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-primary)]">{subtitle}</p>
            {createdByLabel ? (
              <p className="mt-0.5 text-xs text-[var(--color-primary)] opacity-80">
                Creada en intranet por {createdByLabel}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="px-4 py-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-gray-100">
              Quién tiene acceso{loading ? '' : ` (${accessRows.length})`}
            </h3>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              </div>
            ) : accessRows.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500 dark:text-zinc-400">
                Todavía nadie tiene acceso.
              </p>
            ) : (
              <>
                <ul className="mt-3 space-y-3">
                  {visibleAccess.map(({ row, origin, name, direct }) => (
                    <li key={row.id} className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-xs font-semibold text-[var(--color-primary)]">
                        {initials(name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-gray-100">
                          {name}
                        </p>
                        <p className="truncate text-xs text-neutral-500 dark:text-zinc-400">{origin}</p>
                        {direct && openMenuId === row.id ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {ROLE_OPTIONS.map((role) => (
                              <button
                                key={role}
                                type="button"
                                disabled={acting}
                                onClick={() => void changeRole(row, role)}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                                  row.role === role
                                    ? 'bg-[var(--color-primary)] text-white'
                                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                              >
                                {roleLabel[role]}
                              </button>
                            ))}
                            <button
                              type="button"
                              disabled={acting}
                              onClick={() => void removeAccess(row)}
                              className="rounded-full px-2.5 py-1 text-xs font-medium text-danger hover:bg-brand-tint disabled:opacity-50 dark:hover:bg-brand-primary-hover/30"
                            >
                              Quitar
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-zinc-800 dark:text-zinc-200">
                          {roleLabel[row.role]}
                        </span>
                        {direct ? (
                          <button
                            type="button"
                            aria-label={`Cambiar acceso de ${name}`}
                            aria-expanded={openMenuId === row.id}
                            disabled={acting}
                            onClick={() =>
                              setOpenMenuId((current) => (current === row.id ? null : row.id))
                            }
                            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {!showAllAccess && accessRows.length > ACCESS_PREVIEW ? (
                  <button
                    type="button"
                    onClick={() => setShowAllAccess(true)}
                    className="mt-3 text-sm font-medium text-[var(--color-primary)]"
                  >
                    Ver todos ({accessRows.length})
                  </button>
                ) : null}
              </>
            )}
            {!loading && domainAccess ? (
              <p className="mt-3 text-xs text-neutral-500 dark:text-zinc-400">
                Toda la empresa (@{domainAccess.domain}) tiene acceso de {roleLabel[domainAccess.role]}
                {domainAccess.inherited ? ', por la carpeta de arriba' : ''}.
              </p>
            ) : null}
          </section>

          <section className="border-t border-neutral-200 px-4 py-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-gray-100">
              Agregar personas
            </h3>
            {isRestricted ? (
              <p className="mt-2 text-xs text-neutral-500 dark:text-zinc-400">
                Solo podés sumar personas de @{ALLOWED_DOMAIN}.
              </p>
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre o correo"
                autoComplete="off"
                className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
              />
              <select
                aria-label="Rol para las personas nuevas"
                value={grantRole}
                onChange={(event) => setGrantRole(event.target.value as DrivePermissionRole)}
                className="h-10 w-[6.75rem] shrink-0 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel[role]}
                  </option>
                ))}
              </select>
            </div>
            {searchQuery.length >= 2 ? (
              searchResults.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500 dark:text-zinc-400">
                  No encontramos a nadie con ese nombre.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {searchResults.map((user) => (
                    <li key={user.uid} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-gray-100">
                          {user.displayName || user.email}
                        </p>
                        <p className="truncate text-xs text-neutral-500 dark:text-zinc-400">
                          {areaLabelFor(user, assignableAreas)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() => void addPerson(user.email)}
                        className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] disabled:opacity-50"
                      >
                        + Agregar
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </section>

          <section className="border-t border-neutral-200 px-4 py-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-gray-100">
              Compartir con un área
            </h3>
            {assignableAreas.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500 dark:text-zinc-400">
                No hay áreas para compartir.
              </p>
            ) : (
              <form onSubmit={handleAreaGrant} className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Área"
                    value={areaGrantTargetId}
                    onChange={(event) => setAreaGrantTargetId(event.target.value)}
                    className="h-10 min-w-[8.5rem] flex-1 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {assignableAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name} ({peopleLabel(areaPeopleCount(area.id))})
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Rol del área"
                    value={areaGrantRole}
                    onChange={(event) => setAreaGrantRole(event.target.value as DrivePermissionRole)}
                    className="h-10 w-[6.75rem] shrink-0 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel[role]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={acting || !areaGrantTargetId}
                    className="btn-primary h-10 shrink-0 rounded-lg px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Compartir
                  </button>
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-zinc-400">
                  Le da acceso a todas las personas del área, hoy y las que entren después.
                </p>
              </form>
            )}

            {areaShares.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {areaShares.map((share) => (
                  <li
                    key={share.areaId}
                    className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <p className="text-sm text-neutral-800 dark:text-gray-100">
                      {share.areaName} · {roleLabel[share.role]} · se aplica a quien entre al área
                    </p>
                    <button
                      type="button"
                      disabled={acting}
                      onClick={() => void stopAreaShare(share.areaId)}
                      className="mt-1 text-xs font-medium text-danger hover:underline disabled:opacity-50"
                    >
                      Dejar de compartir con el área
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
