import type { UserRole } from '../../services/userService'

const ESTILO: Record<UserRole, string> = {
  super_admin: 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200',
  admin: 'bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
  user: 'bg-neutral-100 text-neutral-600 dark:bg-zinc-800 dark:text-gray-300',
}

const TEXTO: Record<UserRole, string> = {
  super_admin: 'Super admin',
  admin: 'Administrador de área',
  user: 'Usuario',
}

export function EtiquetaRol({ rol }: { rol: UserRole }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTILO[rol]}`}>
      {TEXTO[rol]}
    </span>
  )
}
