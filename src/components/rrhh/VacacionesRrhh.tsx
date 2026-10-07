import type { AreaRrhh } from '../../services/rrhhApi'
import { mesCorto, numero } from './formatoRrhh'

/** Cuántos días de vacaciones se pueden dar por mes sin generar horas extra, contra lo ya cargado en Salario. */
export function VacacionesRrhh({ areas, meses }: { areas: AreaRrhh[]; meses: string[] }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-gray-400">
            <th className="py-1.5 pr-2 text-left font-semibold">Área</th>
            <th className="px-2 py-1.5 text-right font-semibold">Derecho</th>
            <th className="px-2 py-1.5 text-right font-semibold">Ya otorgado</th>
            <th className="px-2 py-1.5 text-right font-semibold">Pendiente</th>
            {meses.map((m) => (
              <th key={m} className="px-2 py-1.5 text-right font-semibold leading-tight">
                {mesCorto(m)}
                <span className="block font-normal normal-case">libres / cargados</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {areas.map((a) => (
            <tr key={a.cc} className="border-t border-neutral-100 align-top dark:border-zinc-800">
              <td className="py-2 pr-2 text-left">
                <span className="text-neutral-900 dark:text-gray-100">{a.nombre}</span>
                <span className="block text-[12px] text-neutral-500 dark:text-gray-400">{a.convenioNombre}</span>
              </td>
              <td className="px-2 py-2 text-right">{numero(a.vacaciones.derecho)}</td>
              <td className="px-2 py-2 text-right">{numero(a.vacaciones.otorgado)}</td>
              <td className="px-2 py-2 text-right font-semibold">{numero(a.vacaciones.pendiente)}</td>
              {meses.map((mes) => {
                const f = a.meses.find((x) => x.mes === mes)
                const cargados = numero(f?.vacacionesProgramadas ?? 0)
                if (!f || f.cupoVacaciones === undefined) {
                  return (
                    <td key={mes} className="px-2 py-2 text-right">
                      <span className="text-[12px] text-neutral-500 dark:text-gray-400">sin margen</span>
                      <span className="block">{cargados}</span>
                    </td>
                  )
                }
                const libres = f.vacacionesLibres ?? 0
                const hay = a.modelo.umbralHoras > 0 && libres > 14
                return (
                  <td key={mes} className="px-2 py-2 text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                        hay
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                          : 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200'
                      }`}
                    >
                      {hay ? numero(libres) : '0'}
                    </span>
                    <span className="block">{cargados}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
