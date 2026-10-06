import type { GoverningArea } from '../../services/areaService'
import { countActionGrantEntries } from '../../services/governanceAccess'
import {
  isAccountPending,
  isAccountRejected,
  isExternalAccount,
  type UserProfile,
} from '../../services/userService'
import {
  PERFILES_FINANZAS,
  flagsFinanzasDe,
  perfilDePermisos,
  type FlagsPermisosFinanzas,
  type PerfilFinanzas,
} from '../finanzas/permisosFinanzas'

export type TonoChip = 'area' | 'modulo' | 'especial' | 'cuenta' | 'pendiente' | 'rechazo'

export interface ChipVisible {
  id: string
  texto: string
  tono: TonoChip
}

const PALETA_AVATAR = [
  { fondo: 'bg-sky-100 dark:bg-sky-950/60', texto: 'text-sky-950 dark:text-sky-100' },
  { fondo: 'bg-emerald-100 dark:bg-emerald-950/60', texto: 'text-emerald-950 dark:text-emerald-100' },
  { fondo: 'bg-amber-100 dark:bg-amber-950/60', texto: 'text-amber-950 dark:text-amber-100' },
  { fondo: 'bg-violet-100 dark:bg-violet-950/60', texto: 'text-violet-950 dark:text-violet-100' },
  { fondo: 'bg-rose-100 dark:bg-rose-950/60', texto: 'text-rose-950 dark:text-rose-100' },
  { fondo: 'bg-teal-100 dark:bg-teal-950/60', texto: 'text-teal-950 dark:text-teal-100' },
] as const

const FRASES_FINANZAS: { clave: keyof FlagsPermisosFinanzas; texto: string }[] = [
  { clave: 'view_finanzas', texto: 'Ver todo' },
  { clave: 'finanzas_agenda', texto: 'compromisos y cobros' },
  { clave: 'finanzas_cheques', texto: 'cheques' },
  { clave: 'finanzas_categorias', texto: 'categorías' },
  { clave: 'finanzas_transferencias', texto: 'transferencias' },
  { clave: 'finanzas_destinatarios', texto: 'destinatarios' },
  { clave: 'finanzas_saldos', texto: 'saldos' },
  { clave: 'manage_finanzas_caja', texto: 'cajas' },
]

export const MODULOS_USO: {
  clave: 'view_directory' | 'view_drive' | 'rag_assistant'
  titulo: string
  ayuda: string
}[] = [
  {
    clave: 'view_directory',
    titulo: 'Contactos',
    ayuda: 'Puede ver los contactos de la empresa.',
  },
  {
    clave: 'view_drive',
    titulo: 'Archivos',
    ayuda: 'Puede ver los archivos de su área.',
  },
  {
    clave: 'rag_assistant',
    titulo: 'Asistente BacarNet',
    ayuda: 'Puede hacerle preguntas al asistente.',
  },
]

export type NivelRrhh = 'sin_acceso' | 'directorio' | 'rrhh'

export const NIVELES_RRHH: { id: NivelRrhh; label: string; ayuda: string }[] = [
  { id: 'sin_acceso', label: 'Sin acceso', ayuda: 'No entra a RRHH.' },
  {
    id: 'directorio',
    label: 'Directorio',
    ayuda: 'Ve horas extra, costos y proyección por área. Sin datos por persona.',
  },
  {
    id: 'rrhh',
    label: 'RRHH',
    ayuda: 'Ve todo, incluido el detalle por legajo.',
  },
]

export function nivelRrhhDe(permissions: { view_rrhh?: boolean; rrhh_detalle?: boolean }): NivelRrhh {
  if (permissions.rrhh_detalle === true) return 'rrhh'
  if (permissions.view_rrhh === true) return 'directorio'
  return 'sin_acceso'
}

export function permisosDeNivelRrhh(nivel: NivelRrhh): { view_rrhh: boolean; rrhh_detalle: boolean } {
  return { view_rrhh: nivel !== 'sin_acceso', rrhh_detalle: nivel === 'rrhh' }
}

export const INTERRUPTORES_FINANZAS: {
  clave: keyof FlagsPermisosFinanzas
  titulo: string
  ayuda: string
  pideVer: boolean
}[] = [
  {
    clave: 'view_finanzas',
    titulo: 'Ver todas las pantallas',
    ayuda: 'Hoy, Saldos, Agenda, Cajas, Transferencias, Movimientos, Extractos y Cheques.',
    pideVer: false,
  },
  {
    clave: 'finanzas_agenda',
    titulo: 'Cargar y pagar la agenda',
    ayuda: 'Compromisos y cobros: cargarlos, pagarlos, marcarlos como pagados y cambiarles la fecha.',
    pideVer: true,
  },
  {
    clave: 'finanzas_cheques',
    titulo: 'Cheques',
    ayuda: 'Importar, ingresar y cambiar el estado de los cheques.',
    pideVer: true,
  },
  {
    clave: 'finanzas_categorias',
    titulo: 'Categorías y reglas',
    ayuda: 'Ordenar categorías, reglas y anotar los movimientos.',
    pideVer: true,
  },
  {
    clave: 'finanzas_transferencias',
    titulo: 'Armar y cancelar transferencias',
    ayuda: 'Igual se firman con token en Interbanking.',
    pideVer: true,
  },
  {
    clave: 'finanzas_destinatarios',
    titulo: 'Destinatarios',
    ayuda: 'Agregar, editar y borrar a quién se le transfiere.',
    pideVer: true,
  },
  {
    clave: 'finanzas_saldos',
    titulo: 'Saldos y descubierto',
    ayuda: 'Cambiar el descubierto, el saldo cargado a mano y guardar el historial.',
    pideVer: true,
  },
  {
    clave: 'manage_finanzas_caja',
    titulo: 'Líder de cajas',
    ayuda: 'Crear cajas, fondear y aprobar cierres.',
    pideVer: false,
  },
]

export function inicialesDe(nombre: string, email: string): string {
  const base = nombre.trim() || email.trim()
  const partes = base.split(/\s+/).filter(Boolean)
  if (partes.length >= 2) {
    return `${partes[0].charAt(0)}${partes[1].charAt(0)}`.toUpperCase()
  }
  return (partes[0] ?? '?').slice(0, 2).toUpperCase()
}

export function coloresAvatar(clave: string): { fondo: string; texto: string } {
  let hash = 0
  for (let i = 0; i < clave.length; i += 1) {
    hash = (hash * 31 + clave.charCodeAt(i)) >>> 0
  }
  return PALETA_AVATAR[hash % PALETA_AVATAR.length]
}

export function etiquetaPerfil(perfil: PerfilFinanzas): string {
  return PERFILES_FINANZAS.find((item) => item.id === perfil)?.label ?? 'Sin acceso'
}

export function resumenFinanzas(flags: FlagsPermisosFinanzas): string {
  const partes = FRASES_FINANZAS.filter((item) => flags[item.clave]).map((item) => item.texto)
  if (partes.length === 0) return 'No entra a Finanzas.'
  const linea = partes.join(' · ')
  return `${linea.charAt(0).toUpperCase()}${linea.slice(1)}.`
}

export function nombresPorId(areas: GoverningArea[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const area of areas) {
    if (area.id) mapa.set(area.id, area.name)
  }
  return mapa
}

export function filtrarUsuarios(
  users: UserProfile[],
  busqueda: string,
  areaId: string,
  rol: string,
): UserProfile[] {
  const texto = normalizarBusqueda(busqueda)
  return users.filter((user) => {
    if (rol && user.role !== rol) return false
    if (areaId) {
      const pertenece =
        (user.memberAreaIds ?? []).includes(areaId) || (user.managedAreaIds ?? []).includes(areaId)
      if (!pertenece) return false
    }
    if (!texto) return true
    const nombre = normalizarBusqueda(user.displayName || '')
    const email = normalizarBusqueda(user.email || '')
    return nombre.includes(texto) || email.includes(texto)
  })
}

export function normalizarBusqueda(valor: string): string {
  return valor
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function chipsDeUsuario(
  user: UserProfile,
  nombresArea: Map<string, string>,
): ChipVisible[] {
  const chips: ChipVisible[] = []

  if (user.role === 'super_admin') {
    chips.push({ id: 'todas-areas', texto: 'Todas las áreas', tono: 'area' })
  } else {
    const jefes = new Set(user.managedAreaIds ?? [])
    const ids = new Set([...(user.memberAreaIds ?? []), ...jefes])
    const areas = [...ids]
      .map((id) => {
        const nombre = nombresArea.get(id) ?? 'Área'
        return {
          id: `area-${id}`,
          texto: jefes.has(id) ? `${nombre} · jefe` : nombre,
          tono: 'area' as const,
          orden: nombre,
        }
      })
      .sort((a, b) => a.orden.localeCompare(b.orden, 'es'))
    for (const area of areas) {
      chips.push({ id: area.id, texto: area.texto, tono: area.tono })
    }
  }

  if (user.permissions.view_directory) {
    chips.push({ id: 'contactos', texto: 'Contactos', tono: 'modulo' })
  }
  if (user.permissions.view_drive) {
    chips.push({ id: 'archivos', texto: 'Archivos', tono: 'modulo' })
  }
  if (user.permissions.rag_assistant) {
    chips.push({ id: 'asistente', texto: 'Asistente', tono: 'modulo' })
  }

  const perfil = perfilDePermisos(flagsFinanzasDe(user.permissions))
  if (perfil !== 'sin_acceso') {
    chips.push({
      id: 'finanzas',
      texto: `Finanzas · ${etiquetaPerfil(perfil)}`,
      tono: 'modulo',
    })
  }

  const nivelRrhh = nivelRrhhDe(user.permissions)
  if (nivelRrhh !== 'sin_acceso') {
    chips.push({
      id: 'rrhh',
      texto: `RRHH · ${NIVELES_RRHH.find((item) => item.id === nivelRrhh)?.label ?? ''}`,
      tono: 'modulo',
    })
  }

  if (countActionGrantEntries(user.actionGrants) > 0) {
    chips.push({ id: 'especiales', texto: 'Permisos especiales', tono: 'especial' })
  }

  if (isAccountPending(user)) {
    chips.push({ id: 'pendiente', texto: 'Pendiente', tono: 'pendiente' })
  } else if (isAccountRejected(user)) {
    chips.push({ id: 'rechazada', texto: 'Rechazada', tono: 'rechazo' })
  }

  if (isExternalAccount(user)) {
    chips.push({ id: 'externa', texto: 'Cuenta externa', tono: 'cuenta' })
  }

  return chips
}
