import { useState } from 'react'
import type { IdPlanRrhh, PlanesRrhh } from '../../services/rrhhApi'
import { numero, pesosCorto } from './formatoRrhh'
import { BandaRrhh, NotaRrhh, PocasPalabras, TituloDetalle } from './ResumenSimpleRrhh'
import { TarjetaRrhh } from './TarjetaRrhh'

const ESTILO_PLAN: Record<IdPlanRrhh, { borde: string; fondo: string; chip: string }> = {
  suave: { borde: 'border-sky-600', fondo: 'bg-sky-50 dark:bg-sky-950/30', chip: 'bg-sky-600' },
  medio: { borde: 'border-emerald-700', fondo: 'bg-emerald-50 dark:bg-emerald-950/30', chip: 'bg-emerald-700' },
  brusco: { borde: 'border-orange-600', fondo: 'bg-orange-50 dark:bg-orange-950/30', chip: 'bg-orange-600' },
}

const ESFUERZO: Record<IdPlanRrhh, string> = {
  suave: 'Se puede empezar este mes. No suma personal.',
  medio: 'Requiere aprobar ingresos y hablar con los jefes de cada área.',
  brusco: 'Requiere aprobar más ingresos, acuerdos con clientes y cambios de turnos.',
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

/** Plan de ahorro: tres opciones (suave, medio, brusco) para que el Directorio decida. */
export function PlanAhorroRrhh({ planes }: { planes: PlanesRrhh }) {
  const [elegido, setElegido] = useState<IdPlanRrhh>('medio')
  const plan = planes.planes.find((p) => p.id === elegido) ?? planes.planes[0]
  const brusco = planes.planes.find((p) => p.id === 'brusco')
  const f = planes.factores

  return (
    <div className="grid gap-5">
      <BandaRrhh titulo="Plan para bajar las horas extra" subtitulo="Tres opciones, de menor a mayor esfuerzo, con lo que ahorraría la empresa" tono="plan" />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-slate-100 p-4 dark:bg-zinc-800">
          <p className="text-[15px] text-neutral-700 dark:text-gray-300">Hoy se gastan en horas extra que se pueden reducir</p>
          <p className="text-[30px] font-bold tabular-nums text-neutral-900 dark:text-gray-100">{pesosCorto(planes.gastoMensualReducible)}</p>
          <p className="text-[14px] text-neutral-600 dark:text-gray-400">
            por mes (promedio de los últimos 3 meses), sin contar {pesosCorto(planes.pactadasMensual)} de horas pactadas
          </p>
        </div>
        <div className="rounded-xl bg-slate-100 p-4 dark:bg-zinc-800">
          <p className="text-[15px] text-neutral-700 dark:text-gray-300">Cada $ 100 que se pagan en horas extra le cuestan a la empresa</p>
          <p className="text-[30px] font-bold tabular-nums text-neutral-900 dark:text-gray-100">$ {Math.round(f.total * 100)}</p>
          <p className="text-[14px] text-neutral-600 dark:text-gray-400">sumando contribuciones, aguinaldo, provisiones y vacaciones</p>
        </div>
      </div>

      <section>
        <h3 className="mb-3 text-[20px] font-semibold text-[#1f3b63] dark:text-blue-300">Elegí un plan para ver qué incluye</h3>
        <div className="grid gap-3 lg:grid-cols-3" role="tablist" aria-label="Planes de reducción">
          {planes.planes.map((p) => {
            const e = ESTILO_PLAN[p.id]
            const activo = p.id === elegido
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => setElegido(p.id)}
                className={`rounded-xl border-[3px] p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${e.borde} ${
                  activo ? e.fondo : 'bg-white opacity-90 hover:opacity-100 dark:bg-zinc-900'
                }`}
              >
                <span className={`inline-block rounded-full px-3 py-0.5 text-[13px] font-bold uppercase text-white ${e.chip}`}>{p.nombre}</span>
                <p className="mt-2 text-[14px] text-neutral-600 dark:text-gray-400">Ahorro por año</p>
                <p className="text-[32px] font-bold leading-tight tabular-nums text-emerald-700 dark:text-emerald-400">{pesosCorto(p.ahorroAnual)}</p>
                <p className="text-[15px] text-neutral-700 dark:text-gray-300">
                  unos {pesosCorto(p.ahorroMensual)} por mes · <strong>{pct(p.porcentaje)} menos</strong>
                </p>
                <ul className="mt-3 grid gap-1 text-[15px] text-neutral-800 dark:text-gray-200">
                  <li>
                    Personas a tomar: <strong>{p.personasAContratar}</strong>
                  </li>
                  <li>
                    Horas extra menos por mes: <strong>{numero(p.horasMenosPorMes)}</strong>
                  </li>
                </ul>
                <p className="mt-3 text-[14px] leading-snug text-neutral-600 dark:text-gray-400">{p.descripcion}</p>
                <p className="mt-1 text-[13.5px] font-medium text-neutral-700 dark:text-gray-300">{ESFUERZO[p.id]}</p>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-[20px] font-semibold text-[#1f3b63] dark:text-blue-300">{plan.nombre}: qué hay que hacer</h3>
        {plan.costoContratacionesMes > 0 ? (
          <p className="mt-1 text-[15px] text-neutral-700 dark:text-gray-300">
            Las {plan.personasAContratar} personas nuevas cuestan {pesosCorto(plan.costoContratacionesMes)} por mes; ese costo ya está descontado del ahorro.
          </p>
        ) : null}
        <ol className="mt-4 grid gap-3">
          {plan.medidas.map((m, i) => (
            <li key={m.id} className="rounded-xl border-2 border-neutral-200 p-4 dark:border-zinc-700">
              <div className="grid grid-cols-[40px_1fr] items-start gap-4 sm:grid-cols-[40px_1fr_170px]">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-700 text-[19px] font-bold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[18px] font-semibold text-neutral-900 dark:text-gray-100">{m.titulo}</p>
                  <p className="mt-1 text-[16px] leading-snug text-neutral-700 dark:text-gray-300">{m.explicacion}</p>
                  {m.requiere ? <p className="mt-1 text-[14px] font-medium text-amber-800 dark:text-amber-300">{m.requiere}</p> : null}
                </div>
                <p className="col-start-2 text-left sm:col-start-3 sm:text-right">
                  <span className="block text-[13.5px] text-neutral-500 dark:text-gray-400">ahorro por año</span>
                  <strong className="block text-[24px] tabular-nums text-emerald-700 dark:text-emerald-400">{pesosCorto(m.ahorroAnual)}</strong>
                </p>
              </div>
              <ul className="mt-3 grid gap-1.5 border-t border-neutral-100 pt-3 text-[15px] dark:border-zinc-800 sm:ml-14">
                {m.areas.map((a) => (
                  <li key={a.cc} className="flex flex-wrap justify-between gap-x-4 text-neutral-700 dark:text-gray-300">
                    <span>
                      <strong className="text-neutral-900 dark:text-gray-100">{a.nombre}:</strong> {a.detalle}
                    </span>
                    <span className="tabular-nums text-neutral-900 dark:text-gray-100">{pesosCorto(a.ahorroAnual)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <PocasPalabras
        titulo="¿Se pueden bajar más las horas extra?"
        frases={[
          <>
            Con estas medidas, lo máximo es el <strong>plan brusco: {brusco ? pct(brusco.porcentaje) : '—'} menos de gasto</strong>, aunque las horas extra bajan mucho más (
            {brusco ? numero(brusco.horasMenosPorMes) : '—'} horas por mes).
          </>,
          'La diferencia se explica porque en varias áreas una persona nueva cuesta casi lo mismo que las horas extra que reemplaza: tomar gente sirve sobre todo para cumplir el máximo legal, no tanto para ahorrar.',
          'Bajar más requiere cambiar los servicios: renegociar con clientes los horarios y los feriados, o cobrarles los recargos.',
          'Las horas pactadas (acuerdos individuales) no entran en ningún plan.',
        ]}
      />

      <TituloDetalle>Detalle para RRHH y gerencia</TituloDetalle>

      <TarjetaRrhh
        titulo="¿Conviene tomar personal o pagar horas extra?"
        subtitulo="Por área, con el costo laboral completo que calcula Salario."
        pie="Una persona nueva no trabaja todo el mes: se descuentan las vacaciones y licencias promedio del área."
      >
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[12.5px] text-neutral-600 dark:text-gray-400">
                <th className="py-2 pr-2 font-semibold">Área</th>
                <th className="px-2 py-2 text-right font-semibold">Una persona más cuesta por mes</th>
                <th className="px-2 py-2 text-right font-semibold">Horas extra que reemplaza</th>
                <th className="px-2 py-2 text-right font-semibold">Diferencia por persona</th>
                <th className="px-2 py-2 font-semibold">¿Conviene?</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {planes.contratacion.map((c) => (
                <tr key={c.cc} className="border-t border-neutral-100 dark:border-zinc-800">
                  <td className="py-2.5 pr-2 text-neutral-900 dark:text-gray-100">
                    {c.nombre}
                    <span className="block text-[12.5px] text-neutral-500 dark:text-gray-400">equivale a {numero(c.puestosEquivalentes)} puestos</span>
                  </td>
                  <td className="px-2 py-2.5 text-right">{pesosCorto(c.costoPersonaMes)}</td>
                  <td className="px-2 py-2.5 text-right">{pesosCorto(c.horasExtraQueReemplaza)}</td>
                  <td className={`px-2 py-2.5 text-right font-semibold ${c.conviene ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                    {c.ahorroPorPersonaMes >= 0 ? '' : '−'}
                    {pesosCorto(Math.abs(c.ahorroPorPersonaMes))}
                  </td>
                  <td className="px-2 py-2.5 text-[13.5px]">
                    {c.conviene
                      ? `Sí, mientras uniforme, capacitación y otros gastos que no pasan por Salario no superen ${pesosCorto(c.margenOtrosCostosMes)} por persona y por mes.`
                      : 'No por costo. Solo para cumplir el máximo legal.'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TarjetaRrhh>

      <TarjetaRrhh titulo="Cómo se calculó">
        <ul className="grid list-disc gap-2 pl-5 text-[14.5px] leading-snug text-neutral-700 dark:text-gray-300">
          {planes.supuestos.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {!f.medido ? (
          <div className="mt-3">
            <NotaRrhh>No se pudieron medir las contribuciones con este backup: se usaron las de septiembre de 2026.</NotaRrhh>
          </div>
        ) : null}
      </TarjetaRrhh>
    </div>
  )
}
