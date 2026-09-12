import type { HelpdeskUrgencia } from '../../services/helpdeskApi'

export function formatHelpdeskDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function helpdeskUrgenciaBadgeClass(urgencia: HelpdeskUrgencia): string {
  switch (urgencia) {
    case 'baja':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'media':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200'
    case 'alta':
      return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200'
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-700'
  }
}

export function helpdeskUrgenciaLabel(urgencia: HelpdeskUrgencia): string {
  return urgencia.charAt(0).toUpperCase() + urgencia.slice(1)
}

export function helpdeskReunionEstadoLabel(estado: string): string {
  switch (estado) {
    case 'confirmada':
      return 'Confirmada'
    case 'rechazada':
      return 'Rechazada'
    default:
      return 'Pendiente'
  }
}
