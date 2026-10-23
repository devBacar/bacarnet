import { GOVERNANCE_ACTIONS } from '../../services/governanceAccess'
import {
  updateManagedAreaIds,
  updateMemberAreaIds,
  updateUserBasicInfo,
  updateUserPermissions,
  updateUserRole,
  type ActionGrants,
  type GovernanceAction,
  type UserPermissions,
  type UserProfile,
  type UserRole,
} from '../../services/userService'
import { patchUserActionGrants } from '../../services/usersApi'
import { isValidReason } from '../../utils/reasonValidation'
import { apagarFinanzasSinVista, flagsFinanzasDe } from '../finanzas/permisosFinanzas'
import { rolSegunAreas } from './util'

const CLAVES_PERMISO: (keyof UserPermissions)[] = [
  'view_directory',
  'view_drive',
  'view_links',
  'manage_news',
  'manage_links',
  'manage_users',
  'super_admin',
  'rag_assistant',
  'view_finanzas',
  'finanzas_agenda',
  'finanzas_cheques',
  'finanzas_categorias',
  'finanzas_transferencias',
  'finanzas_destinatarios',
  'finanzas_saldos',
  'finanzas_inversiones',
  'finanzas_inversiones_aprobar',
  'manage_finanzas_caja',
  'rrhh_detalle',
]

export interface OperacionPermisoEspecial {
  action: GovernanceAction
  areaId: string
  operation: 'grant' | 'revoke'
  reason: string
}

export interface OpcionesGuardado {
  puedeAsignarRol: boolean
  puedeEditarNacimiento: boolean
}

export interface SnapshotFicha {
  displayName: string
  department: string
  birthDate: string
  role: UserRole
  memberAreaIds: string[]
  managedAreaIds: string[]
  permissions: UserPermissions
  actionGrants: ActionGrants
}

export interface BorradorFicha {
  displayName: string
  department: string
  birthDate: string
  role: UserRole
  memberAreaIds: string[]
  managedAreaIds: string[]
  permissions: UserPermissions
  areasReason: string
  grantOps: OperacionPermisoEspecial[]
}

export interface ResultadoGuardado {
  ok: boolean
  mensajeExito?: string
  mensajeError?: string
  base: SnapshotFicha
  grantOps: OperacionPermisoEspecial[]
}

export function permisosNormalizados(permissions: UserPermissions): UserPermissions {
  return apagarFinanzasSinVista({ ...permissions, ...flagsFinanzasDe(permissions) })
}

export function snapshotDe(user: UserProfile): SnapshotFicha {
  return {
    displayName: user.displayName,
    department: user.department,
    birthDate: user.birthDate ?? '',
    role: user.role,
    memberAreaIds: [...(user.memberAreaIds ?? [])],
    managedAreaIds: [...(user.managedAreaIds ?? [])],
    permissions: permisosNormalizados(user.permissions),
    actionGrants: clonarGrants(user.actionGrants ?? {}),
  }
}

export function borradorInicial(user: UserProfile): BorradorFicha {
  const base = snapshotDe(user)
  return {
    displayName: base.displayName,
    department: base.department,
    birthDate: base.birthDate,
    role: base.role,
    memberAreaIds: [...base.memberAreaIds],
    managedAreaIds: [...base.managedAreaIds],
    permissions: { ...base.permissions },
    areasReason: '',
    grantOps: [],
  }
}

export function aplicarOps(base: ActionGrants, ops: OperacionPermisoEspecial[]): ActionGrants {
  const next = clonarGrants(base)
  for (const op of ops) {
    const actuales = new Set(next[op.action] ?? [])
    if (op.operation === 'grant') actuales.add(op.areaId)
    else actuales.delete(op.areaId)
    const lista = [...actuales]
    if (lista.length > 0) next[op.action] = lista
    else delete next[op.action]
  }
  return next
}

export function agregarOperacion(
  ops: OperacionPermisoEspecial[],
  op: OperacionPermisoEspecial,
): OperacionPermisoEspecial[] {
  const mismo = (item: OperacionPermisoEspecial) =>
    item.action === op.action && item.areaId === op.areaId
  const contraria = op.operation === 'grant' ? 'revoke' : 'grant'
  const sinContraria = ops.filter((item) => !(mismo(item) && item.operation === contraria))
  if (sinContraria.length !== ops.length) return sinContraria
  if (ops.some((item) => mismo(item) && item.operation === op.operation)) return ops
  return [...ops, op]
}

export function fichaTieneCambios(
  base: SnapshotFicha,
  draft: BorradorFicha,
  opciones: OpcionesGuardado,
): boolean {
  if (draft.displayName.trim() !== base.displayName) return true
  if (draft.department !== base.department) return true
  if (opciones.puedeEditarNacimiento && draft.birthDate !== base.birthDate) return true
  if (base.role === 'super_admin') return false
  if (!arraysEqual(draft.memberAreaIds, base.memberAreaIds)) return true
  if (!opciones.puedeAsignarRol) return false
  const rolDestino = rolSegunAreas(base.role, base, draft)
  if (rolAsignable(rolDestino) !== rolAsignable(base.role)) return true
  if (
    !arraysEqual(
      jefesEfectivosDe(rolDestino, draft.managedAreaIds),
      jefesEfectivosDe(base.role, base.managedAreaIds),
    )
  ) {
    return true
  }
  if (!permisosIguales(draft.permissions, base.permissions)) return true
  return draft.grantOps.length > 0
}

export function motivoAreasObligatorio(
  base: SnapshotFicha,
  draft: BorradorFicha,
  opciones: OpcionesGuardado,
): boolean {
  if (base.role === 'super_admin') return false
  if (!arraysEqual(draft.memberAreaIds, base.memberAreaIds)) return true
  if (!opciones.puedeAsignarRol) return false
  const rolBase = rolAsignable(base.role)
  const rolDraft = rolAsignable(rolSegunAreas(base.role, base, draft))
  if (rolBase === 'admin' && rolDraft === 'user' && base.managedAreaIds.length > 0) return true
  return rolDraft === 'admin' && !arraysEqual(draft.managedAreaIds, base.managedAreaIds)
}

export async function guardarFicha(
  user: UserProfile,
  base: SnapshotFicha,
  draft: BorradorFicha,
  opciones: OpcionesGuardado,
): Promise<ResultadoGuardado> {
  const hechas: string[] = []
  let actual = clonarSnapshot(base)
  let ops = draft.grantOps

  const fallo = (oracion: string, err: unknown): ResultadoGuardado => {
    const detalle = err instanceof Error && err.message ? err.message : ''
    const previa = hechas.length > 0 ? ` Sí se guardó: ${unir(hechas)}.` : ''
    const extra = detalle ? ` ${detalle}` : ''
    return {
      ok: false,
      mensajeError: `${oracion}${extra}${previa}`,
      base: actual,
      grantOps: ops,
    }
  }

  if (!draft.displayName.trim()) {
    return { ok: false, mensajeError: 'El nombre es obligatorio.', base: actual, grantOps: ops }
  }

  if (motivoAreasObligatorio(actual, draft, opciones) && !isValidReason(draft.areasReason)) {
    return {
      ok: false,
      mensajeError: 'Ingresá el motivo del cambio de áreas.',
      base: actual,
      grantOps: ops,
    }
  }

  const nombre = draft.displayName.trim()
  const cambiaNacimiento =
    opciones.puedeEditarNacimiento && draft.birthDate !== actual.birthDate
  const cambianDatos =
    nombre !== actual.displayName || draft.department !== actual.department || cambiaNacimiento

  if (cambianDatos) {
    try {
      await updateUserBasicInfo(user.uid, {
        displayName: nombre,
        email: user.email,
        department: draft.department,
        ...(opciones.puedeEditarNacimiento ? { birthDate: draft.birthDate } : {}),
      })
      actual = {
        ...actual,
        displayName: nombre,
        department: draft.department,
        birthDate: opciones.puedeEditarNacimiento ? draft.birthDate : actual.birthDate,
      }
      hechas.push('los datos')
    } catch (err) {
      return fallo('No se pudieron guardar los datos.', err)
    }
  }

  if (actual.role !== 'super_admin' && opciones.puedeAsignarRol) {
    const rolBase = rolAsignable(actual.role)
    const rolDraft = rolAsignable(rolSegunAreas(actual.role, actual, draft))
    const cambiaRol = rolDraft !== rolBase
    const cambianJefes = !arraysEqual(draft.managedAreaIds, actual.managedAreaIds)
    const motivo = draft.areasReason.trim()

    if (rolBase === 'admin' && rolDraft === 'user') {
      if (actual.managedAreaIds.length > 0) {
        try {
          await updateManagedAreaIds(user.uid, [], motivo)
          actual = { ...actual, managedAreaIds: [] }
          hechas.push('las áreas que administra')
        } catch (err) {
          return fallo('No se pudieron guardar las áreas que administra.', err)
        }
      }
      if (cambiaRol) {
        try {
          await updateUserRole(user.uid, 'user')
          actual = { ...actual, role: 'user' }
          hechas.push('el rol')
        } catch (err) {
          return fallo('No se pudo guardar el rol.', err)
        }
      }
    } else {
      if (cambiaRol) {
        try {
          await updateUserRole(user.uid, rolDraft)
          actual = { ...actual, role: rolDraft }
          hechas.push('el rol')
        } catch (err) {
          return fallo('No se pudo guardar el rol.', err)
        }
      }
      if (rolDraft === 'admin' && cambianJefes) {
        try {
          await updateManagedAreaIds(user.uid, draft.managedAreaIds, motivo)
          actual = { ...actual, managedAreaIds: [...draft.managedAreaIds] }
          hechas.push('las áreas que administra')
        } catch (err) {
          return fallo('No se pudieron guardar las áreas que administra.', err)
        }
      }
    }
  }

  if (actual.role !== 'super_admin' && !arraysEqual(draft.memberAreaIds, actual.memberAreaIds)) {
    try {
      await updateMemberAreaIds(user.uid, draft.memberAreaIds, draft.areasReason.trim())
      actual = { ...actual, memberAreaIds: [...draft.memberAreaIds] }
      hechas.push('las áreas de las que forma parte')
    } catch (err) {
      return fallo('No se pudieron guardar las áreas de las que forma parte.', err)
    }
  }

  if (
    opciones.puedeAsignarRol &&
    actual.role !== 'super_admin' &&
    !permisosIguales(draft.permissions, actual.permissions)
  ) {
    try {
      const permissions = apagarFinanzasSinVista(draft.permissions)
      await updateUserPermissions(user.uid, permissions)
      actual = { ...actual, permissions }
      hechas.push('lo que puede usar y Finanzas')
    } catch (err) {
      return fallo('No se pudo guardar lo que puede usar y Finanzas.', err)
    }
  }

  if (opciones.puedeAsignarRol && actual.role !== 'super_admin' && ops.length > 0) {
    const pendientes = [...ops]
    for (let i = 0; i < pendientes.length; i += 1) {
      const op = pendientes[i]
      try {
        const result = await patchUserActionGrants(user.uid, {
          action: op.action,
          areaId: op.areaId,
          operation: op.operation,
          reason: op.reason.trim(),
        })
        actual = { ...actual, actionGrants: result.actionGrants }
        ops = pendientes.slice(i + 1)
      } catch (err) {
        ops = pendientes.slice(i)
        if (i > 0) hechas.push('algunos permisos especiales')
        return fallo('No se pudieron guardar los permisos especiales de Archivos.', err)
      }
    }
    ops = []
    hechas.push('los permisos especiales de Archivos')
  }

  return {
    ok: true,
    mensajeExito: 'Cambios guardados.',
    base: actual,
    grantOps: ops,
  }
}

function jefesEfectivosDe(role: UserRole, ids: string[]): string[] {
  return role === 'admin' ? ids : []
}

function rolAsignable(role: UserRole): 'admin' | 'user' {
  return role === 'admin' ? 'admin' : 'user'
}

function permisosIguales(a: UserPermissions, b: UserPermissions): boolean {
  return CLAVES_PERMISO.every((clave) => a[clave] === b[clave])
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const ordenA = [...a].sort()
  const ordenB = [...b].sort()
  return ordenA.every((valor, indice) => valor === ordenB[indice])
}

function clonarSnapshot(base: SnapshotFicha): SnapshotFicha {
  return {
    ...base,
    memberAreaIds: [...base.memberAreaIds],
    managedAreaIds: [...base.managedAreaIds],
    permissions: { ...base.permissions },
    actionGrants: clonarGrants(base.actionGrants),
  }
}

function clonarGrants(grants: ActionGrants): ActionGrants {
  const copia: ActionGrants = {}
  for (const action of GOVERNANCE_ACTIONS) {
    const ids = grants[action]
    if (ids && ids.length > 0) copia[action] = [...ids]
  }
  return copia
}

function unir(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}
