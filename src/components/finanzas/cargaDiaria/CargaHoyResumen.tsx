import { formatMoneyCentavos } from '../formatMoney'
import { ComoSeCalcula } from './CargaDiariaPanel'
import { NIVEL_CLASES, NIVEL_TEXTO, diaSemana, fechaCorta, montoCorto, useCargaDiaria } from './cargaDiaria'

/**
 * Para la pantalla "Hoy": lo que hay que pagar hoy y, más abajo, el resto de la semana (7 días desde hoy).
 */
export function CargaHoyResumen() {
  const { data, isLoading, isError } = useCargaDiaria()
  if (isLoading) return <p className="text-body-muted text-sm">Calculando lo que hay que pagar…</p>
  if (isError || !data) return null

  const hoy = data.dias.find((dia) => dia.esHoy) ?? data.dias[0]
  const semana = data.dias.filter((dia) => dia.fecha > hoy.fecha).slice(0, 6)

  return (
    <section className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
      <header className="mb-3">
        <h3 className="text-heading text-sm font-semibold">Cuánto hay que pagar</h3>
      </header>

      <div className={`mb-3 rounded-xl border p-3 ${NIVEL_CLASES[hoy.nivel]}`}>
        <p className="text-xs font-semibold uppercase tracking-wide">Hoy · {NIVEL_TEXTO[hoy.nivel]}</p>
        <p className="text-xl font-bold tabular-nums">{formatMoneyCentavos(hoy.totalCentavos, 'ARS')}</p>
        <p className="text-xs">
          {hoy.tipo === 'habil'
            ? `${hoy.cantidad} pagos · falta pagar ${formatMoneyCentavos(hoy.pendienteCentavos, 'ARS')}`
            : 'Hoy no es día hábil'}
        </p>
      </div>

      <p className="text-body-muted mb-1.5 text-xs font-semibold">Los próximos días</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {semana.map((dia) => (
          <div key={dia.fecha} className={`rounded-lg border px-2 py-1.5 text-xs ${NIVEL_CLASES[dia.nivel]}`}>
            <span className="block font-semibold">
              {diaSemana(dia.fecha)} {fechaCorta(dia.fecha)}
            </span>
            <span className="block tabular-nums">{dia.tipo === 'habil' ? montoCorto(dia.totalCentavos) : '—'}</span>
            <span className="block text-[11px]">{dia.tipo === 'habil' ? NIVEL_TEXTO[dia.nivel] : 'No hábil'}</span>
          </div>
        ))}
      </div>
      <div className="mt-2">
        <ComoSeCalcula />
      </div>
    </section>
  )
}
