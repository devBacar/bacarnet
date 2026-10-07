import {
  BookOpen,
  BookUser,
  HardDrive,
  Headphones,
  Home,
  Landmark,
  LayoutDashboard,
  Link2,
  ScrollText,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/** Misma lista para el menú de escritorio y el del celular. */
export type MainNavGroup = 'principal' | 'mas' | 'ayuda'

export interface MainNavItem {
  to: string
  end?: boolean
  label: string
  icon: LucideIcon
  group: MainNavGroup
}

export function buildMainNavItems(input: {
  externalAccount: boolean
  viewLinks: boolean
  viewDirectory: boolean
  viewDrive: boolean
  directoryEnabled: boolean
  resourcesEnabled: boolean
  finanzasEnabled: boolean
  finanzasAccess: boolean
  canAccessBoards: boolean
  canAccessAudit: boolean
}): MainNavItem[] {
  const items: MainNavItem[] = [
    { to: '/intranet', end: true, label: 'Inicio', icon: Home, group: 'principal' },
  ]

  if (input.finanzasEnabled && input.finanzasAccess) {
    items.push({ to: '/finanzas', label: 'Finanzas', icon: Landmark, group: 'principal' })
  }
  if (input.directoryEnabled && input.viewDirectory) {
    items.push({ to: '/directorio', label: 'Contactos', icon: BookUser, group: 'principal' })
  }
  if (input.resourcesEnabled && input.viewDrive) {
    items.push({ to: '/recursos', label: 'Archivos', icon: HardDrive, group: 'principal' })
  }
  if (!input.externalAccount) {
    items.push({ to: '/soporte-ti', label: 'Tickets', icon: Wrench, group: 'principal' })
  }

  if (!input.externalAccount && input.viewLinks) {
    items.push({ to: '/accesos-directos', label: 'Accesos directos', icon: Link2, group: 'mas' })
  }
  if (input.canAccessBoards) {
    items.push({ to: '/tableros', label: 'Tableros', icon: LayoutDashboard, group: 'mas' })
  }
  if (!input.externalAccount) {
    items.push({
      to: '/mis-solicitudes-sistemas',
      label: 'Mis proyectos',
      icon: Headphones,
      group: 'mas',
    })
    items.push({ to: '/sistemas/mesa-ayuda', label: 'Desarrollo', icon: Headphones, group: 'mas' })
  }
  if (input.canAccessAudit) {
    items.push({ to: '/admin/auditoria', label: 'Auditoría', icon: ScrollText, group: 'mas' })
  }

  if (!input.externalAccount) {
    items.push({ to: '/ayuda', label: 'Ayuda', icon: BookOpen, group: 'ayuda' })
  }

  return items
}
