import { useMemo, useState } from 'react'
import { GraficoBarras, Segmentado, type Serie } from './GraficoBarrasRrhh'
import type { ConvenioRrhh, EvolucionRrhh } from '../../services/rrhhApi'
import { agrupar, agruparConvenios, claveDe, filasFiltradas, type Agrupacion, type Periodo } from './evolucionDatos'
import { PersonasHorasRrhh, type PeriodoLista } from './PersonasHorasRrhh'
import { numero, pesosCorto, textoCorte } from './formatoRrhh'
import { BandaRrhh, PocasPalabras, TituloDetalle } from './ResumenSimpleRrhh'
import { TarjetaRrhh } from './TarjetaRrhh'

type Vista = 'extra' | 'trabajadas' | 'costo' | 'ausencias' | 'personal'


const AGRUPACIONES: { id: Agrupacion; nombre: string }[] = [
  { id: 'mes', nombre: 'Mes' },
  { id: 'trimestre', nombre: 'Trimestre' },
  { id: 'semestre', nombre: 'Semestre' },
  { id: 'anio', nombre: 'Año' },
]

const VISTAS: { id: Vista; nombre: string }[] = [
  { id: 'extra', nombre: 'Horas extra' },
  { id: 'trabajadas', nombre: 'Horas trabajadas' },
  { id: 'costo', nombre: 'Costo' },
  { id: 'ausencias', nombre: 'Vacaciones y licencias' },
  { id: 'personal', nombre: 'Personal' },
]

const COLOR_CONVENIO: Record<ConvenioRrhh, string> = {
  suvico: '#2a78d6',
  camioneros: '#eb6834',
  bancarios: '#1baf7a',
  comercio: '#8b5cf6',
  fuera: '#94a3b8',
}

const horasExtra = (p: Periodo) => p.he50 + p.he100 + p.comp
const horasTrabajadas = (p: Periodo) => p.horasNormales + horasExtra(p)
const costoTotal = (p: Periodo) => p.costoExtra + p.costoFeriado + p.costoComp

function pct(x: number): string {
  return `${(x * 100).toFixed(1).replace('.', ',')}%`
}

function seriesDe(vista: Vista, ps: Periodo[]): { series: Serie[]; formato: (v: number) => string; apilado: boolean } {
  const v = (f: (p: Periodo) => number) => ps.map(f)
  switch (vista) {
    case 'extra':
      return {
        apilado: true,
        formato: (x) => `${numero(x)} h`,
        series: [
          { nombre: 'Al 50%', color: '#2a78d6', valores: v((p) => p.he50) },
          { nombre: 'Al 100% (doble)', color: '#eb6834', valores: v((p) => p.he100) },
          { nombre: 'En feriado', color: '#1baf7a', valores: v((p) => p.fer) },
          { nombre: 'Compensatorias', color: '#8b5cf6', valores: v((p) => p.comp) },
        ],
      }
    case 'trabajadas':
      return {
        apilado: true,
        formato: (x) => `${numero(x)} h`,
        series: [
          { nombre: 'Horas normales', color: '#94a3b8', valores: v((p) => p.horasNormales) },
          { nombre: 'Horas extra', color: '#eb6834', valores: v(horasExtra) },
        ],
      }
    case 'costo':
      return {
        apilado: true,
        formato: pesosCorto,
        series: [
          { nombre: 'Horas extra', color: '#2a78d6', valores: v((p) => p.costoExtra) },
          { nombre: 'Feriados', color: '#1baf7a', valores: v((p) => p.costoFeriado) },
          { nombre: 'Compensatorias', color: '#8b5cf6', valores: v((p) => p.costoComp) },
        ],
      }
    case 'ausencias':
      return {
        apilado: true,
        formato: (x) => `${numero(x)} días`,
        series: [
          { nombre: 'Vacaciones', color: '#2a78d6', valores: v((p) => p.diasVacaciones) },
          { nombre: 'Licencias (enfermedad y otras)', color: '#f59e0b', valores: v((p) => p.diasLicencia) },
        ],
      }
    case 'personal':
      return {
        apilado: false,
        formato: (x) => numero(x),
        series: [
          { nombre: 'Personas (promedio por mes)', color: '#94a3b8', valores: v((p) => p.dotacion) },
          { nombre: 'Cobraron horas extra', color: '#eb6834', valores: v((p) => p.conHorasExtra ?? 0) },
          { nombre: 'Más de 30 h extra en el mes', color: '#b91c1c', valores: v((p) => p.mas30 ?? 0) },
        ],
      }
  }
}

const SELECT =
  'min-w-[220px] rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14.5px] text-neutral-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

/** Evolución de las horas mes a mes, por trimestre, semestre o año, con filtros de unidad de negocio y área. */
export function EvolucionRrhh({ evolucion, verPersonas = false }: { evolucion: EvolucionRrhh; verPersonas?: boolean }) {
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('mes')
  const [vista, setVista] = useState<Vista>('extra')
  const [unidad, setUnidad] = useState('todas')
  const [cc, setCc] = useState<number | 'todas'>('todas')
  const [estimados, setEstimados] = useState(true)

  const areasDeUnidad = evolucion.areas.filter((a) => unidad === 'todas' || a.unidad === unidad)
  const incluirEstimados = estimados && agrupacion === 'mes'
  const periodos = useMemo(
    () => agrupar(filasFiltradas(evolucion, { unidad, cc, incluirEstimados }), agrupacion),
    [evolucion, unidad, cc, incluirEstimados, agrupacion],
  )
  const { series, formato, apilado } = seriesDe(vista, periodos)
  const subetiquetas = periodos.map((p) =>
    p.estimado ? 'estimado' : p.meses < p.mesesTotales ? `${p.meses} de ${p.mesesTotales} meses` : '',
  )

  const reales = periodos.filter((p) => !p.estimado)
  const ultimo = reales[reales.length - 1]
  const anterior = reales[reales.length - 2]
  const seleccion =
    cc !== 'todas'
      ? (evolucion.areas.find((a) => a.cc === cc)?.nombre ?? '')
      : unidad !== 'todas'
        ? (evolucion.unidades.find((u) => u.id === unidad)?.nombre ?? '')
        : 'Toda la empresa'
  const mayor = [...reales].sort((a, b) => horasExtra(b) + b.fer - (horasExtra(a) + a.fer))[0]

  const frases: string[] = []
  if (ultimo) {
    const he = horasExtra(ultimo) + ultimo.fer
    frases.push(
      `${seleccion}, ${ultimo.etiqueta}: ${numero(he)} horas extra (incluidas feriados), ${pct(horasExtra(ultimo) / Math.max(1, horasTrabajadas(ultimo)))} de las horas trabajadas, con un costo de ${pesosCorto(costoTotal(ultimo))}.`,
    )
    if (anterior && anterior.meses === ultimo.meses) {
      const dif = he - (horasExtra(anterior) + anterior.fer)
      const base = horasExtra(anterior) + anterior.fer
      if (base > 0) {
        frases.push(
          `Comparado con ${anterior.etiqueta}: ${dif >= 0 ? 'subieron' : 'bajaron'} ${numero(Math.abs(dif))} horas (${Math.round((Math.abs(dif) / base) * 100)}% ${dif >= 0 ? 'más' : 'menos'}).`,
        )
      }
    } else if (anterior) {
      frases.push(`${ultimo.etiqueta} todavía no está completo (${ultimo.meses} de ${ultimo.mesesTotales} meses): no conviene compararlo con ${anterior.etiqueta}.`)
    }
    if (mayor && reales.length > 2) frases.push(`El período con más horas extra fue ${mayor.etiqueta}: ${numero(horasExtra(mayor) + mayor.fer)} horas.`)
  }

  const filasTabla: { nombre: string; f: (p: Periodo) => string; fuerte?: boolean }[] = [
    { nombre: 'Horas normales trabajadas', f: (p) => numero(p.horasNormales) },
    { nombre: 'Horas extra al 50%', f: (p) => numero(p.he50) },
    { nombre: 'Horas extra al 100%', f: (p) => numero(p.he100) },
    { nombre: 'Horas compensatorias', f: (p) => numero(p.comp) },
    { nombre: 'Total horas trabajadas', f: (p) => numero(horasTrabajadas(p)), fuerte: true },
    { nombre: 'Horas extra sobre las trabajadas', f: (p) => pct(horasExtra(p) / Math.max(1, horasTrabajadas(p))) },
    { nombre: 'Horas en feriado (con recargo)', f: (p) => numero(p.fer) },
    { nombre: 'Horas nocturnas (con recargo)', f: (p) => (p.estimado ? '—' : numero(p.noct)) },
    { nombre: 'Costo de horas extra', f: (p) => pesosCorto(p.costoExtra) },
    { nombre: 'Costo de feriados', f: (p) => pesosCorto(p.costoFeriado) },
    { nombre: 'Costo de compensatorias', f: (p) => pesosCorto(p.costoComp) },
    { nombre: 'Costo total para la empresa', f: (p) => pesosCorto(costoTotal(p)), fuerte: true },
    { nombre: 'De eso, horas pactadas', f: (p) => (p.costoPactadas > 0 ? pesosCorto(p.costoPactadas) : '—') },
    { nombre: 'Costo de una hora extra', f: (p) => (horasExtra(p) > 0 ? pesosCorto((p.costoExtra + p.costoComp) / horasExtra(p)) : '—') },
    { nombre: 'Personas (promedio por mes)', f: (p) => numero(p.dotacion) },
    { nombre: 'Cobraron horas extra (prom. por mes)', f: (p) => (p.conHorasExtra === null ? '—' : numero(p.conHorasExtra)) },
    { nombre: 'Más de 30 h extra en el mes (prom.)', f: (p) => (p.mas30 === null ? '—' : numero(p.mas30)) },
    { nombre: 'Horas extra por persona por mes', f: (p) => (p.dotacion > 0 ? numero(horasExtra(p) / p.dotacion / p.meses) : '—') },
    { nombre: 'Días de vacaciones', f: (p) => numero(p.diasVacaciones) },
    { nombre: 'Días de licencia', f: (p) => numero(p.diasLicencia) },
  ]

  // Lista de personas (solo RRHH): períodos cerrados de la selección, con las horas que tiene que sumar.
  const mesesReales = [...new Set(evolucion.filas.filter((f) => f.tipo === 'real').map((f) => f.mes))].sort()
  const periodosLista: PeriodoLista[] = reales.map((p) => ({
    clave: p.clave,
    etiqueta: p.etiqueta,
    meses: mesesReales.filter((m) => claveDe(m, agrupacion).clave === p.clave),
    horasEsperadas: p.he50 + p.he100 + p.fer + p.comp,
  }))
  const unidadDe = new Map(evolucion.areas.map((a) => [a.cc, a.unidad as string]))
  const filtroCc = (n: number) => (cc !== 'todas' ? n === cc : n > 0 && (unidad === 'todas' || unidadDe.get(n) === unidad))
  const nombreDeCc = (n: number) => evolucion.areas.find((a) => a.cc === n)?.nombre ?? `Centro de costo ${n}`

  // Horas trabajadas por convenio (toda la empresa, meses cerrados).
  const periodosConvenio = useMemo(() => agruparConvenios(evolucion.porConvenio, agrupacion), [evolucion.porConvenio, agrupacion])
  const ultimoConvenio = periodosConvenio[periodosConvenio.length - 1]
  const totalConvenio = (p: (typeof periodosConvenio)[number], c: ConvenioRrhh) => {
    const x = p.porConvenio[c]
    return x ? x.horasNormales + x.horasExtra : 0
  }

  return (
    <div className="grid gap-5">
      <BandaRrhh titulo="Evolución de las horas" subtitulo="Mes a mes, por trimestre, semestre o año · por unidad de negocio y área" tono="real" />

      <section className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Segmentado etiqueta="Ver por" opciones={AGRUPACIONES} valor={agrupacion} onChange={setAgrupacion} />
          <label className="grid gap-1 text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400">
            Unidad de negocio
            <select
              value={unidad}
              onChange={(e) => {
                setUnidad(e.target.value)
                setCc('todas')
              }}
              className={SELECT}
            >
              <option value="todas">Todas</option>
              {evolucion.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400">
            Área
            <select value={String(cc)} onChange={(e) => setCc(e.target.value === 'todas' ? 'todas' : Number(e.target.value))} className={SELECT}>
              <option value="todas">Todas{unidad !== 'todas' ? ' las de la unidad' : ''}</option>
              {areasDeUnidad.map((a) => (
                <option key={a.cc} value={a.cc}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          {agrupacion === 'mes' ? (
            <label className="flex items-center gap-2 pb-1.5 text-[14px] text-neutral-700 dark:text-gray-300">
              <input type="checkbox" checked={estimados} onChange={(e) => setEstimados(e.target.checked)} className="h-4 w-4" />
              Mostrar meses estimados
            </label>
          ) : null}
        </div>
        <Segmentado etiqueta="Qué mirar" opciones={VISTAS} valor={vista} onChange={setVista} />
      </section>

      <PocasPalabras frases={frases} />

      <TarjetaRrhh
        titulo={`${VISTAS.find((v) => v.id === vista)?.nombre} · ${seleccion}`}
        subtitulo={
          vista === 'personal'
            ? 'Promedio de personas por mes en cada período.'
            : 'Pasá el mouse sobre una barra para ver el detalle. Los períodos incompletos indican cuántos meses tienen datos.'
        }
      >
        {periodos.length ? (
          <GraficoBarras
            etiquetas={periodos.map((p) => p.etiquetaCorta)}
            subetiquetas={subetiquetas}
            estimados={periodos.map((p) => p.estimado)}
            series={series}
            formato={formato}
            apilado={apilado}
          />
        ) : (
          <p className="text-body-muted text-[14px]">No hay datos para esta selección.</p>
        )}
      </TarjetaRrhh>

      <TarjetaRrhh titulo="Todos los datos del período" subtitulo="Horas, costos, personal y ausencias para la selección.">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[12px] text-neutral-600 dark:text-gray-400">
                <th className="sticky left-0 bg-white py-2 pr-3 text-left font-semibold dark:bg-zinc-900">Concepto</th>
                {periodos.map((p) => (
                  <th key={p.clave} className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${p.estimado ? 'italic text-amber-700 dark:text-amber-400' : ''}`}>
                    {p.etiquetaCorta}
                    {p.estimado ? '*' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {filasTabla.map((fila) => (
                <tr key={fila.nombre} className="border-t border-neutral-100 dark:border-zinc-800">
                  <td className={`sticky left-0 bg-white py-1.5 pr-3 whitespace-nowrap dark:bg-zinc-900 ${fila.fuerte ? 'font-semibold' : ''}`}>{fila.nombre}</td>
                  {periodos.map((p) => (
                    <td key={p.clave} className={`px-2 py-1.5 text-right whitespace-nowrap ${fila.fuerte ? 'font-semibold' : ''}`}>
                      {fila.f(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {periodos.some((p) => p.estimado) ? <p className="mt-2 text-[12.5px] text-amber-800 dark:text-amber-300">* Estimado.</p> : null}
      </TarjetaRrhh>

      {verPersonas && periodosLista.length > 0 ? (
        <TarjetaRrhh
          titulo={`Quiénes hicieron horas extra · ${seleccion}`}
          subtitulo="Todas las personas que cobraron horas extra, agrupadas por centro de costo y de la que más hizo a la que menos, con los filtros de arriba. Solo lo ve el perfil RRHH."
        >
          <PersonasHorasRrhh
            key={`${agrupacion}-${unidad}-${cc}`}
            periodos={periodosLista}
            filtro={filtroCc}
            nombreArea={nombreDeCc}
            nombreUnidad={(n) => evolucion.unidades.find((u) => u.id === unidadDe.get(n))?.nombre ?? ''}
            nombreSeleccion={seleccion}
          />
        </TarjetaRrhh>
      ) : null}

      <TituloDetalle>Horas trabajadas por convenio</TituloDetalle>

      <TarjetaRrhh
        titulo="Horas trabajadas por convenio · toda la empresa"
        subtitulo="Horas normales más horas extra, sin vacaciones ni licencias. Solo meses cerrados. Cada mes es el período de su liquidación: SUVICO y Camioneros, del 26 del mes anterior al 25; el resto, del 1 a fin de mes. El convenio sale de cada persona, por eso no se filtra por área."
      >
        <GraficoBarras
          etiquetas={periodosConvenio.map((p) => p.etiquetaCorta)}
          subetiquetas={periodosConvenio.map((p) => (p.meses < p.mesesTotales ? `${p.meses} de ${p.mesesTotales} meses` : ''))}
          estimados={periodosConvenio.map(() => false)}
          series={evolucion.convenios.map((c) => ({
            nombre: c.nombre,
            color: COLOR_CONVENIO[c.id],
            valores: periodosConvenio.map((p) => totalConvenio(p, c.id)),
          }))}
          formato={(x) => `${numero(x)} h`}
          apilado
        />
        <div className="mt-4 max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[12px] text-neutral-600 dark:text-gray-400">
                <th className="sticky left-0 bg-white py-2 pr-3 text-left font-semibold dark:bg-zinc-900">Convenio</th>
                {periodosConvenio.map((p) => (
                  <th key={p.clave} className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                    {p.etiquetaCorta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {evolucion.convenios.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100 dark:border-zinc-800">
                  <td className="sticky left-0 bg-white py-1.5 pr-3 whitespace-nowrap dark:bg-zinc-900">{c.nombre}</td>
                  {periodosConvenio.map((p) => (
                    <td key={p.clave} className="px-2 py-1.5 text-right whitespace-nowrap">
                      {numero(totalConvenio(p, c.id))}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-300 font-semibold dark:border-zinc-600">
                <td className="sticky left-0 bg-white py-1.5 pr-3 dark:bg-zinc-900">Total</td>
                {periodosConvenio.map((p) => (
                  <td key={p.clave} className="px-2 py-1.5 text-right whitespace-nowrap">
                    {numero(evolucion.convenios.reduce((s, c) => s + totalConvenio(p, c.id), 0))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </TarjetaRrhh>

      {ultimoConvenio ? (
        <TarjetaRrhh titulo={`Detalle por convenio · ${ultimoConvenio.etiqueta}`} subtitulo="Personas: promedio por mes del período.">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[12.5px] text-neutral-600 dark:text-gray-400">
                  <th className="py-2 pr-2 font-semibold">Convenio</th>
                  <th className="px-2 py-2 text-right font-semibold">Personas</th>
                  <th className="px-2 py-2 text-right font-semibold">Horas normales</th>
                  <th className="px-2 py-2 text-right font-semibold">Horas extra</th>
                  <th className="px-2 py-2 text-right font-semibold">Total trabajadas</th>
                  <th className="px-2 py-2 text-right font-semibold">Horas por persona por mes</th>
                  <th className="px-2 py-2 text-right font-semibold">Parte extra</th>
                  <th className="px-2 py-2 text-right font-semibold">Días de vacaciones / licencia</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {evolucion.convenios.map((c) => {
                  const x = ultimoConvenio.porConvenio[c.id]
                  if (!x) return null
                  const total = x.horasNormales + x.horasExtra
                  return (
                    <tr key={c.id} className="border-t border-neutral-100 dark:border-zinc-800">
                      <td className="py-2 pr-2">
                        {c.nombre}
                        <span className="block text-[12px] text-neutral-500 dark:text-gray-400">
                          jornada de {c.horasMes} h por mes{c.corte ? ` · ${textoCorte(c.corte)}` : ''}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">{numero(x.personas)}</td>
                      <td className="px-2 py-2 text-right">{numero(x.horasNormales)}</td>
                      <td className="px-2 py-2 text-right">{numero(x.horasExtra)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{numero(total)}</td>
                      <td className="px-2 py-2 text-right">{x.personas > 0 ? numero(total / x.personas / ultimoConvenio.meses) : '—'}</td>
                      <td className={`px-2 py-2 text-right ${total > 0 && x.horasExtra / total > 0.15 ? 'font-semibold text-red-700 dark:text-red-400' : ''}`}>
                        {total > 0 ? pct(x.horasExtra / total) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {numero(x.diasVacaciones)} / {numero(x.diasLicencia)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TarjetaRrhh>
      ) : null}

      <TarjetaRrhh titulo="Cómo se calculó">
        <ul className="grid list-disc gap-2 pl-5 text-[14px] leading-snug text-neutral-700 dark:text-gray-300">
          {evolucion.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </TarjetaRrhh>
    </div>
  )
}
