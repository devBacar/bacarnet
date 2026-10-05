import { useAuth } from '../../context'
import {
  permisosFinanzasDe,
  type PermisosFinanzasEfectivos,
  type UserPermissions,
} from '../../services/userService'

export type PerfilFinanzas = 'sin_acceso' | 'solo_consulta' | 'operador' | 'lider' | 'personalizado'

export type PerfilFinanzasFijo = Exclude<PerfilFinanzas, 'personalizado'>

export interface FlagsPermisosFinanzas {
  view_finanzas: boolean
  finanzas_agenda: boolean
  finanzas_cheques: boolean
  finanzas_categorias: boolean
  finanzas_transferencias: boolean
  finanzas_destinatarios: boolean
  finanzas_saldos: boolean
  manage_finanzas_caja: boolean
}

const CLAVES: (keyof FlagsPermisosFinanzas)[] = [
  'view_finanzas',
  'finanzas_agenda',
  'finanzas_cheques',
  'finanzas_categorias',
  'finanzas_transferencias',
  'finanzas_destinatarios',
  'finanzas_saldos',
  'manage_finanzas_caja',
]

const SIN_ACCESO: FlagsPermisosFinanzas = {
  view_finanzas: false,
  finanzas_agenda: false,
  finanzas_cheques: false,
  finanzas_categorias: false,
  finanzas_transferencias: false,
  finanzas_destinatarios: false,
  finanzas_saldos: false,
  manage_finanzas_caja: false,
}

export const PERFILES_FINANZAS: { id: PerfilFinanzas; label: string }[] = [
  { id: 'sin_acceso', label: 'Sin acceso' },
  { id: 'solo_consulta', label: 'Solo consulta' },
  { id: 'operador', label: 'Operador' },
  { id: 'lider', label: 'Líder de Finanzas' },
  { id: 'personalizado', label: 'Personalizado' },
]

export function permisosDePerfil(perfil: PerfilFinanzasFijo): FlagsPermisosFinanzas {
  if (perfil === 'sin_acceso') return { ...SIN_ACCESO }
  if (perfil === 'solo_consulta') return { ...SIN_ACCESO, view_finanzas: true }
  if (perfil === 'operador') {
    return { ...SIN_ACCESO, view_finanzas: true, finanzas_agenda: true, finanzas_cheques: true }
  }
  return {
    view_finanzas: true,
    finanzas_agenda: true,
    finanzas_cheques: true,
    finanzas_categorias: true,
    finanzas_transferencias: true,
    finanzas_destinatarios: true,
    finanzas_saldos: true,
    manage_finanzas_caja: true,
  }
}

export function flagsFinanzasDe(permissions: Partial<UserPermissions> | null | undefined): FlagsPermisosFinanzas {
  return {
    view_finanzas: permissions?.view_finanzas === true,
    finanzas_agenda: permissions?.finanzas_agenda === true,
    finanzas_cheques: permissions?.finanzas_cheques === true,
    finanzas_categorias: permissions?.finanzas_categorias === true,
    finanzas_transferencias: permissions?.finanzas_transferencias === true,
    finanzas_destinatarios: permissions?.finanzas_destinatarios === true,
    finanzas_saldos: permissions?.finanzas_saldos === true,
    manage_finanzas_caja: permissions?.manage_finanzas_caja === true,
  }
}

function mismasFlags(a: FlagsPermisosFinanzas, b: FlagsPermisosFinanzas): boolean {
  return CLAVES.every((clave) => a[clave] === b[clave])
}

export function perfilDePermisos(perms: FlagsPermisosFinanzas): PerfilFinanzas {
  const fijos: PerfilFinanzasFijo[] = ['sin_acceso', 'solo_consulta', 'operador', 'lider']
  for (const perfil of fijos) {
    if (mismasFlags(perms, permisosDePerfil(perfil))) return perfil
  }
  return 'personalizado'
}

/** Sin "ver todas las pantallas", el resto de Finanzas queda apagado. Líder de cajas se mantiene. */
export function apagarFinanzasSinVista(permissions: UserPermissions): UserPermissions {
  if (permissions.view_finanzas) return permissions
  return {
    ...permissions,
    finanzas_agenda: false,
    finanzas_cheques: false,
    finanzas_categorias: false,
    finanzas_transferencias: false,
    finanzas_destinatarios: false,
    finanzas_saldos: false,
  }
}

export function usePermisosFinanzas(): PermisosFinanzasEfectivos {
  const { userProfile } = useAuth()
  return permisosFinanzasDe(userProfile)
}
