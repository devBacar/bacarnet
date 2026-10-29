import { CalendarRange } from 'lucide-react'
import { formatMoneyCentavos } from '../formatMoney'
import {
  EXPLICACION_CARGA,
  NIVEL_CLASES,
  NIVEL_TEXTO,
  buscarDia,
  diaSemana,
  fechaCorta,
  montoCorto,
  useCargaDiaria,
} from './cargaDiaria'

export function ComoSeCalcula() {
  return (
    <details className="text-body-muted text-xs">
      <summary className="cursor-pointer font-medium">¿Cómo se calcula?</summary>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        {EXPLICACION_CARGA.map((linea) => (
          <li key={linea}>{linea}</li>
        ))}
      </ul>
    </details>
  )
}

/** Etiqueta chica para ponerle al lado de una fecha elegida: "Día liviano · $ 350 M". */
export function EtiquetaCargaDia({ fecha }: { fecha: string }) {
  const { data } = useCargaDiaria()
  const dia = fecha ? buscarDia(data, fecha) : null
  if (!dia) return null
  const texto =
    dia.tipo !== 'habil'
      ? 'No es día hábil: los pagos se cuentan en el hábil anterior'
      : `${NIVEL_TEXTO[dia.nivel]} · ${montoCorto(dia.totalCentavos)}`
  return (
    <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[11px] ${NIVEL_CLASES[dia.nivel]}`}>
      {texto}
    </span>
  )
}

/**
 * Calendario de los próximos 30 días con el nivel de carga de pagos de cada uno.
 * Sirve para elegir en qué día conviene que venzan los cheques que se van a emitir.
 */
export function CargaDiariaPanel({
  diaElegido,
  onElegirDia,
}: {
  diaElegido?: string
  onElegirDia?: (fecha: string) => void
}) {
  const { data, isLoading, isError } = useCargaDiaria()

  if (isLoading) return <p className="text-body-muted text-sm">Calculando cuánto hay que pagar cada día…</p>
  if (isError || !data) return <p className="text-danger text-sm">No se pudo calcular la carga de pagos de los próximos días.</p>

  const livianos = data.diasMasLivianos
    .map((fecha) => buscarDia(data, fecha))
    .filter((dia): dia is NonNullable<typeof dia> => dia != null)
    .slice(0, 5)

  return (
    <section className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4" aria-hidden />
        <h3 className="text-heading text-sm font-semibold">¿Qué día conviene que venzan los cheques?</h3>
      </header>
      <p className="text-body-muted mb-3 text-xs">
        Verde: pocos pagos ese día, conviene meter cheques. Rojo: ya hay mucho para pagar.
      </p>

      {livianos.length > 0 ? (
        <p className="mb-3 text-xs">
          <span className="font-semibold">Días más livianos:</span>{' '}
          {livianos.map((dia, i) => (
            <button
              key={dia.fecha}
              type="button"
              className="mr-1.5 underline decoration-dotted"
              onClick={() => onElegirDia?.(dia.fecha)}
            >
              {diaSemana(dia.fecha)} {fechaCorta(dia.fecha)}
              {i < livianos.length - 1 ? ',' : ''}
            </button>
          ))}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {data.dias.map((dia) => {
          const elegido = dia.fecha === diaElegido
          const habil = dia.tipo === 'habil'
          return (
            <button
              key={dia.fecha}
              type="button"
              disabled={!onElegirDia}
              onClick={() => onElegirDia?.(dia.fecha)}
              title={
                habil
                  ? `${formatMoneyCentavos(dia.totalCentavos, 'ARS')} en ${dia.cantidad} pagos`
                  : 'Sábado, domingo o feriado'
              }
              className={`rounded-lg border px-2 py-1.5 text-left text-xs ${NIVEL_CLASES[dia.nivel]} ${
                elegido ? 'ring-2 ring-blue-500' : ''
              } ${habil ? '' : 'opacity-60'}`}
            >
              <span className="block font-semibold">
                {diaSemana(dia.fecha)} {fechaCorta(dia.fecha)}
                {dia.esHoy ? ' · hoy' : ''}
              </span>
              <span className="block tabular-nums">{habil ? montoCorto(dia.totalCentavos) : '—'}</span>
              <span className="block text-[11px]">{habil ? NIVEL_TEXTO[dia.nivel] : 'No hábil'}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {data.meses.map((mes) => (
          <span key={mes.mes} className="text-body-muted">
            Promedio por día hábil en {mes.mes}: <strong>{montoCorto(mes.promedioCentavos)}</strong>
          </span>
        ))}
      </div>
      <div className="mt-2">
        <ComoSeCalcula />
      </div>
    </section>
  )
}
