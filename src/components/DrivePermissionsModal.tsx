import { Loader2, Share2, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { CollapsibleSection } from './access/CollapsibleSection'
import { UserMultiPicker } from './access/UserMultiPicker'
import {
  grantDriveAreaPermission,
  grantDrivePermission,
  listDrivePermissions,
  revokeDrivePermission,
  type DriveAreaMemberDto,
  type DriveClassification,
  type DrivePermissionDto,
  type DrivePermissionRole,
} from '../services/driveApi'
import { getAllUsers, type UserProfile } from '../services/userService'
import { listAssignableRootAreas, type GoverningArea } from '../services/areaService'
import { isPrivilegedAccessIdentity } from '../utils/privilegedAccess'
import { isValidReason, REASON_REQUIRED_ERROR, REASON_REQUIRED_LABEL } from '../utils/reasonValidation'

const ALLOWED_DOMAIN = 'bacarsa.com.ar'

const classificationLabel: Record<DriveClassification, string> = {
  RESTRINGIDO: 'Restringido',
  CONFIDENCIAL: 'Confidencial',
  USO_INTERNO: 'Uso interno',
}

const grantRoleLabel: Record<'reader' | 'commenter' | 'writer', string> = {
  reader: 'Lector',
  commenter: 'Comentarista',
  writer: 'Editor',
}

function permissionRoleLabel(role: DrivePermissionRole): string {
  if (role === 'writer') return 'Escritor'
  if (role === 'commenter') return 'Comentarista'
  return 'Lector'
}

interface DrivePermissionsModalProps {
  fileId: string
  fileName: string
  classification: DriveClassification | null
  onClose: () => void
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
  const [governingAreaId, setGoverningAreaId] = useState<string | null>(null)
  const [governingAreaName, setGoverningAreaName] = useState<string | null>(null)
  const [areaMembers, setAreaMembers] = useState<DriveAreaMemberDto[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [grantRole, setGrantRole] = useState<'reader' | 'commenter' | 'writer'>('reader')
  const [grantReason, setGrantReason] = useState('')
  const [shareWithAreaEnabled, setShareWithAreaEnabled] = useState(false)
  const [areaGrantRole, setAreaGrantRole] = useState<'reader' | 'commenter' | 'writer'>('reader')
  const [areaGrantReason, setAreaGrantReason] = useState('')
  const [areaGrantTargetId, setAreaGrantTargetId] = useState('')
  const [assignableAreas, setAssignableAreas] = useState<GoverningArea[]>([])
  const [revokeTarget, setRevokeTarget] = useState<DrivePermissionDto | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [acting, setActing] = useState(false)

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
      setGoverningAreaId(access.governingAreaId)
      setGoverningAreaName(access.governingAreaName)
      setAreaMembers(access.areaMembers)
      setAreaGrantTargetId(access.governingAreaId ?? areas[0]?.id ?? '')
      setAssignableAreas(areas)
      setAllUsers(users)
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

  const visiblePermissions = useMemo(
    () =>
      permissions.filter(
        (row) =>
          !isPrivilegedAccessIdentity(row.emailAddress, userRoleByEmail.get(row.emailAddress)),
      ),
    [permissions, userRoleByEmail],
  )

  const directPermissions = useMemo(
    () => visiblePermissions.filter((row) => !row.inherited),
    [visiblePermissions],
  )

  const inheritedPermissions = useMemo(
    () => visiblePermissions.filter((row) => row.inherited),
    [visiblePermissions],
  )

  const grantedEmails = useMemo(
    () => new Set(permissions.map((row) => row.emailAddress)),
    [permissions],
  )

  const handleAreaGrant = async (event: FormEvent) => {
    event.preventDefault()
    if (!areaGrantTargetId || !isValidReason(areaGrantReason)) return

    setActing(true)
    try {
      const result = await grantDriveAreaPermission(fileId, {
        role: areaGrantRole,
        reason: areaGrantReason.trim(),
        areaId: areaGrantTargetId,
      })
      const partial = result.failedCount > 0
      toast.success(
        partial
          ? `Permiso otorgado a ${result.grantedCount} personas (${result.failedCount} fallos)`
          : `Permiso otorgado a ${result.grantedCount} personas de ${result.areaName}`,
      )
      setAreaGrantReason('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo compartir con el área')
    } finally {
      setActing(false)
    }
  }

  const selectedGrantAreaName =
    assignableAreas.find((area) => area.id === areaGrantTargetId)?.name ??
    governingAreaName ??
    'el área seleccionada'
  const showGoverningMemberPreview =
    Boolean(governingAreaId) && areaGrantTargetId === governingAreaId && areaMembers.length > 0

  const handleGrant = async (event: FormEvent) => {
    event.preventDefault()
    if (selectedEmails.length === 0 || !grantReason.trim()) return
    if (!isValidReason(grantReason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }

    const invalidDomain = selectedEmails.find(
      (email) => !email.endsWith(`@${ALLOWED_DOMAIN}`),
    )
    if (invalidDomain) {
      toast.error(`Solo se permiten emails @${ALLOWED_DOMAIN}`)
      return
    }

    setActing(true)
    try {
      let grantedCount = 0
      let failedCount = 0
      for (const email of selectedEmails) {
        try {
          await grantDrivePermission(fileId, {
            email,
            role: grantRole,
            reason: grantReason.trim(),
          })
          grantedCount += 1
        } catch {
          failedCount += 1
        }
      }

      if (grantedCount === 0) {
        toast.error('No se pudo otorgar el permiso a ninguna persona')
      } else if (failedCount > 0) {
        toast.success(`Permiso otorgado a ${grantedCount} persona(s); ${failedCount} fallo(s)`)
      } else {
        toast.success(
          grantedCount === 1
            ? 'Permiso otorgado'
            : `Permiso otorgado a ${grantedCount} personas`,
        )
      }

      setSelectedEmails([])
      setGrantReason('')
      setQuery('')
      await load()
    } finally {
      setActing(false)
    }
  }

  const handleRevoke = async (event: FormEvent) => {
    event.preventDefault()
    if (!revokeTarget || !revokeReason.trim()) return
    if (!isValidReason(revokeReason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }

    setActing(true)
    try {
      await revokeDrivePermission(fileId, revokeTarget.id, revokeReason.trim())
      toast.success('Permiso revocado')
      setRevokeTarget(null)
      setRevokeReason('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo revocar el permiso')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-neutral-900/50"
        onClick={onClose}
      />

      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <header className="flex items-start justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <div className="mb-2 flex items-center gap-2 text-brand-primary">
              <Share2 className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Permisos de Drive</p>
            </div>
            <h2 className="text-lg font-semibold">{fileName}</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-zinc-400">
              Clasificación: {classificationLabel[effectiveClassification]}
              {isRestricted ? ' · solo personas puntuales' : ''}
            </p>
            {createdByLabel ? (
              <p className="mt-1 text-xs text-neutral-400 dark:text-zinc-500">
                Creada en intranet por {createdByLabel}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <CollapsibleSection
            title="Personas con acceso directo"
            count={loading ? undefined : directPermissions.length}
          >
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              </div>
            ) : directPermissions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500 dark:border-zinc-700 dark:text-zinc-400">
                Nadie tiene acceso directo todavía. Quienes vean la carpeta lo hacen por herencia
                desde la carpeta padre.
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {directPermissions.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-zinc-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.displayName || row.emailAddress}
                      </p>
                      <p className="truncate text-xs text-neutral-500 dark:text-zinc-400">
                        {row.emailAddress} · {permissionRoleLabel(row.role)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRevokeTarget(row)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-brand-tint dark:hover:bg-brand-primary-hover/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!loading && domainAccess && !domainAccess.inherited && !isRestricted ? (
              <p className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                Acceso de dominio @{domainAccess.domain} ({permissionRoleLabel(domainAccess.role)}).
                Revocalo desde Google Drive si corresponde.
              </p>
            ) : null}
          </CollapsibleSection>

          {!loading && inheritedPermissions.length > 0 ? (
            <CollapsibleSection title="Acceso heredado" count={inheritedPermissions.length}>
              <p className="mb-3 text-xs text-neutral-500 dark:text-zinc-400">
                Estas personas ya tenían acceso a la carpeta padre
                {governingAreaName ? ` (${governingAreaName})` : ''}. Google Drive no permite
                revocarlo desde acá; solo podés quitar acceso directo puntual.
              </p>
              <ul className="max-h-40 space-y-2 overflow-y-auto">
                {inheritedPermissions.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-zinc-800"
                  >
                    <p className="truncate text-sm font-medium">
                      {row.displayName || row.emailAddress}
                    </p>
                    <p className="truncate text-xs text-neutral-500 dark:text-zinc-400">
                      {row.emailAddress} · {permissionRoleLabel(row.role)} · heredado
                    </p>
                  </li>
                ))}
              </ul>
              {!loading && domainAccess?.inherited ? (
                <p className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                  Acceso de dominio @{domainAccess.domain} ({permissionRoleLabel(domainAccess.role)}
                  ), heredado desde la carpeta padre.
                </p>
              ) : null}
            </CollapsibleSection>
          ) : null}

          {assignableAreas.length > 0 ? (
            <section className="rounded-lg border border-neutral-200 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium">Compartir con todo el área</h3>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-zinc-400">
                    Otorga acceso individual en Drive a todos los miembros y jefes del área
                    elegida.
                    {governingAreaName ? (
                      <>
                        {' '}
                        Área gobernante:{' '}
                        <span className="font-medium text-neutral-700 dark:text-zinc-200">
                          {governingAreaName}
                        </span>
                        .
                      </>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={shareWithAreaEnabled}
                  aria-label="Compartir con todo el área"
                  onClick={() => setShareWithAreaEnabled((current) => !current)}
                  className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 ${
                    shareWithAreaEnabled ? 'bg-brand-primary' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform dark:bg-zinc-900 ${
                      shareWithAreaEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {shareWithAreaEnabled ? (
                <form
                  onSubmit={handleAreaGrant}
                  className="space-y-3 border-t border-neutral-200 bg-neutral-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
                >
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-zinc-400">
                      Área destino
                    </span>
                    <select
                      value={areaGrantTargetId}
                      onChange={(event) => setAreaGrantTargetId(event.target.value)}
                      className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {assignableAreas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                          {area.id === governingAreaId ? ' (gobierna el archivo)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {showGoverningMemberPreview ? (
                    <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-neutral-600 dark:text-zinc-400">
                      {areaMembers.map((member) => (
                        <li key={member.uid} className="truncate">
                          {member.displayName || member.email} · {member.email}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-500 dark:text-zinc-400">
                      Se compartirá con miembros y jefes de {selectedGrantAreaName}.
                    </p>
                  )}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-zinc-400">
                      Rol
                    </span>
                    <select
                      value={areaGrantRole}
                      onChange={(event) =>
                        setAreaGrantRole(event.target.value as 'reader' | 'commenter' | 'writer')
                      }
                      className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="reader">{grantRoleLabel.reader}</option>
                      <option value="commenter">{grantRoleLabel.commenter}</option>
                      <option value="writer">{grantRoleLabel.writer}</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-zinc-400">
                      {REASON_REQUIRED_LABEL}
                    </span>
                    <textarea
                      required
                      rows={2}
                      value={areaGrantReason}
                      onChange={(event) => setAreaGrantReason(event.target.value)}
                      className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={acting || !areaGrantTargetId || !isValidReason(areaGrantReason)}
                    className="btn-primary inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Users className="h-4 w-4" />
                    {acting ? 'Compartiendo…' : `Compartir con ${selectedGrantAreaName}`}
                  </button>
                </form>
              ) : null}
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-medium">Otorgar acceso a personas</h3>
            {isRestricted ? (
              <p className="mb-3 rounded-lg alert-error px-3 py-2 text-xs text-danger">
                Archivo restringido: solo podés compartir con personas puntuales de @
                {ALLOWED_DOMAIN}. No hay link abierto ni acceso por dominio.
              </p>
            ) : null}

            <form onSubmit={handleGrant} className="space-y-3">
              <UserMultiPicker
                allUsers={allUsers}
                excludeEmails={grantedEmails}
                selectedEmails={selectedEmails}
                onSelectedEmailsChange={setSelectedEmails}
                query={query}
                onQueryChange={setQuery}
                placeholder={`nombre o usuario@${ALLOWED_DOMAIN}`}
                allowedDomain={ALLOWED_DOMAIN}
              />

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-zinc-400">
                  Rol
                </span>
                <select
                  value={grantRole}
                  onChange={(event) =>
                    setGrantRole(event.target.value as 'reader' | 'commenter' | 'writer')
                  }
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="reader">{grantRoleLabel.reader}</option>
                  <option value="commenter">{grantRoleLabel.commenter}</option>
                  <option value="writer">{grantRoleLabel.writer}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-zinc-400">
                  {REASON_REQUIRED_LABEL}
                </span>
                <textarea
                  required
                  rows={2}
                  value={grantReason}
                  onChange={(event) => setGrantReason(event.target.value)}
                  className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <button
                type="submit"
                disabled={
                  acting ||
                  selectedEmails.length === 0 ||
                  !isValidReason(grantReason)
                }
                className="btn-primary inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {acting
                  ? 'Guardando…'
                  : selectedEmails.length > 1
                    ? `Otorgar permiso a ${selectedEmails.length} personas`
                    : 'Otorgar permiso'}
              </button>
            </form>
          </section>
        </div>
      </div>

      {revokeTarget ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={handleRevoke}
            className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h3 className="font-semibold">Revocar permiso</h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-zinc-400">
              {revokeTarget.displayName || revokeTarget.emailAddress}
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium">
                {REASON_REQUIRED_LABEL}
              </span>
              <textarea
                required
                rows={3}
                autoFocus
                value={revokeReason}
                onChange={(event) => setRevokeReason(event.target.value)}
                className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRevokeTarget(null)
                  setRevokeReason('')
                }}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={acting || !isValidReason(revokeReason)}
                className="rounded-lg btn-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {acting ? 'Revocando…' : 'Revocar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
