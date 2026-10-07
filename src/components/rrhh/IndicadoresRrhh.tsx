import { useMemo, useState, type ReactNode } from 'react'
import type { ConvenioRrhh, IndicadoresRrhh as Datos, PersonaBajaRrhh, PersonaLicenciaLargaRrhh } from '../../services/rrhhApi'
import { claveDe, type Agrupacion } from './evolucionDatos'
import { aclaracionCorte, numero, rangoLiquidacion } from './formatoRrhh'
import { GraficoBarras, Segmentado, type Serie } from './GraficoBarrasRrhh'
import {
  agruparIndicadores,
  bajasNoPrevistas,
  diasAusencia,
  filtrarConvenio,
  GRUPOS,
  LICENCIAS_LARGAS,
  MOTIVOS,
  pesoExtrasEnSueldos,
  porcentaje,
  ratioHorasExtra,
  sumarIndicadores,
  tasaAusentismo,
  tasaGrupo,
  tasaRotacion,
  tempranasNoPrevistas,
  totalLicenciasLargas,
  type TotalIndicadores,
} from './indicadoresDatos'
import { AtenderRrhh, BandaRrhh, NumerosGrandes, PocasPalabras, TituloDetalle } from './ResumenSimpleRrhh'
import { TarjetaRrhh } from './TarjetaRrhh'

type Vista = 'ausentismo' | 'rotacion' | 'largas'

const AGRUPACIONES: { id: Agrupacion; nombre: string }[] = [
  { id: 'mes', nombre: 'Mes' },
  { id: 'trimestre', nombre: 'Trimestre' },
  { id: 'semestre', nombre: 'Semestre' },
  { id: 'anio', nombre: 'Año' },
]

const VISTAS: { id: Vista; nombre: string }[] = [
  { id: 'ausentismo', nombre: 'Ausentismo' },
  { id: 'rotacion', nombre: 'Altas y bajas' },
  { id: 'largas', nombre: 'Licencias largas' },
]

const SELECT =
  'min-w-[200px] rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14.5px] text-neutral-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

const NOMBRE_CORTO: Record<ConvenioRrhh, string> = {
  suvico: 'SUVICO',
  camioneros: 'Camioneros',
  bancarios: 'Bancarios',
  comercio: 'Comercio',
  fuera: 'Fuera de convenio',
}

function fecha(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** Diferencia en puntos porcentuales, en palabras. */
function cambioPuntos(actual: number, anterior: number): string {
  const d = (actual - anterior) * 100
  if (Math.abs(d) < 0.05) return 'igual que el período anterior'
  return `${d > 0 ? 'subió' : 'bajó'} ${Math.abs(d).toFixed(1).replace('.', ',')} puntos contra el período anterior`
}

function Tabla({ children, minimo = 560 }: { children: ReactNode; minimo?: number }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-[14.5px]" style={{ minWidth: minimo }}>
        {children}
      </table>
    </div>
  )
}

function Th({ children, izq }: { children?: ReactNode; izq?: boolean }) {
  return <th className={`px-2 py-2 text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400 ${izq ? 'text-left' : 'text-right'}`}>{children}</th>
}

function Barra({ valor, max, color }: { valor: number; max: number; color: string }) {
  return (
    <span className="block h-4 w-full rounded bg-neutral-100 dark:bg-zinc-800">
      <span className="block h-4 rounded" style={{ width: `${max > 0 ? Math.max(0.5, (valor / max) * 100) : 0}%`, backgroundColor: color }} />
    </span>
  )
}

/** Ausencias, licencias largas, altas, bajas y rotación, con la matriz por convenio. */
export function IndicadoresRrhh({
  indicadores,
  licenciasLargas,
  bajasTempranas,
}: {
  indicadores: Datos
  /** Con nombre: solo perfil RRHH (null si no tiene permiso). */
  licenciasLargas: PersonaLicenciaLargaRrhh[] | null
  bajasTempranas: PersonaBajaRrhh[] | null
}) {
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('mes')
  const [convenio, setConvenio] = useState<ConvenioRrhh | 'todos'>('todos')
  const [elegido, setElegido] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('ausentismo')

  const desdeAusencias = indicadores.primerMesAusencias ?? indicadores.meses[0] ?? ''
  const filas = useMemo(() => filtrarConvenio(indicadores.filas, convenio), [indicadores.filas, convenio])
  const periodos = useMemo(() => agruparIndicadores(filas, agrupacion), [filas, agrupacion])
  const p: TotalIndicadores | undefined = periodos.find((x) => x.clave === elegido) ?? periodos[periodos.length - 1]
  const idx = p ? periodos.indexOf(p) : -1
  const anterior = idx > 0 ? periodos[idx - 1] : undefined
  // El ausentismo solo se muestra desde que Salario registra las ausencias.
  const conAusencias = (x: TotalIndicadores) => x.ultimoMes >= desdeAusencias
  const nombreSeleccion = convenio === 'todos' ? 'Toda la empresa' : NOMBRE_CORTO[convenio]

  const clavePeriodo = p?.clave
  // Para la comparación por convenio: todos los convenios del período elegido.
  const filasPeriodo = useMemo(
    () => (clavePeriodo ? indicadores.filas.filter((f) => claveDe(f.mes, agrupacion).clave === clavePeriodo) : []),
    [clavePeriodo, agrupacion, indicadores.filas],
  )

  if (!p) return <p className="text-body-muted text-[14px]">Todavía no hay datos de personal.</p>

  const aus = tasaAusentismo(p)
  const rot = tasaRotacion(p)
  const largas = totalLicenciasLargas(p)
  const ausAnt = anterior && conAusencias(anterior) ? tasaAusentismo(anterior) : null
  const mostrarAusencias = conAusencias(p)

  const frases: ReactNode[] = []
  if (mostrarAusencias) {
    frases.push(
      <>
        {nombreSeleccion}, {p.etiqueta}: de cada 100 días de trabajo se perdieron <strong>{porcentaje(aus)}</strong> por ausencias (sin contar
        vacaciones). Son {numero(diasAusencia(p))} días; {numero(p.dias.enfermedad)} por enfermedad.
        {ausAnt !== null ? ` El ausentismo ${cambioPuntos(aus, ausAnt)}.` : ''}
      </>,
    )
  }
  frases.push(
    <>
      {p.altas === 1 ? 'Entró ' : 'Entraron '}
      <strong>{numero(p.altas)}</strong> {p.altas === 1 ? 'persona' : 'personas'} y {p.bajas === 1 ? 'se fue ' : 'se fueron '}
      <strong>{numero(p.bajas)}</strong>
      {p.bajasPorMotivo.finContrato > 0 ? ` (${numero(p.bajasPorMotivo.finContrato)} por fin de contrato a plazo, que es una baja prevista)` : ''}.
      {p.bajas > 0 ? ` Rotación: ${porcentaje(rot)} del personal.` : ''}
    </>,
  )
  if (p.bajasTempranas > 0)
    frases.push(
      `${numero(p.bajasTempranas)} de las bajas fueron de personas con menos de 3 meses en la empresa${
        p.bajasTempranasFinContrato > 0 ? ` (${numero(p.bajasTempranasFinContrato)} por fin de contrato a plazo, como los eventuales de temporada)` : ''
      }.`,
    )
  frases.push(
    largas > 0
      ? `Al cierre del período había ${numero(largas)} ${largas === 1 ? 'persona' : 'personas'} con licencia larga: reserva de puesto, ART, maternidad o enfermedad de más de 30 días.`
      : 'Al cierre del período no había personas con licencia larga.',
  )
  if (p.rem > 0) frases.push(`Las horas extra son el ${porcentaje(pesoExtrasEnSueldos(p))} de lo que se paga en sueldos (remunerativo).`)

  const atender: ReactNode[] = []
  if (mostrarAusencias && ausAnt !== null && aus - ausAnt >= 0.005) atender.push(`El ausentismo subió ${((aus - ausAnt) * 100).toFixed(1).replace('.', ',')} puntos. Ver qué áreas y causas lo explican.`)
  if (mostrarAusencias && p.dias.injustificadas > 0) atender.push(`${numero(p.dias.injustificadas)} días de faltas sin aviso (${numero(p.personasFaltas)} personas).`)
  if (tempranasNoPrevistas(p) > 0)
    atender.push(`${numero(tempranasNoPrevistas(p))} ${tempranasNoPrevistas(p) === 1 ? 'persona se fue' : 'personas se fueron'} antes de cumplir 3 meses sin que se le terminara el contrato: revisar selección e inducción.`)
  if (p.bajasPorMotivo.renuncia > 0) atender.push(`${numero(p.bajasPorMotivo.renuncia)} renuncias en el período.`)
  if (p.licenciasLargas.reserva > 0) atender.push(`${numero(p.licenciasLargas.reserva)} personas en reserva de puesto ("en guarda"): definir su situación.`)

  const maxGrupo = Math.max(...GRUPOS.map((g) => p.dias[g.id]))
  const totalEpisodios = p.episodios.corta + p.episodios.media + p.episodios.larga

  // Matriz por convenio del período elegido.
  const matriz = indicadores.convenios
    .map((c) => ({ c, t: sumarIndicadores(filasPeriodo.filter((f) => f.convenio === c.id)) }))
    .filter((x) => x.t.personas > 0)
  const totalMatriz = sumarIndicadores(filasPeriodo)

  const series: Serie[] =
    vista === 'ausentismo'
      ? GRUPOS.map((g) => ({ nombre: g.nombre, color: g.color, valores: periodos.map((x) => (conAusencias(x) ? tasaGrupo(x, g.id) * 100 : 0)) }))
      : vista === 'rotacion'
        ? [
            { nombre: 'Altas', color: '#1baf7a', valores: periodos.map((x) => x.altas) },
            { nombre: 'Bajas', color: '#c62828', valores: periodos.map((x) => x.bajas) },
            { nombre: 'Bajas antes de 3 meses', color: '#f59e0b', valores: periodos.map((x) => x.bajasTempranas) },
          ]
        : LICENCIAS_LARGAS.map((l, i) => ({
            nombre: l.nombre,
            color: ['#7c3aed', '#eb6834', '#2a78d6', '#1baf7a'][i],
            valores: periodos.map((x) => x.licenciasLargas[l.id]),
          }))

  return (
    <div className="grid gap-5">
      <BandaRrhh
        titulo="Ausencias y rotación"
        subtitulo={
          <>
            {nombreSeleccion} · {p.etiqueta}
            {agrupacion === 'mes' ? <span className="block text-[14px] opacity-90">{aclaracionCorte(p.ultimoMes)}</span> : null}
          </>
        }
        tono="real"
      />

      <section className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
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
          <select value={p.clave} onChange={(e) => setElegido(e.target.value)} className={SELECT}>
            {[...periodos].reverse().map((x) => (
              <option key={x.clave} value={x.clave}>
                {x.etiqueta}
                {x.meses < x.mesesTotales ? ` (${x.meses} de ${x.mesesTotales} meses)` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400">
          Convenio
          <select value={convenio} onChange={(e) => setConvenio(e.target.value as ConvenioRrhh | 'todos')} className={SELECT}>
            <option value="todos">Toda la empresa</option>
            {indicadores.convenios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </section>

      <NumerosGrandes
        items={[
          mostrarAusencias
            ? {
                etiqueta: 'Ausentismo',
                valor: porcentaje(aus),
                nota: ausAnt !== null ? cambioPuntos(aus, ausAnt) : 'días perdidos por ausencias, sin vacaciones',
                tono: ausAnt !== null && aus - ausAnt >= 0.005 ? 'rojo' : undefined,
              }
            : { etiqueta: 'Ausentismo', valor: '—', nota: 'Salario no registraba ausencias en este período' },
          {
            etiqueta: 'Entraron / se fueron',
            valor: `${numero(p.altas)} / ${numero(p.bajas)}`,
            nota: p.bajas > 0 ? `rotación ${porcentaje(rot)} · ${numero(bajasNoPrevistas(p))} no previstas` : 'sin bajas',
          },
          { etiqueta: 'Licencias largas al cierre', valor: numero(largas), nota: 'reserva de puesto, ART, maternidad, enfermedad > 30 días' },
        ]}
      />
      <PocasPalabras frases={frases} />
      <AtenderRrhh frases={atender} />

      <TituloDetalle>Ausencias</TituloDetalle>
      {mostrarAusencias ? (
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <TarjetaRrhh titulo={`Ausencias por causa · ${p.etiqueta}`} subtitulo="Días perdidos sobre días liquidados. Sin vacaciones.">
            <Tabla minimo={520}>
              <thead>
                <tr>
                  <Th izq>Causa</Th>
                  <Th>Días</Th>
                  <Th>% de los días</Th>
                  <th className="w-[30%] px-2" />
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {GRUPOS.map((g) => (
                  <tr key={g.id} className="border-t border-neutral-100 dark:border-zinc-800">
                    <td className="py-2 pr-2">{g.nombre}</td>
                    <td className="px-2 py-2 text-right">{numero(p.dias[g.id])}</td>
                    <td className="px-2 py-2 text-right">{porcentaje(tasaGrupo(p, g.id), 2)}</td>
                    <td className="px-2 py-2">
                      <Barra valor={p.dias[g.id]} max={maxGrupo} color={g.color} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-neutral-300 font-semibold dark:border-zinc-600">
                  <td className="py-2 pr-2">Total</td>
                  <td className="px-2 py-2 text-right">{numero(diasAusencia(p))}</td>
                  <td className="px-2 py-2 text-right">{porcentaje(aus, 2)}</td>
                  <td />
                </tr>
              </tbody>
            </Tabla>
            <p className="mt-3 text-[13.5px] text-neutral-600 dark:text-gray-400">
              Personas con al menos un día: {numero(p.personasEnfermedad)} por enfermedad, {numero(p.personasFaltas)} con faltas sin aviso.
              {p.meses > 1 ? ' (sumadas mes a mes)' : ''}
            </p>
          </TarjetaRrhh>

          <TarjetaRrhh titulo="Avisos de enfermedad" subtitulo="Cuántas veces alguien avisó que estaba enfermo, por cuánto duró.">
            <ul className="grid gap-3 text-[16px]">
              {[
                { n: p.episodios.corta, t: 'Cortos (1 a 3 días)', c: '#2a78d6' },
                { n: p.episodios.media, t: 'Medios (4 a 30 días)', c: '#f59e0b' },
                { n: p.episodios.larga, t: 'Largos (más de 30 días)', c: '#c62828' },
              ].map((x) => (
                <li key={x.t} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <span>{x.t}</span>
                  <strong className="tabular-nums">{numero(x.n)}</strong>
                  <span className="col-span-2">
                    <Barra valor={x.n} max={Math.max(1, totalEpisodios)} color={x.c} />
                  </span>
                </li>
              ))}
            </ul>
            {totalEpisodios > 0 ? (
              <p className="mt-3 text-[14px] text-neutral-700 dark:text-gray-300">
                {porcentaje(p.episodios.corta / totalEpisodios, 0)} son ausencias de 1 a 3 días: son las que más desordenan los turnos y obligan a cubrir con horas extra.
              </p>
            ) : null}
          </TarjetaRrhh>
        </div>
      ) : (
        <TarjetaRrhh titulo="Ausencias">
          <p className="text-[15px] text-neutral-700 dark:text-gray-300">Salario empezó a registrar las ausencias en la liquidación desde {desdeAusencias.slice(4)}/{desdeAusencias.slice(0, 4)}. Elegí un período posterior.</p>
        </TarjetaRrhh>
      )}

      <TarjetaRrhh titulo={`Licencias largas al cierre · ${p.etiqueta}`} subtitulo="Personas que no están trabajando por un tiempo largo y siguen en la nómina.">
        <ul className="grid gap-2 text-[16px] sm:grid-cols-2">
          {LICENCIAS_LARGAS.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-zinc-700">
              <span>{l.nombre}</span>
              <strong className="tabular-nums">{numero(p.licenciasLargas[l.id])}</strong>
            </li>
          ))}
        </ul>
        {licenciasLargas && licenciasLargas.length > 0 && p.ultimoMes === indicadores.meses[indicadores.meses.length - 1] ? (
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">Quiénes son (solo RRHH)</p>
            <Tabla>
              <thead>
                <tr>
                  <Th izq>Persona</Th>
                  <Th izq>Área</Th>
                  <Th izq>Licencia</Th>
                  <Th>Desde</Th>
                  <Th>Hasta</Th>
                  <Th>Días</Th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {licenciasLargas
                  .filter((x) => convenio === 'todos' || x.convenio === convenio)
                  .map((x) => (
                    <tr key={`${x.legajo}-${x.tipo}`} className="border-t border-neutral-100 dark:border-zinc-800">
                      <td className="px-2 py-1.5">
                        {x.nombre} <span className="text-[12px] text-neutral-500">({x.legajo})</span>
                      </td>
                      <td className="px-2 py-1.5">{x.area}</td>
                      <td className="px-2 py-1.5">{LICENCIAS_LARGAS.find((l) => l.id === x.tipo)?.nombre}</td>
                      <td className="px-2 py-1.5 text-right">{fecha(x.desde)}</td>
                      <td className="px-2 py-1.5 text-right">{fecha(x.hasta)}</td>
                      <td className="px-2 py-1.5 text-right">{numero(x.dias)}</td>
                    </tr>
                  ))}
              </tbody>
            </Tabla>
          </div>
        ) : null}
      </TarjetaRrhh>

      <TituloDetalle>Altas y bajas</TituloDetalle>
      <div className="grid gap-5 lg:grid-cols-2">
        <TarjetaRrhh titulo={`Por qué se fueron · ${p.etiqueta}`}>
          <Tabla minimo={360}>
            <tbody className="tabular-nums">
              {MOTIVOS.map((m) => (
                <tr key={m.id} className="border-t border-neutral-100 dark:border-zinc-800">
                  <td className="py-2 pr-2">{m.nombre}</td>
                  <td className="px-2 py-2 text-right">{numero(p.bajasPorMotivo[m.id])}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-300 font-semibold dark:border-zinc-600">
                <td className="py-2 pr-2">Total de bajas</td>
                <td className="px-2 py-2 text-right">{numero(p.bajas)}</td>
              </tr>
            </tbody>
          </Tabla>
        </TarjetaRrhh>
        <TarjetaRrhh titulo="Rotación">
          <dl className="grid gap-3 text-[16px]">
            {[
              ['Personas (promedio por mes)', numero(p.personas)],
              ['Altas', numero(p.altas)],
              ['Bajas', numero(p.bajas)],
              ['Rotación (bajas sobre personas)', porcentaje(rot)],
              ['Rotación sin fines de contrato', porcentaje(p.personas > 0 ? bajasNoPrevistas(p) / p.personas : 0)],
              ['Bajas antes de 3 meses', `${numero(p.bajasTempranas)}${p.bajasTempranasFinContrato > 0 ? ` (${numero(p.bajasTempranasFinContrato)} fin de contrato)` : ''}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-neutral-100 pb-2 dark:border-zinc-800">
                <dt>{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </TarjetaRrhh>
      </div>
      {bajasTempranas && bajasTempranas.length > 0 ? (
        <TarjetaRrhh titulo="Se fueron antes de los 3 meses · últimos 12 meses (solo RRHH)">
          <details>
          <summary className="cursor-pointer text-[15px] text-neutral-800 dark:text-gray-200">
            {numero(bajasTempranas.filter((x) => convenio === 'todos' || x.convenio === convenio).length)} personas
            {' · '}
            {numero(bajasTempranas.filter((x) => (convenio === 'todos' || x.convenio === convenio) && x.motivo === 'finContrato').length)} por fin de
            contrato a plazo. Tocá para ver la lista.
          </summary>
          <div className="mt-3">
          <Tabla minimo={680}>
            <thead>
              <tr>
                <Th izq>Persona</Th>
                <Th izq>Área</Th>
                <Th>Entró</Th>
                <Th>Se fue</Th>
                <Th>Días</Th>
                <Th izq>Motivo</Th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {bajasTempranas
                .filter((x) => convenio === 'todos' || x.convenio === convenio)
                .map((x) => (
                  <tr key={`${x.legajo}-${x.egreso}`} className="border-t border-neutral-100 dark:border-zinc-800">
                    <td className="px-2 py-1.5">
                      {x.nombre} <span className="text-[12px] text-neutral-500">({x.legajo})</span>
                    </td>
                    <td className="px-2 py-1.5">{x.area}</td>
                    <td className="px-2 py-1.5 text-right">{fecha(x.ingreso)}</td>
                    <td className="px-2 py-1.5 text-right">{fecha(x.egreso)}</td>
                    <td className="px-2 py-1.5 text-right">{numero(x.diasTrabajados)}</td>
                    <td className="px-2 py-1.5">{MOTIVOS.find((m) => m.id === x.motivo)?.nombre}</td>
                  </tr>
                ))}
            </tbody>
          </Tabla>
          </div>
          </details>
        </TarjetaRrhh>
      ) : null}

      <TituloDetalle>Comparación por convenio</TituloDetalle>
      <TarjetaRrhh
        titulo={`Indicadores por convenio · ${p.etiqueta}`}
        subtitulo="En rojo, lo que está peor que el promedio de la empresa. Cada convenio con su propio corte de liquidación."
      >
        <Tabla minimo={980}>
          <thead>
            <tr>
              <Th izq>Convenio</Th>
              <Th>Personas</Th>
              <Th>Ausentismo</Th>
              <Th>Enfermedad</Th>
              <Th>Faltas sin aviso (días)</Th>
              <Th>Horas extra por cada 100 normales</Th>
              <Th>Horas extra en el sueldo</Th>
              <Th>Altas / bajas</Th>
              <Th>Rotación</Th>
              <Th>Bajas antes de 3 meses</Th>
              <Th>Licencias largas</Th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[...matriz, { c: { id: 'total' as const, nombre: 'Toda la empresa', corte: 'calendario' as const }, t: totalMatriz }].map(({ c, t }) => {
              const total = c.id === 'total'
              const rojo = (malo: boolean) => (!total && malo ? 'font-semibold text-red-700 dark:text-red-400' : '')
              return (
                <tr key={c.id} className={`border-t ${total ? 'border-t-2 border-neutral-300 font-semibold dark:border-zinc-600' : 'border-neutral-100 dark:border-zinc-800'}`}>
                  <td className="px-2 py-2">
                    {c.nombre}
                    {!total && agrupacion === 'mes' ? (
                      <span className="block text-[12px] font-normal text-neutral-500 dark:text-gray-400">del {rangoLiquidacion(p.ultimoMes, c.corte)}</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right">{numero(t.personas)}</td>
                  <td className={`px-2 py-2 text-right ${rojo(tasaAusentismo(t) > tasaAusentismo(totalMatriz))}`}>{mostrarAusencias ? porcentaje(tasaAusentismo(t)) : '—'}</td>
                  <td className="px-2 py-2 text-right">{mostrarAusencias ? porcentaje(tasaGrupo(t, 'enfermedad')) : '—'}</td>
                  <td className="px-2 py-2 text-right">{mostrarAusencias ? numero(t.dias.injustificadas) : '—'}</td>
                  <td className={`px-2 py-2 text-right ${rojo(ratioHorasExtra(t) > ratioHorasExtra(totalMatriz))}`}>{numero(ratioHorasExtra(t) * 100)}</td>
                  <td className={`px-2 py-2 text-right ${rojo(pesoExtrasEnSueldos(t) > pesoExtrasEnSueldos(totalMatriz))}`}>{porcentaje(pesoExtrasEnSueldos(t))}</td>
                  <td className="px-2 py-2 text-right">
                    {numero(t.altas)} / {numero(t.bajas)}
                  </td>
                  <td className={`px-2 py-2 text-right ${rojo(tasaRotacion(t) > tasaRotacion(totalMatriz))}`}>{porcentaje(tasaRotacion(t))}</td>
                  <td className="px-2 py-2 text-right">{numero(t.bajasTempranas)}</td>
                  <td className="px-2 py-2 text-right">{numero(totalLicenciasLargas(t))}</td>
                </tr>
              )
            })}
          </tbody>
        </Tabla>
      </TarjetaRrhh>

      <TituloDetalle>Evolución</TituloDetalle>
      <TarjetaRrhh titulo={`Evolución · ${nombreSeleccion}`} subtitulo="Pasá el mouse sobre una barra para ver el detalle.">
        <div className="mb-3">
          <Segmentado etiqueta="Qué mirar" opciones={VISTAS} valor={vista} onChange={setVista} />
        </div>
        <GraficoBarras
          etiquetas={periodos.map((x) => x.etiquetaCorta)}
          subetiquetas={periodos.map((x) => (x.meses < x.mesesTotales ? `${x.meses} de ${x.mesesTotales} meses` : vista === 'ausentismo' && !conAusencias(x) ? 'sin datos' : ''))}
          estimados={periodos.map(() => false)}
          series={series}
          formato={vista === 'ausentismo' ? (v) => `${v.toFixed(1).replace('.', ',')}%` : (v) => numero(v)}
          apilado={vista !== 'rotacion'}
        />
        {vista === 'largas' ? <p className="mt-2 text-[12.5px] text-neutral-600 dark:text-gray-400">Personas al cierre de cada período.</p> : null}
      </TarjetaRrhh>

      <TarjetaRrhh titulo="Lo que todavía no se puede medir" subtitulo="No está en Salario. Se suma cuando tengamos la fuente.">
        <ul className="grid list-disc gap-1.5 pl-5 text-[15px] text-neutral-700 dark:text-gray-300">
          <li>Juicios y reclamos laborales.</li>
          <li>Sanciones (apercibimientos). Las suspensiones sí están, en ausencias.</li>
          <li>Documentación al día (aptos médicos, carnet, habilitaciones).</li>
          <li>Dotación presupuestada, para comparar con la real.</li>
          <li>Errores de liquidación (hoy solo se detectan pagos duplicados).</li>
        </ul>
      </TarjetaRrhh>

      <TarjetaRrhh titulo="Cómo se calculó">
        <ul className="grid list-disc gap-2 pl-5 text-[14px] leading-snug text-neutral-700 dark:text-gray-300">
          {indicadores.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </TarjetaRrhh>
    </div>
  )
}
