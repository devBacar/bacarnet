import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BriefcaseBusiness, ChartLine, Clock, LayoutDashboard, RefreshCw, UserCheck, Wallet } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context'
import { fechaHora, mesLargo, nombreMes } from '../../components/rrhh/formatoRrhh'
import type { MesAgregado } from '../../components/rrhh/LineaTiempoRrhh'
import {
  MesEnCursoRrhh,
  PeriodoCerradoRrhh,
  PrevisionRrhh,
  VisionAnualRrhh,
  type SeleccionArea,
} from '../../components/rrhh/PeriodosRrhh'
import { CostosRrhh } from '../../components/rrhh/CostosRrhh'
import { EvolucionRrhh } from '../../components/rrhh/EvolucionRrhh'
import { HorasPactadasRrhh } from '../../components/rrhh/HorasPactadasRrhh'
import { IndicadoresRrhh } from '../../components/rrhh/IndicadoresRrhh'
import { ResumenGeneralRrhh, type SeccionRrhh } from '../../components/rrhh/ResumenGeneralRrhh'
import { PlanAhorroRrhh } from '../../components/rrhh/PlanAhorroRrhh'
import { TarjetaRrhh } from '../../components/rrhh/TarjetaRrhh'
import {
  ejecutarIngestaRrhh,
  fetchRrhhInforme,
  fetchRrhhInformeDetalle,
  RrhhApiError,
  type AreaRrhh,
  type InformeRrhh,
  type ResultadoIngestaRrhh,
  type UnidadNegocioRrhh,
} from '../../services/rrhhApi'
import { hasRrhhDetalle, isSuperAdmin } from '../../services/userService'

const CLAVE_INFORME = ['rrhh', 'informe'] as const
const CLAVE_DETALLE = ['rrhh', 'informe', 'detalle'] as const

/** Suma las áreas mes a mes. El costo sale a costo empresa (factor medido en Salario). */
function mesesAgregados(areas: AreaRrhh[], factorCosto: number): MesAgregado[] {
  const meses = areas[0]?.meses ?? []
  return meses.map((base, i) => {
    const suma = (f: (a: AreaRrhh) => number) => areas.reduce((s, a) => s + f(a), 0)
    return {
      mes: base.mes,
      tipo: base.tipo,
      feriados: base.feriados,
      he50: suma((a) => a.meses[i]?.he50 ?? 0),
      he100: suma((a) => a.meses[i]?.he100 ?? 0),
      fer: suma((a) => a.meses[i]?.fer ?? 0),
      costo: suma((a) => a.meses[i]?.costo ?? 0) * factorCosto,
      vacaciones: suma((a) => a.meses[i]?.vacaciones ?? 0),
      licencias: suma((a) => a.meses[i]?.licencias ?? 0),
    }
  })
}

const NOMBRE_UNIDAD: Record<UnidadNegocioRrhh, string> = {
  seguridad: 'Seguridad',
  caudales: 'Transporte de caudales',
  tesoreria: 'Tesorería',
  gruas: 'Grúas',
  estructura: 'Estructura y administración',
}

const MENSAJE_INGESTA: Record<ResultadoIngestaRrhh['estado'], string> = {
  ok: 'Listo: se procesó el último backup de Salario.',
  ya_procesado: 'Ese backup ya estaba procesado. Los datos están al día.',
  en_curso: 'Ya se está procesando un backup. Probá de nuevo en unos minutos.',
  sin_backup: 'No hay backups de Salario en la carpeta de Drive.',
  error: 'No se pudo procesar el backup.',
}

/** Solo super admin: procesa el último backup de Salario de Drive, con confirmación en la misma pantalla. */
function ActualizarDesdeSalario() {
  const queryClient = useQueryClient()
  const [confirmando, setConfirmando] = useState(false)
  const ingesta = useMutation({
    mutationFn: (forzar: boolean) => ejecutarIngestaRrhh(forzar),
    onSuccess: async () => {
      setConfirmando(false)
      await queryClient.invalidateQueries({ queryKey: CLAVE_INFORME })
    },
  })
  const resultado = ingesta.data

  return (
    <div className="flex min-w-0 flex-col items-end gap-1.5">
      {confirmando ? (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-neutral-300 bg-white p-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-900">
          <span className="text-neutral-700 dark:text-gray-300">Lee el último backup de Drive y actualiza los datos de RRHH (tarda 1 o 2 minutos).</span>
          <button
            type="button"
            disabled={ingesta.isPending}
            onClick={() => ingesta.mutate(false)}
            className="rounded-md bg-brand-primary px-3 py-1.5 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {ingesta.isPending ? 'Procesando…' : 'Actualizar'}
          </button>
          <button
            type="button"
            disabled={ingesta.isPending}
            onClick={() => setConfirmando(false)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Actualizar desde Salario
        </button>
      )}
      {resultado && (
        <p role="status" className={`text-[12.5px] ${resultado.estado === 'error' ? 'text-red-700 dark:text-red-400' : 'text-neutral-600 dark:text-gray-400'}`}>
          {MENSAJE_INGESTA[resultado.estado]}
          {resultado.mensaje && resultado.estado === 'error' ? ` ${resultado.mensaje}` : ''}
          {resultado.backupAtrasado ? ' Ojo: el último backup tiene más de 14 horas.' : ''}
          {resultado.estado === 'ya_procesado' ? (
            <>
              {' '}
              <button
                type="button"
                disabled={ingesta.isPending}
                onClick={() => ingesta.mutate(true)}
                className="font-medium text-[var(--color-primary)] underline underline-offset-2 disabled:opacity-50"
              >
                {ingesta.isPending ? 'Procesando…' : 'Volver a procesar igual'}
              </button>
            </>
          ) : null}
        </p>
      )}
      {ingesta.isError && (
        <p role="alert" className="text-[12.5px] text-red-700 dark:text-red-400">
          {ingesta.error instanceof Error ? ingesta.error.message : 'No se pudo procesar el backup.'}
        </p>
      )}
    </div>
  )
}

const REGLAS = [
  ['Seguridad Privada y Seguridad Planta (convenio de vigiladores, CCT 422/05)', 'Jornada de 8 horas por día y 48 por semana. Las vacaciones de verano (21/12 al 20/3) corresponden uno de cada dos años.'],
  ['Protección de Valores y Grúas (convenio de camioneros, CCT 40/89)', '44 horas por semana. Se paga al doble el trabajo después de las 21 h, antes de las 6 h, el sábado desde las 13 h y el domingo.'],
  ['Servicios de Tesorería Tercerizados (convenio bancario, CCT 18/75)', 'Jornada de 7 h 30 min de lunes a viernes.'],
  ['Tesorería y administración (convenio de comercio, CCT 130/75)', '48 horas por semana.'],
  ['Todas las áreas (Ley de Contrato de Trabajo, Decreto 484/2000 y Ley 27.802)', 'Hora extra con 50% de recargo en días hábiles y al doble desde el sábado a las 13 h, domingos y feriados. Máximo 30 horas extra por mes y 200 por año por persona. Vacaciones entre el 1/10 y el 30/4, avisadas con 30 días, en tramos de 7 días o más. Se pueden devolver horas con francos si hay acuerdo escrito.'],
] as const

/** Pestaña dentro de Horas extra: AAAAMM de un mes cerrado o en curso, 'prevision', 'plan', 'pactadas' o 'anual'. */
type Pestania = string

function FaltaActualizar({ superAdmin }: { superAdmin: boolean }) {
  return (
    <TarjetaRrhh titulo="Falta actualizar los datos">
      <p className="text-[15px] text-neutral-700 dark:text-gray-300">
        Esta sección se arma al procesar el backup de Salario con la versión nueva.{' '}
        {superAdmin ? 'Tocá "Actualizar desde Salario" y después "Volver a procesar igual".' : 'Se completa con la próxima lectura de Salario (15:30 o 22:30).'}
      </p>
    </TarjetaRrhh>
  )
}

function BotonPestania({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`shrink-0 rounded-lg border px-3 py-2 text-left text-[13.5px] leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
        activa
          ? 'border-transparent bg-brand-primary text-white'
          : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-200 dark:hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  )
}

const SECCIONES: { id: SeccionRrhh; titulo: string; detalle: string; icono: typeof Clock }[] = [
  { id: 'resumen', titulo: 'Resumen', detalle: 'lo más importante', icono: LayoutDashboard },
  { id: 'horas', titulo: 'Horas extra', detalle: 'por mes, plan de ahorro', icono: Clock },
  { id: 'personal', titulo: 'Ausencias y rotación', detalle: 'ausentismo, altas y bajas', icono: UserCheck },
  { id: 'costos', titulo: 'Costos', detalle: 'sueldos y cargas', icono: Wallet },
  { id: 'evolucion', titulo: 'Evolución', detalle: 'mes, trimestre, año', icono: ChartLine },
]

/** Botones grandes de las cinco secciones del tablero. */
function MenuSecciones({ activa, onChange }: { activa: SeccionRrhh; onChange: (s: SeccionRrhh) => void }) {
  return (
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="tablist" aria-label="Secciones del tablero">
      {SECCIONES.map((s) => {
        const Icono = s.icono
        const on = s.id === activa
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(s.id)}
            className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
              on
                ? 'border-[#1f3b63] bg-[#1f3b63] text-white'
                : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'
            }`}
          >
            <Icono className="h-6 w-6 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold leading-tight">{s.titulo}</span>
              <span className={`block text-[12.5px] ${on ? 'opacity-85' : 'text-neutral-500 dark:text-gray-400'}`}>{s.detalle}</span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}

export function RrhhHorasExtraPage() {
  const { userProfile } = useAuth()
  const superAdmin = isSuperAdmin(userProfile)
  const verDetalle = hasRrhhDetalle(userProfile)
  const [cc, setCc] = useState<SeleccionArea>('todas')
  const [seccion, setSeccion] = useState<SeccionRrhh>('resumen')
  const [pestania, setPestania] = useState<Pestania | null>(null)

  const informe = useQuery<InformeRrhh, Error>({
    queryKey: CLAVE_INFORME,
    queryFn: fetchRrhhInforme,
    staleTime: 5 * 60_000,
    retry: (intentos, error) => !(error instanceof RrhhApiError && error.status === 404) && intentos < 2,
  })
  const detalle = useQuery({
    queryKey: CLAVE_DETALLE,
    queryFn: fetchRrhhInformeDetalle,
    enabled: verDetalle && informe.isSuccess,
    staleTime: 5 * 60_000,
  })

  const datos = informe.data
  const reporte = datos?.reporte
  const areasInforme = useMemo(() => {
    if (!datos) return []
    return cc === 'todas' ? datos.areas : datos.areas.filter((a) => a.cc === cc)
  }, [datos, cc])
  // Si el informe guardado es anterior a la medición de costos, se usa el recargo de referencia de sep-26.
  const factorCosto = datos?.factores?.total ?? 1.464
  const lineaTiempo = useMemo(() => mesesAgregados(areasInforme, factorCosto), [areasInforme, factorCosto])
  const recomendaciones = useMemo(() => {
    if (!datos) return []
    return cc === 'todas' ? datos.recomendaciones : datos.recomendaciones.filter((r) => r.cc === cc)
  }, [datos, cc])

  const sinDatos = informe.error instanceof RrhhApiError && informe.error.status === 404

  const cerrados = reporte ? reporte.periodos.filter((p) => p.tipo === 'real').sort((a, b) => a.mes.localeCompare(b.mes)) : []
  const enCurso = reporte?.periodos.find((p) => p.tipo === 'actual')
  const prevision = reporte ? reporte.periodos.filter((p) => p.tipo === 'prevision') : []
  const ultimoCerrado = cerrados[cerrados.length - 1]
  const activa: Pestania = pestania ?? ultimoCerrado?.mes ?? enCurso?.mes ?? 'anual'
  const cerradoActivo = cerrados.find((p) => p.mes === activa)

  const personasLimite = detalle.data
    ? cc === 'todas'
      ? detalle.data.limite
      : detalle.data.limite.filter((p) => p.cc === cc)
    : null
  const nombreArea = cc === 'todas' ? null : datos?.areas.find((a) => a.cc === cc)?.nombre
  const personasMes = (mes: string) => {
    const lista = detalle.data?.porMes?.[mes]
    if (!verDetalle || !lista) return null
    if (cc === 'todas') return lista
    // Mismo criterio que las cifras del área: el área del reporte en la que se suma cada persona.
    return lista.filter((p) => (p.ccReporte !== undefined ? p.ccReporte === cc : p.area === nombreArea))
  }
  // Unidad de negocio de cada centro de costo (para agrupar las listas de personas).
  const unidadDeCc = (n: number) => {
    const area = datos?.costos?.areas?.find((a) => a.cc === n) ?? datos?.evolucion?.areas.find((a) => a.cc === n)
    return area ? NOMBRE_UNIDAD[area.unidad] : undefined
  }
  const irA = (s: SeccionRrhh) => {
    setSeccion(s)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link to="/tableros" className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-neutral-600 hover:text-[var(--color-primary)] dark:text-gray-400">
            ← Tableros
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-gray-100">
            <BriefcaseBusiness className="h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden />
            Tablero de RRHH
          </h1>
          {datos && (
            <p className="mt-1 text-[13px] text-neutral-600 dark:text-gray-400">
              Último mes liquidado en Salario: {mesLargo(datos.ultimoMes)} · datos actualizados el {fechaHora(datos.meta.actualizado)}
            </p>
          )}
        </div>
        {superAdmin ? (
          <ActualizarDesdeSalario />
        ) : datos ? (
          <p className="text-right text-[12.5px] text-neutral-600 dark:text-gray-400">
            Se actualiza solo a las 15:30 y 22:30
            <span className="block">último backup de Salario: {fechaHora(datos.meta.backupCreado)}</span>
          </p>
        ) : null}
      </header>

      {informe.isPending && <p className="text-body-muted text-[14px]">Cargando el informe…</p>}

      {sinDatos && (
        <TarjetaRrhh titulo="Todavía no hay datos de Salario">
          <p className="text-[14px] text-neutral-700 dark:text-gray-300">
            {superAdmin
              ? 'Tocá "Actualizar desde Salario" para procesar el último backup de Drive. Después se actualiza solo a las 15:30 y 22:30.'
              : 'Los datos se cargan solos a las 15:30 y 22:30. Si no aparecen, avisale a Sistemas.'}
          </p>
        </TarjetaRrhh>
      )}

      {informe.isError && !sinDatos && (
        <p role="alert" className="text-[14px] text-red-700 dark:text-red-400">
          {informe.error.message}
        </p>
      )}

      {datos && !reporte && (
        <TarjetaRrhh titulo="Falta actualizar los datos">
          <p className="text-[14px] text-neutral-700 dark:text-gray-300">
            El informe guardado es de una versión anterior. {superAdmin ? 'Tocá "Actualizar desde Salario" y después "Volver a procesar igual".' : 'Avisale a Sistemas.'}
          </p>
        </TarjetaRrhh>
      )}

      {datos && reporte && (
        <>
          <MenuSecciones activa={seccion} onChange={irA} />

          {seccion === 'resumen' && <ResumenGeneralRrhh datos={datos} ultimoCerrado={ultimoCerrado} onIr={irA} />}

          {seccion === 'horas' && (
            <>
              <div className="grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
                <nav className="flex flex-wrap gap-2" role="tablist" aria-label="Período de horas extra">
                  {cerrados.map((p) => (
                    <BotonPestania key={p.mes} activa={activa === p.mes} onClick={() => setPestania(p.mes)}>
                      <span className="block font-semibold">{mesLargo(p.mes)}</span>
                      <span className="block text-[11.5px] opacity-80">mes cerrado</span>
                    </BotonPestania>
                  ))}
                  {enCurso && (
                    <BotonPestania activa={activa === enCurso.mes} onClick={() => setPestania(enCurso.mes)}>
                      <span className="block font-semibold">{mesLargo(enCurso.mes)}</span>
                      <span className="block text-[11.5px] opacity-80">en curso · estimado</span>
                    </BotonPestania>
                  )}
                  {prevision.length > 0 && (
                    <BotonPestania activa={activa === 'prevision'} onClick={() => setPestania('prevision')}>
                      <span className="block font-semibold">Lo que viene</span>
                      <span className="block text-[11.5px] opacity-80">
                        {nombreMes(prevision[0].mes).slice(0, 3)} a {nombreMes(prevision[prevision.length - 1].mes).slice(0, 3)} · estimado
                      </span>
                    </BotonPestania>
                  )}
                  <BotonPestania activa={activa === 'plan'} onClick={() => setPestania('plan')}>
                    <span className="block font-semibold">Plan de ahorro</span>
                    <span className="block text-[11.5px] opacity-80">3 opciones</span>
                  </BotonPestania>
                  <BotonPestania activa={activa === 'pactadas'} onClick={() => setPestania('pactadas')}>
                    <span className="block font-semibold">Horas pactadas</span>
                    <span className="block text-[11.5px] opacity-80">acuerdos aparte</span>
                  </BotonPestania>
                  <BotonPestania activa={activa === 'anual'} onClick={() => setPestania('anual')}>
                    <span className="block font-semibold">Año {reporte.anual.anio}</span>
                    <span className="block text-[11.5px] opacity-80">visión anual</span>
                  </BotonPestania>
                </nav>
                <label className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
                  Ver el área:
                  <select
                    value={String(cc)}
                    onChange={(e) => setCc(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
                    className="min-w-[220px] rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] font-normal text-neutral-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
                  >
                    <option value="todas">Toda la empresa</option>
                    {datos.areas.map((a) => (
                      <option key={a.cc} value={a.cc}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {cerradoActivo && (
                <PeriodoCerradoRrhh periodo={cerradoActivo} seleccion={cc} personas={personasMes(cerradoActivo.mes)} unidadDeCc={unidadDeCc} />
              )}

              {enCurso && activa === enCurso.mes && (
                <MesEnCursoRrhh
                  periodo={enCurso}
                  seleccion={cc}
                  recomendaciones={recomendaciones.filter((r) => r.mes === enCurso.mes)}
                />
              )}

              {activa === 'prevision' && prevision.length > 0 && (
                <PrevisionRrhh
                  periodos={prevision}
                  seleccion={cc}
                  recomendaciones={recomendaciones.filter((r) => prevision.some((p) => p.mes === r.mes))}
                  lineaTiempo={lineaTiempo}
                  areasInforme={areasInforme}
                  mesesVacaciones={[datos.actual, ...datos.prevision]}
                  ultimoCerrado={ultimoCerrado}
                />
              )}

              {activa === 'plan' && (datos.planes ? <PlanAhorroRrhh planes={datos.planes} /> : <FaltaActualizar superAdmin={superAdmin} />)}

              {activa === 'pactadas' &&
                (datos.pactadas ? (
                  <HorasPactadasRrhh
                    pactadas={datos.pactadas}
                    personas={verDetalle ? (detalle.data?.pactadas ?? []) : null}
                    descartadas={detalle.data?.pactadasDescartadas ?? []}
                  />
                ) : (
                  <FaltaActualizar superAdmin={superAdmin} />
                ))}

              {activa === 'anual' && (
                <VisionAnualRrhh
                  anual={reporte.anual}
                  seleccion={cc}
                  areasInforme={areasInforme}
                  personas={verDetalle ? (personasLimite ?? []) : null}
                />
              )}
            </>
          )}

          {seccion === 'personal' &&
            (datos.indicadores ? (
              <IndicadoresRrhh
                indicadores={datos.indicadores}
                licenciasLargas={verDetalle ? (detalle.data?.indicadores?.licenciasLargas ?? []) : null}
                bajasTempranas={verDetalle ? (detalle.data?.indicadores?.bajasTempranas ?? []) : null}
              />
            ) : (
              <FaltaActualizar superAdmin={superAdmin} />
            ))}

          {seccion === 'costos' &&
            (datos.costos ? (
              <CostosRrhh
                costos={datos.costos}
                areas={datos.evolucion?.areas ?? []}
                unidades={datos.evolucion?.unidades ?? []}
                verPersonas={verDetalle}
              />
            ) : (
              <FaltaActualizar superAdmin={superAdmin} />
            ))}

          {seccion === 'evolucion' &&
            (datos.evolucion ? <EvolucionRrhh evolucion={datos.evolucion} verPersonas={verDetalle} /> : <FaltaActualizar superAdmin={superAdmin} />)}

          <details className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-[13px] dark:border-zinc-700 dark:bg-zinc-900">
            <summary className="cursor-pointer font-medium text-neutral-800 dark:text-gray-200">
              De dónde salen los datos y qué normas se aplican
            </summary>
            <div className="mt-3 grid gap-3 text-neutral-700 dark:text-gray-300">
              <p>
                Todo sale de la liquidación de sueldos de Salario, solo de Bacar (Filmec es otra empresa y no se cuenta). Cada mes es el
                período que cubre su liquidación: SUVICO y Camioneros, del 26 del mes anterior al 25; Comercio, Bancarios y Fuera de
                convenio, del 1 a fin de mes.
              </p>
              <p>
                El mes en curso y la previsión se estiman con lo que pasó en cada área desde marzo de 2025: cuántas horas extra genera
                cada día de vacaciones o licencia, las vacaciones ya cargadas, las del mismo mes del año anterior y el calendario de
                feriados.
              </p>
              <p>
                Los costos de horas extra son <strong>costo para la empresa</strong>: lo liquidado más contribuciones patronales,
                provisiones de aguinaldo y despidos, contribuciones del aguinaldo y el mayor pago de vacaciones que generan las horas
                extra habituales (art. 155 LCT).
                {datos.factores
                  ? ` Hoy, cada $ 100 de horas extra le cuestan a la empresa $ ${Math.round(datos.factores.total * 100)}; las tasas se miden en los recibos de Salario.`
                  : ''}
              </p>
              <ul className="grid gap-2">
                {REGLAS.map(([titulo, texto]) => (
                  <li key={titulo}>
                    <strong className="font-semibold text-neutral-900 dark:text-gray-100">{titulo}:</strong> {texto}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
