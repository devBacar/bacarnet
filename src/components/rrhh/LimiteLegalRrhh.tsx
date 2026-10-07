import type { AreaRrhh, PersonaLimiteRrhh } from '../../services/rrhhApi'
import { numero } from './formatoRrhh'

const LIMITE_ANUAL = 200
const LIMITE_MENSUAL = 30

function Estado({ p }: { p: PersonaLimiteRrhh }) {
  if (p.acumuladoAnio > LIMITE_ANUAL) {
    return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[12px] font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200">Superó 200 h</span>
  }
  if (p.proyeccionAnio > LIMITE_ANUAL) {
    return <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[12px] font-semibold text-orange-800 dark:bg-orange-950/50 dark:text-orange-200">Va a superar</span>
  }
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">+30 h en el mes</span>
}

/** Límite legal: resumen por área (todos) y, si tiene permiso de detalle, la lista por persona. */
export function LimiteLegalRrhh({
  areas,
  personas,
  ultimoMes,
}: {
  areas: AreaRrhh[]
  personas: PersonaLimiteRrhh[] | null
  ultimoMes: string
}) {
  const conCasos = areas.filter((a) => a.limite.superaron + a.limite.vanASuperar + a.limite.masDe30EnElMes > 0)
  return (
    <div className="grid gap-4">
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-gray-400">
              <th className="py-1.5 pr-2 text-left font-semibold">Área</th>
              <th className="px-2 py-1.5 text-right font-semibold">Superaron 200 h</th>
              <th className="px-2 py-1.5 text-right font-semibold">Van a superar</th>
              <th className="px-2 py-1.5 text-right font-semibold">Más de 30 h en el último mes</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {conCasos.map((a) => (
              <tr key={a.cc} className="border-t border-neutral-100 dark:border-zinc-800">
                <td className="py-1.5 pr-2 text-left">{a.nombre}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{a.limite.superaron}</td>
                <td className="px-2 py-1.5 text-right">{a.limite.vanASuperar}</td>
                <td className="px-2 py-1.5 text-right">{a.limite.masDe30EnElMes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {personas === null ? (
        <p className="text-body-muted text-[13px]">El detalle por persona lo ve solo el perfil RRHH.</p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                <th className="py-1.5 pr-2 text-left font-semibold">Legajo</th>
                <th className="px-2 py-1.5 text-left font-semibold">Persona</th>
                <th className="px-2 py-1.5 text-right font-semibold">Acumulado del año</th>
                <th className="px-2 py-1.5 text-right font-semibold">Último mes</th>
                <th className="px-2 py-1.5 text-right font-semibold">Promedio 3 meses</th>
                <th className="px-2 py-1.5 text-right font-semibold">Proyección a dic.</th>
                <th className="px-2 py-1.5 text-right font-semibold">Meses con más de {LIMITE_MENSUAL} h</th>
                <th className="px-2 py-1.5 text-left font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {personas.slice(0, 60).map((p) => (
                <tr key={p.legajo} className="border-t border-neutral-100 align-top dark:border-zinc-800">
                  <td className="py-1.5 pr-2 text-left">{p.legajo}</td>
                  <td className="px-2 py-1.5 text-left">
                    <span className="text-neutral-900 dark:text-gray-100">{p.nombre}</span>
                    <span className="block text-[12px] text-neutral-500 dark:text-gray-400">
                      {p.area}
                      {p.puesto ? ` · ${p.puesto}` : ''}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">{numero(p.acumuladoAnio)}</td>
                  <td className="px-2 py-1.5 text-right">{numero(p.ultimoMes)}</td>
                  <td className="px-2 py-1.5 text-right">{numero(p.promedio3)}</td>
                  <td className="px-2 py-1.5 text-right">{numero(p.proyeccionAnio)}</td>
                  <td className="px-2 py-1.5 text-right">{p.mesesSobre30} de {Number(ultimoMes.slice(4, 6))}</td>
                  <td className="px-2 py-1.5 text-left">
                    <Estado p={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {personas.length > 60 && (
            <p className="text-body-muted mt-2 text-[12.5px]">Se muestran las 60 personas con más horas de {personas.length}.</p>
          )}
        </div>
      )}
    </div>
  )
}
