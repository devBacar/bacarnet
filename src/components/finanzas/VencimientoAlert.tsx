import type { VencimientoAlerta } from '../../services/finanzasAgendaApi'

const LABEL: Record<VencimientoAlerta, string | null> = {
  vencido: 'Vencido',
  proximo: 'Vence hoy o mañana',
  neutro: null,
}

const BORDER: Record<VencimientoAlerta, string> = {
  vencido: 'border-l-4 border-l-red-500',
  proximo: 'border-l-4 border-l-amber-500',
  neutro: 'border-l-4 border-l-transparent',
}

/** Etiqueta/borde de vencimiento — no usa semáforo de descubierto. */
export function vencimientoRowClass(alerta: VencimientoAlerta): string {
  return BORDER[alerta]
}

export function VencimientoAlertTag({ alerta }: { alerta: VencimientoAlerta }) {
  const label = LABEL[alerta]
  if (!label) return null
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
        alerta === 'vencido'
          ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
          : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
      }`}
    >
      {label}
    </span>
  )
}
