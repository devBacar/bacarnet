import type { ChequeDireccion, ChequeEstado } from '../../services/finanzasChequesApi'

const ESTADO_STYLE: Record<ChequeEstado, string> = {
  en_cartera: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
  depositado: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  endosado: 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200',
  vendido: 'bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200',
  acreditado: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
  emitido: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
  entregado: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  debitado: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
  anulado: 'bg-neutral-200 text-neutral-800 dark:bg-zinc-800 dark:text-zinc-200',
  rechazado: 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200',
}

interface ChequeEstadoBadgeProps {
  label: string
  estado: ChequeEstado
  direccion?: ChequeDireccion
}

export function ChequeEstadoBadge({ label, estado, direccion = 'recibido' }: ChequeEstadoBadgeProps) {
  const emitidoRechazado = direccion === 'emitido' && estado === 'rechazado'
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_STYLE[estado]} ${
        emitidoRechazado ? 'ring-2 ring-red-600 dark:ring-red-500' : ''
      }`}
    >
      {label}
    </span>
  )
}

/** Alerta grave: rechazo de cheque emitido (riesgo bancario). */
export function ChequeEmitidoRechazadoAlert({ motivo }: { motivo: string | null }) {
  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-red-600 bg-red-50 p-4 dark:border-red-500 dark:bg-red-950/40"
    >
      <p className="text-sm font-bold uppercase tracking-wide text-red-800 dark:text-red-200">
        Cheque emitido rechazado
      </p>
      <p className="mt-2 text-sm text-red-900 dark:text-red-100">
        Un rechazo sobre cheques propios puede derivar en inhabilitación de la chequera o restricciones
        bancarias. Coordiná de inmediato con el banco y tesorería.
      </p>
      {motivo ? (
        <p className="mt-2 text-sm font-medium text-red-800 dark:text-red-200">Motivo: {motivo}</p>
      ) : null}
    </div>
  )
}
