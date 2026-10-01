import { useQueries, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../context'
import {
  COMPROMISOS_MES_QUERY_KEY,
  crearCompromisoMes,
  fetchPlanillaCompromisosMes,
  GRUPOS_COMPROMISO,
  type MonedaCompromiso,
  type MontosMoneda,
} from '../../../services/finanzasCompromisosMesApi'
import { formatMoneyCentavos } from '../formatMoney'
import { hoyArgentina, sumarDias } from './cajaDelDia/fechasCaja'
import { COMPROMISO_VACIO } from './compromisosMes/compromisoVacio'
import { FormularioCompromiso } from './compromisosMes/FormularioCompromiso'
import {
  armarSemana,
  diasDeLaSemana,
  lunesDe,
  mesesDe,
  rangoSemana,
  textoParcial,
  type FilaSemana,
} from './compromisosSemana/semana'
import { diaCorto } from './hoyFrases'
import { montoCorto } from './montoCorto'
import { Tarjeta, Vacio, botonChico, botonChicoSecundario, linkChico } from './TarjetasHoy'

/** Concepto flexible, cinco días angostos de ancho igual y Falta pagar. Nunca más ancho que la tarjeta. */
const COLUMNAS =
  'grid grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))_minmax(0,1.2fr)] gap-x-1 md:grid-cols-[minmax(0,1fr)_repeat(5,5rem)_6rem] md:gap-x-2'
const control =
  'inline-flex items-center justify-center rounded-md border border-neutral-200 bg-white p-1 text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'

function fechaCorta(ymd: string): string {
  const [anio, mes, dia] = ymd.split('-')
  return `${Number(dia)}/${Number(mes)}/${anio}`
}

/** Un monto en dos monedas, abreviado, en una o dos líneas. Celda vacía (pero presente) si no hay nada. */
function MontosCortos({ valores, className = '' }: { valores: MontosMoneda | undefined; className?: string }) {
  if (!valores || (valores.ars === 0 && valores.usd === 0)) return <span />
  return (
    <span className={`break-words tabular-nums ${className}`}>
      {valores.ars > 0 ? <span className="block">{montoCorto(valores.ars, 'ARS')}</span> : null}
      {valores.usd > 0 ? <span className="block">{montoCorto(valores.usd, 'USD')}</span> : null}
    </span>
  )
}

interface Detalle {
  fila: FilaSemana
  fecha: string | null
}

function Celda({
  fila,
  fecha,
  hoy,
  esHoy,
  onTocar,
}: {
  fila: FilaSemana
  fecha: string
  hoy: string
  esHoy: boolean
  onTocar: () => void
}) {
  const celda = fila.porDia[fecha]
  if (!celda || (celda.planificadoCentavos <= 0 && celda.pagadoCentavos <= 0)) return <span />
  const pendiente = celda.planificadoCentavos > 0 && celda.pagadoCentavos < celda.planificadoCentavos
  const vencido = pendiente && fecha < hoy && fila.diferenciaCentavos > 0
  const colorPlan = vencido
    ? 'text-red-600 dark:text-red-400'
    : esHoy
      ? 'text-sky-700 dark:text-sky-300'
      : 'text-neutral-600 dark:text-neutral-300'
  return (
    <button
      type="button"
      onClick={onTocar}
      className="flex w-full flex-col items-end rounded px-0.5 text-right text-xs leading-tight tabular-nums hover:bg-neutral-100 dark:hover:bg-zinc-800"
      title="Ver el detalle"
    >
      {pendiente ? (
        <span className={`break-words ${colorPlan}`}>
          {celda.corrido ? '↩ ' : ''}
          {montoCorto(celda.planificadoCentavos, fila.moneda)}
        </span>
      ) : null}
      {celda.pagadoCentavos > 0 ? (
        <span className="break-words text-emerald-700 dark:text-emerald-400">✓ {montoCorto(celda.pagadoCentavos, fila.moneda)}</span>
      ) : null}
    </button>
  )
}

/** Ventana chica con el monto completo, a quién y el botón Pagar si corresponde. */
function DetallePopover({
  detalle,
  hoy,
  onCerrar,
  onPagar,
}: {
  detalle: Detalle
  hoy: string
  onCerrar: () => void
  onPagar: (compromisoId: string) => void
}) {
  const { fila, fecha } = detalle
  const celda = fecha ? fila.porDia[fecha] : undefined
  const puedePagar =
    fila.diferenciaCentavos > 0 &&
    fila.fechaVencimiento <= hoy &&
    fila.estado !== 'pagado' &&
    fila.estado !== 'confeccionada_pendiente_autorizacion'
  const completo = (centavos: number) => formatMoneyCentavos(centavos, fila.moneda)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={fila.concepto}
        className="w-full max-w-xs rounded-xl border border-neutral-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-heading text-sm font-medium">{fila.concepto}</p>
        <p className="text-body-muted text-xs">
          {fila.proveedorONombre} · vence {fechaCorta(fila.fechaVencimiento)}
          {fila.cuota ? ` · cuota ${fila.cuota}` : ''}
        </p>
        <p className="text-heading mt-2 text-base font-medium tabular-nums">{completo(fila.importeCentavos)}</p>
        {fila.acumuladoCentavos > 0 ? (
          <p className="text-xs">
            <span className="text-emerald-700 dark:text-emerald-300">Pagado {completo(fila.acumuladoCentavos)}</span>
            {fila.diferenciaCentavos > 0 ? <span className="text-body-muted"> · falta {completo(fila.diferenciaCentavos)}</span> : null}
          </p>
        ) : null}
        {celda && fecha ? (
          <p className="text-body-muted mt-1 text-xs">
            El {fechaCorta(fecha)}:{celda.planificadoCentavos > 0 ? ` previsto ${completo(celda.planificadoCentavos)}` : ''}
            {celda.pagadoCentavos > 0 ? `${celda.planificadoCentavos > 0 ? ' ·' : ''} pagado ${completo(celda.pagadoCentavos)}` : ''}
            {celda.corrido ? ' · corrido al hábil anterior' : ''}
          </p>
        ) : null}
        {fila.observacion ? <p className="text-body-muted mt-1 text-xs">{fila.observacion}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className={botonChicoSecundario} onClick={onCerrar}>
            Cerrar
          </button>
          {puedePagar ? (
            <button
              type="button"
              className={botonChico}
              onClick={() => {
                onCerrar()
                onPagar(fila.compromisoId)
              }}
            >
              Pagar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FilaGrilla({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${COLUMNAS} items-start border-b border-neutral-100 py-1 dark:border-zinc-800 ${className}`}>{children}</div>
}

export function CompromisosSemana({ onPagar }: { onPagar: (compromisoId: string) => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const hoy = hoyArgentina()
  const [lunes, setLunes] = useState(() => lunesDe(hoy))
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [alta, setAlta] = useState(false)

  const dias = diasDeLaSemana(lunes)
  const meses = mesesDe(dias)
  const consultas = useQueries({
    queries: meses.map((mes) => ({
      queryKey: [...COMPROMISOS_MES_QUERY_KEY, mes],
      queryFn: () => fetchPlanillaCompromisosMes(mes),
      enabled: Boolean(user),
    })),
  })
  const cargando = consultas.some((consulta) => consulta.isLoading)
  const error = consultas.find((consulta) => consulta.isError)?.error
  const planillas = consultas.flatMap((consulta) => (consulta.data ? [consulta.data] : []))
  const semana = armarSemana(planillas, dias)
  const esEstaSemana = lunes === lunesDe(hoy)
  const grupos = planillas[0]?.grupos.map((grupo) => grupo.grupo) ?? [...GRUPOS_COMPROMISO]

  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: COMPROMISOS_MES_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'hoy'] })
  }

  const corto = (centavos: number, moneda: MonedaCompromiso) => montoCorto(centavos, moneda)

  return (
    <Tarjeta
      titulo={esEstaSemana ? 'Compromisos de esta semana' : `Compromisos de la semana ${rangoSemana(dias)}`}
      subtitulo={esEstaSemana ? rangoSemana(dias) : undefined}
      derecha={
        <>
          <span className="inline-flex items-center gap-1">
            <button type="button" aria-label="Semana anterior" className={control} onClick={() => setLunes((actual) => sumarDias(actual, -7))}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Semana siguiente" className={control} onClick={() => setLunes((actual) => sumarDias(actual, 7))}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </span>
          <Link to="/finanzas/agenda?tab=planilla" className={linkChico}>
            ver el mes completo en Agenda ›
          </Link>
          <button type="button" className={`${botonChico} gap-1`} onClick={() => setAlta(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Agregar
          </button>
        </>
      }
      ayuda="Tocá un monto para ver el detalle o pagarlo. Para cargar o cambiar un compromiso usá «+ Agregar» o la Agenda: es el mismo dato."
    >
      {cargando ? <p className="text-body-muted py-2 text-xs">Cargando la semana…</p> : null}
      {error ? <p className="py-2 text-xs text-red-700 dark:text-red-300">{error instanceof Error ? error.message : 'No se pudo cargar la semana'}</p> : null}
      {!cargando && !error && !semana.hayFilas ? <Vacio texto="Esta semana no hay compromisos anotados." /> : null}
      {semana.hayFilas ? (
        <div className="text-xs">
          <FilaGrilla className="text-body-muted font-medium">
            <span>Concepto</span>
            {dias.map((dia) => {
              const esHoy = dia === hoy
              return (
                <span key={dia} className={`text-right ${esHoy ? 'text-sky-700 dark:text-sky-300' : ''}`}>
                  <span className="block">{diaCorto(dia)}</span>
                  <span className="block font-normal">{esHoy ? 'hoy' : semana.feriados.has(dia) ? 'feriado' : Number(dia.slice(8))}</span>
                </span>
              )
            })}
            <span className="text-right">Falta pagar</span>
          </FilaGrilla>

          {semana.grupos.map((grupo) => (
            <div key={grupo.grupo}>
              <FilaGrilla className="bg-neutral-50 font-medium dark:bg-zinc-800/60">
                <span className="text-heading break-words">{grupo.grupo}</span>
                {dias.map((dia) => (
                  <MontosCortos key={dia} valores={grupo.porDia[dia]} className={`text-right ${dia === hoy ? 'text-sky-700 dark:text-sky-300' : 'text-heading'}`} />
                ))}
                <MontosCortos valores={grupo.faltaPagar} className="text-heading text-right" />
              </FilaGrilla>
              {grupo.filas.map((fila) => {
                const parcial = textoParcial(fila, corto)
                return (
                  <FilaGrilla key={fila.compromisoId}>
                    <button
                      type="button"
                      className="min-w-0 rounded text-left hover:underline"
                      onClick={() => setDetalle({ fila, fecha: null })}
                      title="Ver el detalle"
                    >
                      <span className="text-heading block break-words text-sm leading-tight">{fila.concepto}</span>
                      <span className="text-body-muted block break-words">
                        {fila.proveedorONombre}
                        {fila.cuota ? ` · cuota ${fila.cuota}` : ''}
                      </span>
                      {parcial ? (
                        <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                          {parcial}
                        </span>
                      ) : null}
                    </button>
                    {dias.map((dia) => (
                      <Celda key={dia} fila={fila} fecha={dia} hoy={hoy} esHoy={dia === hoy} onTocar={() => setDetalle({ fila, fecha: dia })} />
                    ))}
                    <button
                      type="button"
                      className={`rounded px-0.5 text-right tabular-nums hover:bg-neutral-100 dark:hover:bg-zinc-800 ${
                        fila.diferenciaCentavos > 0 ? 'text-heading' : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                      onClick={() => setDetalle({ fila, fecha: null })}
                    >
                      {fila.diferenciaCentavos > 0 ? montoCorto(fila.diferenciaCentavos, fila.moneda) : 'pagado'}
                    </button>
                  </FilaGrilla>
                )
              })}
            </div>
          ))}

          <FilaGrilla className="text-heading border-t border-neutral-200 font-medium dark:border-zinc-700">
            <span>Total del día</span>
            {dias.map((dia) => (
              <MontosCortos key={dia} valores={semana.totalPorDia[dia]} className={`text-right ${dia === hoy ? 'text-sky-700 dark:text-sky-300' : ''}`} />
            ))}
            <MontosCortos valores={semana.totalFaltaPagar} className="text-right" />
          </FilaGrilla>
        </div>
      ) : null}

      {detalle ? <DetallePopover detalle={detalle} hoy={hoy} onCerrar={() => setDetalle(null)} onPagar={onPagar} /> : null}
      {alta ? (
        <FormularioCompromiso
          titulo="Nuevo compromiso"
          grupos={grupos}
          inicial={{ ...COMPROMISO_VACIO, fechaVencimiento: esEstaSemana ? hoy : dias[0]! }}
          onClose={() => setAlta(false)}
          onSave={async (body) => {
            await crearCompromisoMes(body)
            toast.success('Compromiso cargado')
            setAlta(false)
            recargar()
          }}
        />
      ) : null}
    </Tarjeta>
  )
}
