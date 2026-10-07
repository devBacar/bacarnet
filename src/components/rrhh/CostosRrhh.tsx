import { useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchRrhhPersonasCostos, type CostosNominaRrhh, type ConvenioRrhh, type PersonaCostoRrhh, type UnidadNegocioRrhh } from '../../services/rrhhApi'
import { BotonExportarRrhh } from './BotonExportarRrhh'
import { descargarCsv, nombreArchivo } from './exportarRrhh'
import { agruparCostos, agruparPor, bruto, costoLaboral, cumpleFiltro, filtrarCostos, type PeriodoCosto, type Totales } from './costosDatos'
import { claveDe, type Agrupacion } from './evolucionDatos'
import { numero, pesosCorto } from './formatoRrhh'
import { GraficoBarras, Segmentado, type Serie } from './GraficoBarrasRrhh'
import { BandaRrhh, NumerosGrandes, PocasPalabras, TituloDetalle } from './ResumenSimpleRrhh'
import { TarjetaRrhh } from './TarjetaRrhh'

type Vista = 'costo' | 'neto' | 'extras'

const CONVENIO_CORTO: Record<ConvenioRrhh, string> = {
  suvico: 'SUVICO',
  camioneros: 'Camioneros',
  bancarios: 'Bancarios',
  comercio: 'Comercio',
  fuera: 'Fuera de convenio',
}

const AGRUPACIONES: { id: Agrupacion; nombre: string }[] = [
  { id: 'mes', nombre: 'Mes' },
  { id: 'trimestre', nombre: 'Trimestre' },
  { id: 'semestre', nombre: 'Semestre' },
  { id: 'anio', nombre: 'Año' },
]

const VISTAS: { id: Vista; nombre: string }[] = [
  { id: 'costo', nombre: 'Costo laboral' },
  { id: 'neto', nombre: 'Neto depositado' },
  { id: 'extras', nombre: 'Horas extra en el sueldo' },
]

const SELECT =
  'min-w-[200px] rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14.5px] text-neutral-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

const pesos = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const exacto = (v: number) => `$ ${pesos.format(v)}`

function pct(x: number): string {
  return `${(x * 100).toFixed(1).replace('.', ',')}%`
}

function FilaMonto({ nombre, valor, fuerte, negativo, nota }: { nombre: string; valor: number; fuerte?: boolean; negativo?: boolean; nota?: string }) {
  return (
    <tr className={`border-t border-neutral-100 dark:border-zinc-800 ${fuerte ? 'font-semibold' : ''}`}>
      <td className="py-2 pr-3">
        {nombre}
        {nota ? <span className="block text-[12.5px] font-normal text-neutral-500 dark:text-gray-400">{nota}</span> : null}
      </td>
      <td className="py-2 text-right tabular-nums whitespace-nowrap">{negativo ? `− ${exacto(valor)}` : exacto(valor)}</td>
    </tr>
  )
}

function TablaDesglose({
  titulo,
  filas,
}: {
  titulo: string
  filas: { clave: string; nombre: string; t: Totales }[]
}) {
  const total = filas.reduce((s, f) => s + costoLaboral(f.t), 0)
  return (
    <TarjetaRrhh titulo={titulo}>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12.5px] text-neutral-600 dark:text-gray-400">
              <th className="py-2 pr-2 font-semibold" />
              <th className="px-2 py-2 text-right font-semibold">Personas</th>
              <th className="px-2 py-2 text-right font-semibold">Remunerativo</th>
              <th className="px-2 py-2 text-right font-semibold">No remunerativo</th>
              <th className="px-2 py-2 text-right font-semibold">Neto</th>
              <th className="px-2 py-2 text-right font-semibold">Costo laboral</th>
              <th className="px-2 py-2 text-right font-semibold">Parte del total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {filas.map((f) => (
              <tr key={f.clave} className="border-t border-neutral-100 dark:border-zinc-800">
                <td className="py-2 pr-2">{f.nombre}</td>
                <td className="px-2 py-2 text-right">{numero(f.t.personas)}</td>
                <td className="px-2 py-2 text-right">{pesosCorto(f.t.rem)}</td>
                <td className="px-2 py-2 text-right">{pesosCorto(f.t.norem)}</td>
                <td className="px-2 py-2 text-right">{pesosCorto(f.t.neto)}</td>
                <td className="px-2 py-2 text-right font-semibold">{pesosCorto(costoLaboral(f.t))}</td>
                <td className="px-2 py-2 text-right">{total > 0 ? pct(costoLaboral(f.t) / total) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TarjetaRrhh>
  )
}

interface PersonaPeriodo {
  legajo: number
  nombre: string
  cc: number
  convenio: ConvenioRrhh
  meses: number
  neto: number
  bruto: number
  costoLaboral: number
  extras: number
}

/** Personas de la selección (solo RRHH): se suman los meses del período; los totales cuadran con los números de arriba. */
function PersonasSeleccion({
  meses,
  filtro,
  nombreArea,
  nombreConvenio,
  esperado,
  nombreSeleccion,
}: {
  meses: string[]
  filtro: (p: PersonaCostoRrhh) => boolean
  nombreArea: (cc: number) => string
  nombreConvenio: (c: ConvenioRrhh) => string
  esperado: { neto: number; costo: number }
  nombreSeleccion: string
}) {
  const [buscar, setBuscar] = useState('')
  const consultas = useQueries({
    queries: meses.map((mes) => ({ queryKey: ['rrhh', 'personas', mes], queryFn: () => fetchRrhhPersonasCostos(mes), staleTime: 5 * 60_000 })),
  })
  const cargando = consultas.some((q) => q.isPending)
  const error = consultas.find((q) => q.isError)?.error
  const porLegajo = new Map<number, PersonaPeriodo>()
  for (const q of consultas) {
    for (const p of q.data?.personas ?? []) {
      if (!filtro(p)) continue
      const x = porLegajo.get(p.legajo) ?? { legajo: p.legajo, nombre: p.nombre, cc: p.cc, convenio: p.convenio, meses: 0, neto: 0, bruto: 0, costoLaboral: 0, extras: 0 }
      x.meses += 1
      x.neto += p.neto
      x.bruto += p.rem + p.norem
      x.costoLaboral += p.costoLaboral
      x.extras += p.extras
      x.cc = p.cc
      porLegajo.set(p.legajo, x)
    }
  }
  const lista = [...porLegajo.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  if (cargando) return <p className="text-[14px] text-neutral-600 dark:text-gray-400">Cargando la lista de personas…</p>
  if (error) return <p className="text-[14px] text-red-700 dark:text-red-400">{error instanceof Error ? error.message : 'No se pudo cargar la lista.'} Si es la primera vez, actualizá desde Salario.</p>

  const t = buscar.trim().toLowerCase()
  const visibles = t ? lista.filter((p) => p.nombre.toLowerCase().includes(t) || String(p.legajo).includes(t)) : lista
  const totalNeto = lista.reduce((s, p) => s + p.neto, 0)
  const totalCosto = lista.reduce((s, p) => s + p.costoLaboral, 0)
  const cuadra = Math.abs(totalNeto - esperado.neto) < 1 && Math.abs(totalCosto - esperado.costo) < 1

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-neutral-800 dark:text-gray-200">
          <strong>{numero(lista.length)}</strong> personas · neto {exacto(totalNeto)} · costo laboral {exacto(totalCosto)}
          {cuadra ? <span className="ml-2 text-[13px] text-emerald-700 dark:text-emerald-400">✓ coincide con los totales de arriba</span> : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por nombre o legajo"
            className="min-w-[240px] rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14.5px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
          />
          <BotonExportarRrhh
            onClick={() =>
              descargarCsv(
                nombreArchivo('costos personal', nombreSeleccion),
                ['Legajo', 'Apellido y nombre', 'Centro de costo', 'Convenio', 'Meses', 'Bruto ($)', 'Neto ($)', 'Costo laboral ($)', 'Horas extra ($)'],
                lista.map((p) => [p.legajo, p.nombre, nombreArea(p.cc), nombreConvenio(p.convenio), p.meses, p.bruto, p.neto, p.costoLaboral, p.extras]),
              )
            }
          />
        </div>
      </div>
      <div className="max-h-[560px] max-w-full overflow-auto rounded-lg border border-neutral-200 dark:border-zinc-700">
        <table className="w-full min-w-[860px] border-collapse text-[14px]">
          <thead className="sticky top-0 bg-neutral-50 dark:bg-zinc-800">
            <tr className="text-left text-[12.5px] text-neutral-600 dark:text-gray-400">
              <th className="px-2 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Legajo</th>
              <th className="px-2 py-2 font-semibold">Apellido y nombre</th>
              <th className="px-2 py-2 font-semibold">Área</th>
              <th className="px-2 py-2 font-semibold">Convenio</th>
              {meses.length > 1 ? <th className="px-2 py-2 text-right font-semibold">Meses</th> : null}
              <th className="px-2 py-2 text-right font-semibold">Bruto</th>
              <th className="px-2 py-2 text-right font-semibold">Neto</th>
              <th className="px-2 py-2 text-right font-semibold">Costo laboral</th>
              <th className="px-2 py-2 text-right font-semibold">Horas extra $</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {visibles.map((p, i) => (
              <tr key={p.legajo} className="border-t border-neutral-100 dark:border-zinc-800">
                <td className="px-2 py-1.5 text-neutral-500">{i + 1}</td>
                <td className="px-2 py-1.5">{p.legajo}</td>
                <td className="px-2 py-1.5">{p.nombre}</td>
                <td className="px-2 py-1.5">{nombreArea(p.cc)}</td>
                <td className="px-2 py-1.5">{nombreConvenio(p.convenio)}</td>
                {meses.length > 1 ? <td className="px-2 py-1.5 text-right">{p.meses}</td> : null}
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{pesosCorto(p.bruto)}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{pesosCorto(p.neto)}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap font-semibold">{pesosCorto(p.costoLaboral)}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{p.extras > 0 ? pesosCorto(p.extras) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Costos de personal: lo que se liquidó y pagó, y lo que le cuesta a la empresa, mes a mes. */
export function CostosRrhh({
  costos,
  areas: areasEvolucion,
  unidades,
  verPersonas = false,
}: {
  costos: CostosNominaRrhh
  areas: { cc: number; nombre: string; unidad: UnidadNegocioRrhh }[]
  unidades: { id: UnidadNegocioRrhh; nombre: string }[]
  /** Solo perfil RRHH: lista de personas con sus importes. */
  verPersonas?: boolean
}) {
  // Las áreas de los costos incluyen las que no tienen horas extra; si el informe es viejo, se usan las de Evolución.
  const areas = costos.areas ?? areasEvolucion
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('mes')
  const [unidad, setUnidad] = useState('todas')
  const [cc, setCc] = useState<number | 'todas'>('todas')
  const [convenio, setConvenio] = useState<ConvenioRrhh | 'todos'>('todos')
  const [vista, setVista] = useState<Vista>('costo')
  const [elegido, setElegido] = useState<string | null>(null)

  const unidadDe = useMemo(() => new Map(areas.map((a) => [a.cc, a.unidad as string])), [areas])
  const nombreArea = (n: number) => (n === -1 ? 'Sin centro de costo' : (areas.find((a) => a.cc === n)?.nombre ?? `Centro de costo ${n}`))
  const filtradas = useMemo(() => filtrarCostos(costos.filas, unidadDe, unidad, cc, convenio), [costos.filas, unidadDe, unidad, cc, convenio])
  const nombreConvenio = (c: ConvenioRrhh) => costos.convenios.find((x) => x.id === c)?.nombre ?? c
  const filtroPersona = useMemo(
    () => (p: PersonaCostoRrhh) => cumpleFiltro({ cc: p.ccFiltro, convenio: p.convenio }, unidadDe, unidad, cc, convenio),
    [unidadDe, unidad, cc, convenio],
  )
  const periodos = useMemo(() => agruparCostos(filtradas, agrupacion), [filtradas, agrupacion])
  const p: PeriodoCosto | undefined = periodos.find((x) => x.clave === elegido) ?? periodos[periodos.length - 1]
  const idx = p ? periodos.indexOf(p) : -1
  const anterior = idx > 0 ? periodos[idx - 1] : undefined
  const clavePeriodo = p?.clave
  const filasPeriodo = useMemo(
    () => (clavePeriodo ? filtradas.filter((f) => claveDe(f.mes, agrupacion).clave === clavePeriodo) : []),
    [clavePeriodo, filtradas, agrupacion],
  )
  const areasDeUnidad = areas.filter((a) => unidad === 'todas' || a.unidad === unidad)
  const seleccion = [
    cc !== 'todas' ? nombreArea(cc) : unidad !== 'todas' ? (unidades.find((u) => u.id === unidad)?.nombre ?? '') : 'Toda la empresa',
    convenio !== 'todos' ? nombreConvenio(convenio) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const mesesPeriodo = [...new Set(filasPeriodo.map((f) => f.mes))].sort()

  const series: Serie[] =
    vista === 'costo'
      ? [
          { nombre: 'Remunerativo', color: '#2a78d6', valores: periodos.map((x) => x.rem) },
          { nombre: 'No remunerativo', color: '#1baf7a', valores: periodos.map((x) => x.norem) },
          { nombre: 'Contribuciones patronales', color: '#eb6834', valores: periodos.map((x) => x.contrib) },
        ]
      : vista === 'neto'
        ? [
            { nombre: 'Neto depositado', color: '#2a78d6', valores: periodos.map((x) => x.neto) },
            { nombre: 'Adelantos pagados en el mes', color: '#94a3b8', valores: periodos.map((x) => x.adelantos) },
          ]
        : [
            { nombre: 'Horas extra, feriados y compensatorias', color: '#eb6834', valores: periodos.map((x) => x.extras) },
            { nombre: 'Resto del remunerativo', color: '#94a3b8', valores: periodos.map((x) => x.rem - x.extras) },
          ]

  const frases: string[] = []
  if (p) {
    frases.push(
      `${seleccion}, ${p.etiqueta}: se liquidaron ${pesosCorto(bruto(p))} de sueldos. Descontados aportes, sindicato, Ganancias y adelantos, se depositaron ${pesosCorto(p.neto)}.`,
    )
    if (p.adelantos > 0) frases.push(`Con los adelantos que ya se habían pagado durante el mes (${pesosCorto(p.adelantos)}), por esos sueldos salieron ${pesosCorto(p.neto + p.adelantos)}.`)
    frases.push(
      `Además, la empresa paga ${pesosCorto(p.contrib)} de contribuciones (F.931). Costo laboral: ${pesosCorto(costoLaboral(p))}; con las provisiones de aguinaldo y despidos, ${pesosCorto(costoLaboral(p) + p.prov)}.`,
    )
    if (p.rem > 0) frases.push(`Las horas extra, feriados y compensatorias son ${pesosCorto(p.extras)}: el ${pct(p.extras / p.rem)} del remunerativo.`)
    if (anterior && anterior.meses === p.meses && costoLaboral(anterior) > 0) {
      const v = costoLaboral(p) / costoLaboral(anterior) - 1
      frases.push(`Comparado con ${anterior.etiqueta}, el costo laboral ${v >= 0 ? 'subió' : 'bajó'} un ${pct(Math.abs(v))} (en pesos de cada mes, sin ajustar por inflación).`)
    }
  }

  const porEmpresa = agruparPor(filasPeriodo, (f) => f.empresa)
  const porConvenio = agruparPor(filasPeriodo, (f) => f.convenio)
  const porArea = agruparPor(filasPeriodo, (f) => f.cc)

  const filasTabla: { nombre: string; f: (x: PeriodoCosto) => string; fuerte?: boolean }[] = [
    { nombre: 'Personas (promedio por mes)', f: (x) => numero(x.personas) },
    { nombre: 'Remunerativo', f: (x) => pesosCorto(x.rem) },
    { nombre: 'No remunerativo', f: (x) => pesosCorto(x.norem) },
    { nombre: 'Total bruto', f: (x) => pesosCorto(bruto(x)), fuerte: true },
    { nombre: 'Descuentos', f: (x) => pesosCorto(x.desc) },
    { nombre: 'Neto depositado', f: (x) => pesosCorto(x.neto), fuerte: true },
    { nombre: 'Adelantos pagados en el mes', f: (x) => pesosCorto(x.adelantos) },
    { nombre: 'Contribuciones patronales', f: (x) => pesosCorto(x.contrib) },
    { nombre: 'Costo laboral', f: (x) => pesosCorto(costoLaboral(x)), fuerte: true },
    { nombre: 'Provisiones (aguinaldo y despidos)', f: (x) => pesosCorto(x.prov) },
    { nombre: 'Costo con provisiones', f: (x) => pesosCorto(costoLaboral(x) + x.prov) },
    { nombre: 'Costo laboral por persona por mes', f: (x) => (x.personas > 0 ? pesosCorto(costoLaboral(x) / x.personas / x.meses) : '—') },
    { nombre: 'Horas extra, feriados y compensatorias', f: (x) => pesosCorto(x.extras) },
    { nombre: 'Horas extra sobre el remunerativo', f: (x) => (x.rem > 0 ? pct(x.extras / x.rem) : '—') },
  ]

  return (
    <div className="grid gap-5">
      <BandaRrhh titulo="Costos de personal" subtitulo="Sueldos liquidados en Salario · cada mes se paga a principios del mes siguiente" tono="real" />

      <section className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Segmentado
            etiqueta="Ver por"
            opciones={AGRUPACIONES}
            valor={agrupacion}
            onChange={(v) => {
              setAgrupacion(v)
              setElegido(null)
            }}
          />
          <label className="grid gap-1 text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400">
            Período
            <select value={p?.clave ?? ''} onChange={(e) => setElegido(e.target.value)} className={SELECT}>
              {[...periodos].reverse().map((x) => (
                <option key={x.clave} value={x.clave}>
                  {x.etiqueta}
                  {x.meses < x.mesesTotales ? ` (${x.meses} de ${x.mesesTotales} meses)` : ''}
                </option>
              ))}
            </select>
          </label>
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
              {unidades.map((u) => (
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
          <label className="grid gap-1 text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400">
            Convenio
            <select value={convenio} onChange={(e) => setConvenio(e.target.value as ConvenioRrhh | 'todos')} className={SELECT}>
              <option value="todos">Todos</option>
              {costos.convenios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {p ? (
        <>
          <NumerosGrandes
            items={[
              { etiqueta: `Neto depositado · ${p.etiqueta}`, valor: pesosCorto(p.neto), nota: 'lo que cobraron los empleados' },
              { etiqueta: 'Costo laboral para la empresa', valor: pesosCorto(costoLaboral(p)), nota: 'sueldos más contribuciones patronales' },
              { etiqueta: 'Personas', valor: numero(p.personas), nota: p.meses > 1 ? 'promedio por mes' : 'liquidadas en el mes' },
            ]}
          />
          <PocasPalabras frases={frases} />

          <div className="grid gap-5 lg:grid-cols-2">
            <TarjetaRrhh titulo="Lo que se pagó">
              <table className="w-full border-collapse text-[14.5px]">
                <tbody>
                  <FilaMonto nombre="Remunerativo" nota="sueldos, adicionales y horas extra" valor={p.rem} />
                  <FilaMonto nombre="No remunerativo" nota="viáticos y sumas fijas" valor={p.norem} />
                  <FilaMonto nombre="Total bruto" valor={bruto(p)} fuerte />
                  <FilaMonto nombre="Descuentos" nota="aportes, sindicato, Ganancias, adelantos y otros" valor={p.desc} negativo />
                  <FilaMonto nombre="Neto depositado" valor={p.neto} fuerte />
                  <FilaMonto nombre="Adelantos ya pagados en el mes" nota="están dentro de los descuentos" valor={p.adelantos} />
                </tbody>
              </table>
            </TarjetaRrhh>
            <TarjetaRrhh titulo="Lo que le cuesta a la empresa">
              <table className="w-full border-collapse text-[14.5px]">
                <tbody>
                  <FilaMonto nombre="Total bruto" valor={bruto(p)} />
                  <FilaMonto nombre="Contribuciones patronales" nota="se pagan con el F.931" valor={p.contrib} />
                  <FilaMonto nombre="Costo laboral" nota='concepto "Costo laboral" de Salario' valor={costoLaboral(p)} fuerte />
                  <FilaMonto nombre="Provisiones de aguinaldo y despidos" nota="no se pagan en el mes; se reservan" valor={p.prov} />
                  <FilaMonto nombre="Costo con provisiones" valor={costoLaboral(p) + p.prov} fuerte />
                </tbody>
              </table>
            </TarjetaRrhh>
          </div>

          {costos.empresas.length > 1 ? (
          <TablaDesglose
            titulo={`Por empresa · ${p.etiqueta}`}
            filas={costos.empresas
              .filter((e) => porEmpresa.has(e.id))
              .map((e) => ({ clave: String(e.id), nombre: e.nombre, t: porEmpresa.get(e.id)! }))}
          />
          ) : null}
          <TablaDesglose
            titulo={`Por convenio · ${p.etiqueta}`}
            filas={costos.convenios
              .filter((c) => porConvenio.has(c.id as ConvenioRrhh))
              .map((c) => ({ clave: c.id, nombre: c.nombre, t: porConvenio.get(c.id as ConvenioRrhh)! }))}
          />
          {cc === 'todas' ? (
            <TablaDesglose
              titulo={`Por área · ${p.etiqueta}`}
              filas={[...porArea.entries()]
                .sort((a, b) => (a[0] === -1 ? 1 : b[0] === -1 ? -1 : costoLaboral(b[1]) - costoLaboral(a[1])))
                .map(([k, t]) => ({ clave: String(k), nombre: nombreArea(k), t }))}
            />
          ) : null}

          {verPersonas ? (
            <TarjetaRrhh
              titulo={`Personas en esta selección · ${seleccion} · ${p.etiqueta}`}
              subtitulo="Solo lo ve el perfil RRHH. Cambia con cada filtro."
            >
              <PersonasSeleccion
                meses={mesesPeriodo}
                filtro={filtroPersona}
                nombreArea={(n) => areas.find((a) => a.cc === n)?.nombre ?? `Centro de costo ${n}`}
                nombreConvenio={(c) => CONVENIO_CORTO[c]}
                esperado={{ neto: p.neto, costo: costoLaboral(p) }}
                nombreSeleccion={`${seleccion} ${p.etiqueta}`}
              />
            </TarjetaRrhh>
          ) : null}

          <TituloDetalle>Evolución</TituloDetalle>
          <TarjetaRrhh titulo={`Evolución · ${seleccion}`} subtitulo="Pasá el mouse sobre una barra para ver el detalle.">
            <div className="mb-3">
              <Segmentado etiqueta="Qué mirar" opciones={VISTAS} valor={vista} onChange={setVista} />
            </div>
            <GraficoBarras
              etiquetas={periodos.map((x) => x.etiquetaCorta)}
              subetiquetas={periodos.map((x) => (x.meses < x.mesesTotales ? `${x.meses} de ${x.mesesTotales} meses` : ''))}
              estimados={periodos.map(() => false)}
              series={series}
              formato={pesosCorto}
              apilado
            />
          </TarjetaRrhh>

          <TarjetaRrhh titulo="Todos los datos por período">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full border-collapse text-[13.5px]">
                <thead>
                  <tr className="text-[12px] text-neutral-600 dark:text-gray-400">
                    <th className="sticky left-0 bg-white py-2 pr-3 text-left font-semibold dark:bg-zinc-900">Concepto</th>
                    {periodos.map((x) => (
                      <th key={x.clave} className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                        {x.etiquetaCorta}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {filasTabla.map((fila) => (
                    <tr key={fila.nombre} className="border-t border-neutral-100 dark:border-zinc-800">
                      <td className={`sticky left-0 bg-white py-1.5 pr-3 whitespace-nowrap dark:bg-zinc-900 ${fila.fuerte ? 'font-semibold' : ''}`}>{fila.nombre}</td>
                      {periodos.map((x) => (
                        <td key={x.clave} className={`px-2 py-1.5 text-right whitespace-nowrap ${fila.fuerte ? 'font-semibold' : ''}`}>
                          {fila.f(x)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TarjetaRrhh>
        </>
      ) : (
        <p className="text-body-muted text-[14px]">No hay datos para esta selección.</p>
      )}

      <TarjetaRrhh titulo="Cómo se calculó">
        <ul className="grid list-disc gap-2 pl-5 text-[14px] leading-snug text-neutral-700 dark:text-gray-300">
          {costos.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </TarjetaRrhh>
    </div>
  )
}
