import { useState } from 'react'
import type {
  AreaAnualRrhh,
  AreaRrhh,
  CifrasPeriodoRrhh,
  PeriodoRrhh,
  PersonaLimiteRrhh,
  PersonaMesRrhh,
  RecomendacionRrhh,
  VisionAnualRrhh,
} from '../../services/rrhhApi'
import {
  AusenciasRrhh,
  CausasRrhh,
  CifrasRrhh,
  TablaAreasRrhh,
  Variacion,
} from './BloquesReporteRrhh'
import { aclaracionCorte, mesLargo, nombreMes, numero, numero1, pesosCorto } from './formatoRrhh'
import {
  AtenderRrhh,
  BandaRrhh,
  BarrasGasto,
  NotaRrhh,
  NumerosGrandes,
  PocasPalabras,
  TareasRrhh,
  TituloDetalle,
  type BarraGasto,
  type NumeroGrande,
} from './ResumenSimpleRrhh'
import { atencionDelMes } from './atencionRrhh'
import { BotonExportarRrhh } from './BotonExportarRrhh'
import { descargarCsv, nombreArchivo } from './exportarRrhh'
import { tareasDeRecomendaciones } from './tareasRecomendaciones'
import { LimiteLegalRrhh } from './LimiteLegalRrhh'
import { LineaTiempoRrhh, type MesAgregado } from './LineaTiempoRrhh'
import { RecomendacionesRrhh } from './RecomendacionesRrhh'
import { TarjetaRrhh } from './TarjetaRrhh'
import { VacacionesRrhh } from './VacacionesRrhh'

export type SeleccionArea = number | 'todas'

/** Cifras y frases del período para la selección: toda la empresa o un área. */
function vistaPeriodo(p: PeriodoRrhh, sel: SeleccionArea): { cifras: CifrasPeriodoRrhh; claves: string[] } | null {
  if (sel === 'todas') return { cifras: p.total, claves: p.claves }
  const a = p.areas.find((x) => x.cc === sel)
  return a ? { cifras: a, claves: a.claves } : null
}

function SinDatosArea() {
  return <p className="text-body-muted text-[14px]">Esta área no tuvo horas extra en este período.</p>
}

const LEYENDA_COSTO =
  'Costo para la empresa: lo liquidado más contribuciones, provisiones de aguinaldo y despidos, y el mayor pago de vacaciones. En pesos de cada mes.'

/** Frases para "En pocas palabras": sin la primera (repite los números grandes) ni la de horas pactadas (va en la nota). */
function frasesSimples(claves: string[], maximo = 4): string[] {
  return claves.slice(1).filter((c) => !c.startsWith('De ese costo')).slice(0, maximo)
}

function comparacion(c: CifrasPeriodoRrhh): NumeroGrande {
  const ant = c.anterior
  if (!ant || ant.costo <= 0) return { etiqueta: 'Comparado con el mes anterior', valor: '—' }
  const dif = c.costo - ant.costo
  const pct = Math.round((dif / ant.costo) * 100)
  return {
    etiqueta: `Comparado con ${nombreMes(ant.mes)}`,
    valor: `${dif > 0 ? '▲' : '▼'} ${pesosCorto(Math.abs(dif))}`,
    tono: dif > 0 ? 'rojo' : 'verde',
    nota: Math.abs(pct) < 3 ? 'casi igual' : `${Math.abs(pct)}% ${dif > 0 ? 'más' : 'menos'}`,
  }
}

/** Barras por área con las horas pactadas aparte, en gris. */
function barrasDelPeriodo(p: PeriodoRrhh): BarraGasto[] {
  const todas = p.areas.map((a) => ({ nombre: a.nombre, valor: Math.max(0, a.costo - (a.costoPactadas ?? 0)) }))
  const items = agruparChicas(todas)
  if ((p.costoPactadas ?? 0) > 0) items.push({ nombre: 'Horas pactadas (acuerdos)', valor: p.costoPactadas ?? 0, gris: true })
  return items
}

/** Las áreas que gastan menos del 3% van juntas en "Otras áreas" para que el gráfico se lea fácil. */
function agruparChicas(items: BarraGasto[]): BarraGasto[] {
  const total = items.reduce((s, i) => s + i.valor, 0)
  const grandes = items.filter((i) => i.valor >= total * 0.03 && i.nombre !== 'Otras áreas').sort((a, b) => b.valor - a.valor)
  const resto = total - grandes.reduce((s, i) => s + i.valor, 0)
  return resto > 0.5 ? [...grandes, { nombre: 'Otras áreas', valor: resto }] : grandes
}

function NotaPactadas({ periodo, seleccion, verbo }: { periodo: PeriodoRrhh; seleccion: SeleccionArea; verbo: 'son' | 'serían' }) {
  const monto = seleccion === 'todas' ? (periodo.costoPactadas ?? 0) : (periodo.areas.find((a) => a.cc === seleccion)?.costoPactadas ?? 0)
  if (monto <= 0) return null
  return (
    <NotaRrhh>
      De ese costo, <strong>{pesosCorto(monto)} {verbo} horas pactadas</strong> (acuerdos individuales). No se pueden reducir y se ven en
      su propia pestaña.
    </NotaRrhh>
  )
}


/* ---------- Mes cerrado ---------- */

export function PeriodoCerradoRrhh({
  periodo,
  seleccion,
  personas,
  unidadDeCc,
}: {
  periodo: PeriodoRrhh
  seleccion: SeleccionArea
  personas: PersonaMesRrhh[] | null
  /** Nombre de la unidad de negocio de un centro de costo, para agrupar la lista de personas. */
  unidadDeCc?: (cc: number) => string | undefined
}) {
  const vista = vistaPeriodo(periodo, seleccion)
  const mes = mesLargo(periodo.mes)
  return (
    <div className="grid gap-5">
      <BandaRrhh
        titulo={mes}
        subtitulo={
          <>
            Mes cerrado · datos reales de la liquidación de sueldos
            <span className="block text-[14px] opacity-90">{aclaracionCorte(periodo.mes)}</span>
          </>
        }
        tono="real"
      />
      {!vista ? (
        <SinDatosArea />
      ) : (
        <>
          <NumerosGrandes
            items={[
              { etiqueta: 'Se pagaron', valor: `${numero(vista.cifras.horasTotal)} h`, nota: 'horas extra, incluidas las de feriados' },
              { etiqueta: 'Le costaron a la empresa', valor: pesosCorto(vista.cifras.costo), nota: 'con cargas sociales, aguinaldo y vacaciones' },
              comparacion(vista.cifras),
            ]}
          />
          <NotaPactadas periodo={periodo} seleccion={seleccion} verbo="son" />
          <PocasPalabras frases={frasesSimples(vista.claves)} />
          {seleccion === 'todas' ? <BarrasGasto items={barrasDelPeriodo(periodo)} /> : null}
          <AtenderRrhh frases={atencionDelMes(periodo, vista.cifras, seleccion)} />
          <TituloDetalle>Detalle para RRHH y gerencia</TituloDetalle>
          <TarjetaRrhh titulo="¿Por qué se generaron las horas extra?">
            <CausasRrhh causas={vista.cifras.causas} />
          </TarjetaRrhh>
          {seleccion === 'todas' ? (
            <TarjetaRrhh titulo="Por área" pie={LEYENDA_COSTO}>
              <TablaAreasRrhh areas={periodo.areas} estimado={false} seleccion={seleccion} />
            </TarjetaRrhh>
          ) : null}
          <TarjetaRrhh titulo="Vacaciones y licencias del mes" subtitulo="Días liquidados por tipo de ausencia.">
            <AusenciasRrhh cifras={vista.cifras} />
          </TarjetaRrhh>
          {personas ? (
            <PersonasMesRrhh
              personas={personas}
              mes={periodo.mes}
              totalEsperado={vista.cifras.horasTotal}
              porArea={seleccion === 'todas'}
              nombreSeleccion={seleccion === 'todas' ? 'Toda la empresa' : (periodo.areas.find((a) => a.cc === seleccion)?.nombre ?? '')}
              unidadDeCc={unidadDeCc}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

function PersonasMesRrhh({
  personas,
  mes,
  totalEsperado,
  porArea,
  nombreSeleccion,
  unidadDeCc,
}: {
  personas: PersonaMesRrhh[]
  mes: string
  totalEsperado: number
  porArea: boolean
  nombreSeleccion: string
  unidadDeCc?: (cc: number) => string | undefined
}) {
  const [buscar, setBuscar] = useState('')
  const [agrupar, setAgrupar] = useState<'area' | 'unidad'>('area')
  const ordenadas = [...personas].sort((a, b) => b.horasTotal - a.horasTotal)
  const total = ordenadas.reduce((s, p) => s + p.horasTotal, 0)
  const cuadra = Math.abs(total - totalEsperado) < 0.6
  const t = buscar.trim().toLowerCase()
  const visibles = t ? ordenadas.filter((p) => p.nombre.toLowerCase().includes(t) || String(p.legajo).includes(t)) : ordenadas
  const unidadDe = (p: PersonaMesRrhh) => (p.cc !== undefined ? unidadDeCc?.(p.cc) : undefined) ?? 'Sin unidad'
  const grupoDe = (p: PersonaMesRrhh) => (agrupar === 'unidad' ? unidadDe(p) : p.area)
  // Con "toda la empresa", agrupadas por área o unidad de negocio, con su subtotal (de mayor a menor).
  const grupos: { nombre: string; lista: PersonaMesRrhh[]; horas: number }[] = []
  if (porArea) {
    const m = new Map<string, PersonaMesRrhh[]>()
    for (const p of visibles) m.set(grupoDe(p), [...(m.get(grupoDe(p)) ?? []), p])
    for (const [nombre, lista] of m) grupos.push({ nombre, lista, horas: lista.reduce((s, p) => s + p.horasTotal, 0) })
    grupos.sort((a, b) => b.horas - a.horas)
  } else {
    grupos.push({ nombre: '', lista: visibles, horas: visibles.reduce((s, p) => s + p.horasTotal, 0) })
  }
  const exportar = () =>
    descargarCsv(
      nombreArchivo('horas extra', nombreSeleccion, mesLargo(mes)),
      ['Legajo', 'Apellido y nombre', 'Unidad de negocio', 'Área', 'Puesto', 'Horas al 50%', 'Horas al 100%', 'Horas en feriado', 'Total horas'],
      grupos.flatMap((g) => g.lista).map((p) => [p.legajo, p.nombre, unidadDe(p), p.area, p.puesto, p.horas50, p.horas100, p.horasFeriado, p.horasTotal]),
    )
  const fila = (p: PersonaMesRrhh, i: number) => (
    <tr key={p.legajo} className="border-t border-neutral-100 dark:border-zinc-800">
      <td className="px-2 py-1.5 text-neutral-500">{i + 1}</td>
      <td className="py-1.5 pr-2 text-neutral-900 dark:text-gray-100">
        {p.nombre}
        <span className="block text-[11.5px] text-neutral-500 dark:text-gray-400">Legajo {p.legajo}</span>
      </td>
      <td className="px-2 py-1.5 text-neutral-700 dark:text-gray-300">
        {p.area}
        {p.puesto ? <span className="block text-[11.5px] text-neutral-500 dark:text-gray-400">{p.puesto}</span> : null}
      </td>
      <td className="px-2 py-1.5 text-right">{numero1(p.horas50)}</td>
      <td className="px-2 py-1.5 text-right">{numero1(p.horas100)}</td>
      <td className="px-2 py-1.5 text-right">{numero1(p.horasFeriado)}</td>
      <td className="px-2 py-1.5 text-right font-semibold">{numero1(p.horasTotal)}</td>
    </tr>
  )
  return (
    <TarjetaRrhh
      titulo={`Quiénes hicieron horas extra en ${nombreMes(mes)} · ${nombreSeleccion}`}
      subtitulo="Todas las personas que cobraron horas extra, de la que más hizo a la que menos. Solo lo ve el perfil RRHH."
    >
      {personas.length === 0 ? (
        <p className="text-body-muted text-[13px]">Nadie cobró horas extra.</p>
      ) : (
        <div className="grid gap-3">
          {!cuadra ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Esta lista está incompleta ({numero1(total)} h de {numero1(totalEsperado)} h): es de un procesamiento anterior que guardaba solo a las 25
              personas con más horas. Tocá "Actualizar desde Salario" y después "Volver a procesar igual".
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] text-neutral-800 dark:text-gray-200">
              <strong>{numero(personas.length)}</strong> personas · <strong>{numero1(total)} h</strong>
              {cuadra ? <span className="ml-2 text-[13px] text-emerald-700 dark:text-emerald-400">✓ suman el total de arriba</span> : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {porArea && unidadDeCc ? (
                <select
                  value={agrupar}
                  onChange={(e) => setAgrupar(e.target.value as 'area' | 'unidad')}
                  aria-label="Agrupar por"
                  className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
                >
                  <option value="area">Agrupar por centro de costo</option>
                  <option value="unidad">Agrupar por unidad de negocio</option>
                </select>
              ) : null}
              <input
                type="search"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar por nombre o legajo"
                className="min-w-[220px] rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
              />
              <BotonExportarRrhh onClick={exportar} />
            </div>
          </div>
          <div className="max-h-[620px] max-w-full overflow-auto rounded-lg border border-neutral-200 dark:border-zinc-700">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-neutral-50 dark:bg-zinc-800">
                <tr className="text-left text-[11.5px] text-neutral-600 dark:text-gray-400">
                  <th className="px-2 py-1.5 font-semibold">#</th>
                  <th className="px-2 py-1.5 font-semibold">Persona</th>
                  <th className="px-2 py-1.5 font-semibold">Área · puesto</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Comunes (50%)</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Al doble (100%)</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Feriado</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              {grupos.map((g) => (
                <tbody key={g.nombre || 'todas'} className="tabular-nums">
                  {porArea ? (
                    <tr className="border-t-2 border-neutral-300 bg-slate-100 font-semibold dark:border-zinc-600 dark:bg-zinc-800/70">
                      <td colSpan={6} className="px-2 py-1.5 text-[13.5px] text-[#1f3b63] dark:text-blue-300">
                        {g.nombre} · {numero(g.lista.length)} personas
                      </td>
                      <td className="px-2 py-1.5 text-right">{numero1(g.horas)}</td>
                    </tr>
                  ) : null}
                  {g.lista.map(fila)}
                </tbody>
              ))}
              <tbody className="tabular-nums">
                <tr className="border-t-2 border-neutral-400 font-semibold dark:border-zinc-500">
                  <td colSpan={3} className="px-2 py-2">
                    Total{t ? ' de la búsqueda' : ''}
                  </td>
                  <td className="px-2 py-2 text-right">{numero1(visibles.reduce((s, p) => s + p.horas50, 0))}</td>
                  <td className="px-2 py-2 text-right">{numero1(visibles.reduce((s, p) => s + p.horas100, 0))}</td>
                  <td className="px-2 py-2 text-right">{numero1(visibles.reduce((s, p) => s + p.horasFeriado, 0))}</td>
                  <td className="px-2 py-2 text-right">{numero1(visibles.reduce((s, p) => s + p.horasTotal, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </TarjetaRrhh>
  )
}

/* ---------- Mes en curso ---------- */

function cifrasEstimadas(c: CifrasPeriodoRrhh, feriados: number, feriadosDetalle: string[]) {
  return [
    { etiqueta: 'Horas extra estimadas', valor: numero(c.horasTotal), nota: 'incluye feriados' },
    { etiqueta: 'Costo estimado', valor: pesosCorto(c.costo), nota: <Variacion cifras={c} /> },
    {
      etiqueta: 'Feriados del mes',
      valor: numero(feriados),
      nota: feriadosDetalle.length ? feriadosDetalle.join(' · ') : 'sin feriados',
    },
    {
      etiqueta: 'Vacaciones cargadas en Salario',
      valor: `${numero(c.vacacionesCargadas ?? 0)} días`,
      nota:
        (c.vacacionesPosibles ?? 0) > 0
          ? `se pueden sumar ${numero(c.vacacionesPosibles ?? 0)} días sin generar horas extra`
          : 'sin margen para sumar sin horas extra',
    },
  ]
}

export function MesEnCursoRrhh({
  periodo,
  seleccion,
  recomendaciones,
}: {
  periodo: PeriodoRrhh
  seleccion: SeleccionArea
  recomendaciones: RecomendacionRrhh[]
}) {
  const vista = vistaPeriodo(periodo, seleccion)
  return (
    <div className="grid gap-5">
      <BandaRrhh
        titulo={mesLargo(periodo.mes)}
        subtitulo={
          <>
            Mes en curso · todavía no se liquidó: son <strong>números estimados</strong>
          </>
        }
        tono="estimado"
      />
      {!vista ? (
        <SinDatosArea />
      ) : (
        <>
          <NumerosGrandes
            items={[
              { etiqueta: 'Se esperan unas', valor: `${numero(vista.cifras.horasTotal)} h`, nota: 'horas extra, incluidas las de feriados' },
              { etiqueta: 'Costarían unos', valor: pesosCorto(vista.cifras.costo), nota: 'con cargas sociales, aguinaldo y vacaciones' },
              comparacion(vista.cifras),
            ]}
          />
          <NotaPactadas periodo={periodo} seleccion={seleccion} verbo="serían" />
          <PocasPalabras frases={frasesSimples(vista.claves)} />
          <TareasRrhh titulo={`Qué hacer en ${nombreMes(periodo.mes)}`} tareas={tareasDeRecomendaciones(recomendaciones, 5)} />
          <TituloDetalle>Detalle para RRHH y gerencia</TituloDetalle>
          <CifrasRrhh items={cifrasEstimadas(vista.cifras, periodo.feriados, periodo.feriadosDetalle)} />
          <TarjetaRrhh titulo={`Todas las recomendaciones de ${nombreMes(periodo.mes)}`}>
            <RecomendacionesRrhh recomendaciones={recomendaciones} />
          </TarjetaRrhh>
          <TarjetaRrhh titulo="¿De dónde vendrían las horas extra?">
            <CausasRrhh causas={vista.cifras.causas} />
          </TarjetaRrhh>
          {seleccion === 'todas' ? (
            <TarjetaRrhh titulo="Por área (estimado)" pie={LEYENDA_COSTO}>
              <TablaAreasRrhh areas={periodo.areas} estimado seleccion={seleccion} />
            </TarjetaRrhh>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ---------- Previsión y prevención ---------- */

export function PrevisionRrhh({
  periodos,
  seleccion,
  recomendaciones,
  lineaTiempo,
  areasInforme,
  mesesVacaciones,
  ultimoCerrado,
}: {
  periodos: PeriodoRrhh[]
  seleccion: SeleccionArea
  recomendaciones: RecomendacionRrhh[]
  lineaTiempo: MesAgregado[]
  areasInforme: AreaRrhh[]
  mesesVacaciones: string[]
  ultimoCerrado: PeriodoRrhh | undefined
}) {
  const referencia = ultimoCerrado ? (vistaPeriodo(ultimoCerrado, seleccion)?.cifras.costo ?? 0) : 0
  return (
    <div className="grid gap-5">
      <BandaRrhh
        titulo={`Lo que viene · ${periodos.map((p) => nombreMes(p.mes)).join(', ').replace(/, ([^,]*)$/, ' y $1')}`}
        subtitulo="Previsión: qué va a pasar si se sigue trabajando igual, y cómo evitarlo"
        tono="estimado"
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {periodos.map((p) => {
          const vista = vistaPeriodo(p, seleccion)
          if (!vista) {
            return (
              <div key={p.mes} className="rounded-xl border-2 border-neutral-200 p-4 dark:border-zinc-700">
                <h3 className="text-[22px] font-bold">{mesLargo(p.mes)}</h3>
                <SinDatosArea />
              </div>
            )
          }
          const c = vista.cifras
          const ratio = referencia > 0 ? c.costo / referencia : 1
          const nivel = ratio >= 1.25 ? { t: 'MUY ALTO', b: 'border-red-700', f: 'bg-red-700' } : ratio >= 1.1 ? { t: 'ALTO', b: 'border-amber-600', f: 'bg-amber-600' } : { t: 'NORMAL', b: 'border-emerald-700', f: 'bg-emerald-700' }
          return (
            <div key={p.mes} className={`rounded-xl border-[3px] bg-white p-4 dark:bg-zinc-900 ${nivel.b}`}>
              <h3 className="text-[22px] font-bold text-neutral-900 dark:text-gray-100">{mesLargo(p.mes)}</h3>
              <span className={`mt-1 inline-block rounded-full px-3 py-0.5 text-[13px] font-bold text-white ${nivel.f}`}>{nivel.t}</span>
              <p className="mt-3 text-[30px] font-bold leading-tight tabular-nums text-neutral-900 dark:text-gray-100">{pesosCorto(c.costo)}</p>
              <p className="text-[14.5px] text-neutral-600 dark:text-gray-400">unas {numero(c.horasTotal)} horas extra</p>
              <div className="mt-3 grid gap-2 text-[16px] leading-snug text-neutral-800 dark:text-gray-200">
                {p.feriados > 0 ? (
                  <p>
                    <strong>
                      {p.feriados} {p.feriados === 1 ? 'feriado' : 'feriados'}:
                    </strong>{' '}
                    {p.feriadosDetalle.join(', ')}. Suman unas {numero(c.horasFeriado)} horas pagadas al doble.
                  </p>
                ) : (
                  <p>Sin feriados.</p>
                )}
                {c.diasVacaciones > (c.vacacionesCargadas ?? 0) + 10 && c.causas.ausencias > 50 ? (
                  <p>
                    <strong>Vacaciones:</strong> si salen como el año pasado ({numero(c.diasVacaciones)} días), se pagarían unas{' '}
                    {numero(c.causas.ausencias)} horas extra para cubrirlas.
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      {referencia > 0 ? (
        <p className="text-[16px] text-neutral-700 dark:text-gray-300">
          Para comparar: en {nombreMes(ultimoCerrado?.mes ?? '')} se gastaron <strong>{pesosCorto(referencia)}</strong>.
        </p>
      ) : null}
      <TareasRrhh titulo="Para prevenirlo: qué hacer y cuándo" tareas={tareasDeRecomendaciones(recomendaciones, 7)} />
      <TituloDetalle>Detalle para RRHH y gerencia</TituloDetalle>
      <TarjetaRrhh titulo="Todas las recomendaciones para los próximos meses">
        <RecomendacionesRrhh recomendaciones={recomendaciones} />
      </TarjetaRrhh>

      <TarjetaRrhh
        titulo="Cómo vienen y cómo siguen las horas extra"
        subtitulo="Los meses cerrados son reales; el mes en curso y los siguientes son estimados (barras rayadas)."
      >
        {lineaTiempo.length > 0 ? <LineaTiempoRrhh meses={lineaTiempo} /> : <SinDatosArea />}
      </TarjetaRrhh>

      <TarjetaRrhh
        titulo="Vacaciones: cuántas se pueden dar sin generar horas extra"
        subtitulo="Para cada mes: días que el área puede cubrir con su propio personal / días ya cargados en Salario. Las vacaciones se avisan con 30 días de anticipación."
      >
        <VacacionesRrhh areas={areasInforme} meses={mesesVacaciones} />
      </TarjetaRrhh>
    </div>
  )
}

/* ---------- Visión anual (aparte) ---------- */

export function VisionAnualRrhh({
  anual,
  seleccion,
  areasInforme,
  personas,
}: {
  anual: VisionAnualRrhh
  seleccion: SeleccionArea
  areasInforme: AreaRrhh[]
  personas: PersonaLimiteRrhh[] | null
}) {
  const area: AreaAnualRrhh | undefined = seleccion === 'todas' ? undefined : anual.areas.find((a) => a.cc === seleccion)
  const claves = seleccion === 'todas' ? anual.claves : (area?.claves ?? [])
  const horas = area ? area.horasTotal : anual.horasTotal
  const costo = area ? area.costo : anual.costo
  const superaron = area ? area.superaron : anual.superaron
  const van = area ? area.vanASuperar : anual.vanASuperar
  const pendientes = area ? area.vacacionesPendientes : anual.vacaciones.pendiente
  const derecho = area ? area.vacacionesDerecho : anual.vacaciones.derecho
  return (
    <div className="grid gap-5">
      <BandaRrhh
        titulo={`Visión anual ${anual.anio}`}
        subtitulo={`Aparte del reporte mensual · suma de ${nombreMes(anual.desde)} a ${nombreMes(anual.hasta)}`}
        tono="anual"
      />
      <NumerosGrandes
        items={[
          { etiqueta: 'En el año se pagaron', valor: `${numero(horas)} h`, nota: 'horas extra, incluidas las de feriados' },
          {
            etiqueta: 'Costaron',
            valor: pesosCorto(costo),
            nota: area ? 'con cargas sociales, aguinaldo y vacaciones' : `${pesosCorto(anual.costoPromedioMes)} por mes, en promedio`,
          },
          {
            etiqueta: 'Pasaron el máximo legal del año',
            valor: `${numero(superaron)} personas`,
            tono: superaron > 0 ? 'rojo' : undefined,
            nota: van > 0 ? `más de 200 horas extra · y ${numero(van)} más lo van a pasar` : 'más de 200 horas extra',
          },
        ]}
      />
      {seleccion === 'todas' && (anual.costoPactadas ?? 0) > 0 ? (
        <NotaRrhh>
          De ese costo, <strong>{pesosCorto(anual.costoPactadas ?? 0)} fueron horas pactadas</strong> (acuerdos individuales).
        </NotaRrhh>
      ) : null}
      <PocasPalabras frases={frasesSimples(claves, 5)} />
      {seleccion === 'todas' ? (
        <BarrasGasto titulo="¿Dónde se gastó en el año?" items={agruparChicas(anual.areas.map((a) => ({ nombre: a.nombre, valor: a.costo })))} />
      ) : null}
      <TituloDetalle>Detalle para RRHH y gerencia</TituloDetalle>
      <CifrasRrhh
        items={[
          {
            etiqueta: `Vacaciones pendientes (temporada ${anual.vacaciones.temporada})`,
            valor: `${numero(pendientes)} días`,
            nota: `de ${numero(derecho)} que corresponden`,
          },
        ]}
      />
      {seleccion === 'todas' ? (
        <TarjetaRrhh titulo="Por área en el año" pie={LEYENDA_COSTO}>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-neutral-600 dark:text-gray-400">
                  <th className="py-1.5 pr-2 font-semibold">Área</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Horas extra</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Costo</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Pasaron 200 h</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Van a pasar</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Vacaciones pendientes</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {anual.areas.map((a) => (
                  <tr key={a.cc} className="border-t border-neutral-100 dark:border-zinc-800">
                    <td className="py-2 pr-2 text-neutral-900 dark:text-gray-100">{a.nombre}</td>
                    <td className="px-2 py-2 text-right">{numero(a.horasTotal)}</td>
                    <td className="px-2 py-2 text-right">{pesosCorto(a.costo)}</td>
                    <td className={`px-2 py-2 text-right ${a.superaron > 0 ? 'font-semibold text-red-700 dark:text-red-400' : ''}`}>
                      {numero(a.superaron)}
                    </td>
                    <td className="px-2 py-2 text-right">{numero(a.vanASuperar)}</td>
                    <td className="px-2 py-2 text-right">{a.vacacionesDerecho > 0 ? `${numero(a.vacacionesPendientes)} días` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TarjetaRrhh>
      ) : null}
      <TarjetaRrhh
        titulo="Máximo legal de horas extra"
        subtitulo="La ley permite hasta 30 horas extra por mes y 200 por año por persona (sin contar feriados)."
      >
        <LimiteLegalRrhh areas={areasInforme} personas={personas} ultimoMes={anual.hasta} />
      </TarjetaRrhh>
    </div>
  )
}

