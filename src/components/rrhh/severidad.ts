import type { SeveridadRrhh } from '../../services/rrhhApi'

export const ETIQUETA_SEVERIDAD: Record<SeveridadRrhh, string> = {
  urgente: 'Urgente',
  alta: 'Importante',
  media: 'A considerar',
  oportunidad: 'Oportunidad',
}

/** Borde izquierdo / superior según severidad. */
export const BORDE_SEVERIDAD: Record<SeveridadRrhh, string> = {
  urgente: 'border-red-600 dark:border-red-500',
  alta: 'border-orange-500 dark:border-orange-400',
  media: 'border-amber-400 dark:border-amber-400',
  oportunidad: 'border-emerald-600 dark:border-emerald-500',
}

/** Píldora con punto + texto (la severidad nunca se comunica solo con color). */
export const PILDORA_SEVERIDAD: Record<SeveridadRrhh, { fondo: string; punto: string }> = {
  urgente: { fondo: 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200', punto: 'bg-red-600' },
  alta: { fondo: 'bg-orange-50 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200', punto: 'bg-orange-500' },
  media: { fondo: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200', punto: 'bg-amber-400' },
  oportunidad: {
    fondo: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
    punto: 'bg-emerald-600',
  },
}

export const ORDEN_SEVERIDAD: Record<SeveridadRrhh, number> = { urgente: 0, alta: 1, media: 2, oportunidad: 3 }
