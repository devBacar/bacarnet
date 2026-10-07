import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchRrhhPersonasCostos, type PersonaCostoRrhh } from '../../services/rrhhApi'
import { BotonExportarRrhh } from './BotonExportarRrhh'
import { descargarCsv, nombreArchivo } from './exportarRrhh'
import { numero, numero1, pesosCorto } from './formatoRrhh'

/** Un período elegible para la lista: su nombre, sus meses (AAAAMM) y las horas que tiene que sumar la lista. */
export interface PeriodoLista {
  clave: string
  etiqueta: string
  meses: string[]
  horasEsperadas: number
}

interface Fila {
  legajo: number
  nombre: string
  cc: number
  he50: number
  he100: number
  fer: number
  comp: number
  extras: number
}

const total = (f: Pick<Fila, 'he50' | 'he100' | 'fer' | 'comp'>) => f.he50 + f.he100 + f.fer + f.comp

/**
 * Todas las personas que cobraron horas extra en la selección (solo perfil RRHH), agrupadas por área,
 * con subtotales. La suma tiene que dar las horas del período que se muestran arriba.
 */
export function PersonasHorasRrhh({
  periodos,
  filtro,
  nombreArea,
  nombreUnidad,
  nombreSeleccion,
}: {
  periodos: PeriodoLista[]
  filtro: (cc: number) => boolean
  nombreArea: (cc: number) => string
  nombreUnidad: (cc: number) => string
  nombreSeleccion: string
}) {
  const [clave, setClave] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const periodo = periodos.find((p) => p.clave === clave) ?? periodos[periodos.length - 1]
  const consultas = useQueries({
    queries: (periodo?.meses ?? []).map((mes) => ({
      queryKey: ['rrhh', 'personas', mes],
      queryFn: () => fetchRrhhPersonasCostos(mes),
      staleTime: 5 * 60_000,
    })),
  })
  if (!periodo) return null
  if (consultas.some((q) => q.isPending)) return <p className="text-[14px] text-neutral-600 dark:text-gray-400">Cargando la lista de personas…</p>
  const error = consultas.find((q) => q.isError)?.error
  if (error) return <p className="text-[14px] text-red-700 dark:text-red-400">{error instanceof Error ? error.message : 'No se pudo cargar la lista.'}</p>

  const porLegajo = new Map<number, Fila>()
  let sinHoras = false
  for (const q of consultas) {
    for (const p of (q.data?.personas ?? []) as PersonaCostoRrhh[]) {
      if (p.he50 === undefined) sinHoras = true
      if (!filtro(p.cc)) continue
      const h = { he50: p.he50 ?? 0, he100: p.he100 ?? 0, fer: p.fer ?? 0, comp: p.comp ?? 0 }
      if (total(h) <= 0) continue
      const x = porLegajo.get(p.legajo) ?? { legajo: p.legajo, nombre: p.nombre, cc: p.cc, he50: 0, he100: 0, fer: 0, comp: 0, extras: 0 }
      x.he50 += h.he50
      x.he100 += h.he100
      x.fer += h.fer
      x.comp += h.comp
      x.extras += p.extras
      x.cc = p.cc
      porLegajo.set(p.legajo, x)
    }
  }
  if (sinHoras) {
    return <p className="text-[14px] text-neutral-700 dark:text-gray-300">Para ver la lista hay que volver a procesar el backup de Salario con esta versión.</p>
  }
  const lista = [...porLegajo.values()]
  const suma = lista.reduce((s, f) => s + total(f), 0)
  const cuadra = Math.abs(suma - periodo.horasEsperadas) < 1
  const t = buscar.trim().toLowerCase()
  const visibles = t ? lista.filter((p) => p.nombre.toLowerCase().includes(t) || String(p.legajo).includes(t)) : lista
  const porCc = new Map<number, Fila[]>()
  for (const f of visibles) porCc.set(f.cc, [...(porCc.get(f.cc) ?? []), f])
  const grupos = [...porCc.entries()]
    .map(([cc, fs]) => ({ cc, fs: fs.sort((a, b) => total(b) - total(a)), horas: fs.reduce((s, f) => s + total(f), 0) }))
    .sort((a, b) => b.horas - a.horas)
  const col = (f: (x: Fila) => number) => numero1(visibles.reduce((s, x) => s + f(x), 0))

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1 text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400">
          Período de la lista
          <select
            value={periodo.clave}
            onChange={(e) => setClave(e.target.value)}
            className="min-w-[200px] rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14.5px] text-neutral-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
          >
            {[...periodos].reverse().map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por nombre o legajo"
            className="min-w-[240px] rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
          />
          <BotonExportarRrhh
            onClick={() =>
              descargarCsv(
                nombreArchivo('horas extra', nombreSeleccion, periodo.etiqueta),
                ['Legajo', 'Apellido y nombre', 'Unidad de negocio', 'Centro de costo', 'Horas al 50%', 'Horas al 100%', 'Horas en feriado', 'Compensatorias', 'Total horas', 'Pagado ($)'],
                grupos.flatMap((g) => g.fs).map((f) => [f.legajo, f.nombre, nombreUnidad(f.cc), nombreArea(f.cc), f.he50, f.he100, f.fer, f.comp, total(f), f.extras]),
              )
            }
          />
        </div>
      </div>
      <p className="text-[15px] text-neutral-800 dark:text-gray-200">
        <strong>{numero(lista.length)}</strong> personas · <strong>{numero1(suma)} h</strong> (50%, 100%, feriado y compensatorias)
        {cuadra ? <span className="ml-2 text-[13px] text-emerald-700 dark:text-emerald-400">✓ suman las horas del período</span> : null}
      </p>
      <div className="max-h-[620px] max-w-full overflow-auto rounded-lg border border-neutral-200 dark:border-zinc-700">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-neutral-50 dark:bg-zinc-800">
            <tr className="text-left text-[11.5px] text-neutral-600 dark:text-gray-400">
              <th className="px-2 py-1.5 font-semibold">Persona</th>
              <th className="px-2 py-1.5 text-right font-semibold">50%</th>
              <th className="px-2 py-1.5 text-right font-semibold">100%</th>
              <th className="px-2 py-1.5 text-right font-semibold">Feriado</th>
              <th className="px-2 py-1.5 text-right font-semibold">Compens.</th>
              <th className="px-2 py-1.5 text-right font-semibold">Total h</th>
              <th className="px-2 py-1.5 text-right font-semibold">Pagado</th>
            </tr>
          </thead>
          {grupos.map((g) => (
            <tbody key={g.cc} className="tabular-nums">
              <tr className="border-t-2 border-neutral-300 bg-slate-100 font-semibold dark:border-zinc-600 dark:bg-zinc-800/70">
                <td colSpan={5} className="px-2 py-1.5 text-[13.5px] text-[#1f3b63] dark:text-blue-300">
                  {nombreArea(g.cc)} · {g.fs.length} personas
                </td>
                <td className="px-2 py-1.5 text-right">{numero1(g.horas)}</td>
                <td />
              </tr>
              {g.fs.map((f) => (
                <tr key={f.legajo} className="border-t border-neutral-100 dark:border-zinc-800">
                  <td className="px-2 py-1.5">
                    {f.nombre} <span className="text-[11.5px] text-neutral-500 dark:text-gray-400">({f.legajo})</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">{numero1(f.he50)}</td>
                  <td className="px-2 py-1.5 text-right">{numero1(f.he100)}</td>
                  <td className="px-2 py-1.5 text-right">{numero1(f.fer)}</td>
                  <td className="px-2 py-1.5 text-right">{numero1(f.comp)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{numero1(total(f))}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{pesosCorto(f.extras)}</td>
                </tr>
              ))}
            </tbody>
          ))}
          <tbody className="tabular-nums">
            <tr className="border-t-2 border-neutral-400 font-semibold dark:border-zinc-500">
              <td className="px-2 py-2">Total{t ? ' de la búsqueda' : ''}</td>
              <td className="px-2 py-2 text-right">{col((x) => x.he50)}</td>
              <td className="px-2 py-2 text-right">{col((x) => x.he100)}</td>
              <td className="px-2 py-2 text-right">{col((x) => x.fer)}</td>
              <td className="px-2 py-2 text-right">{col((x) => x.comp)}</td>
              <td className="px-2 py-2 text-right">{col(total)}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">{pesosCorto(visibles.reduce((s, x) => s + x.extras, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-neutral-600 dark:text-gray-400">"Pagado" es lo liquidado en el recibo, sin las cargas de la empresa.</p>
    </div>
  )
}
