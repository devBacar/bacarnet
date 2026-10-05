import { useQueries, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { usePermisosFinanzas } from '../permisosFinanzas'
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
  armarListaSemana,
  diasDeLaSemana,
  etiquetaAtraso,
  lunesDe,
  mesesDe,
  rangoSemana,
  textoComoSePaga,
  textoPagoParcial,
  tituloDiaLista,
  type FilaListaSemana,
} from './compromisosSemana/semana'
import { botonChico, Tarjeta, Vacio } from './TarjetasHoy'

const control =
  'inline-flex items-center justify-center rounded-md border border-[var(--color-primary-muted)] bg-white p-1.5 text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-40 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'

const botonPagar =
  'inline-flex w-[76px] shrink-0 items-center justify-center rounded-lg border border-[var(--color-primary)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary-light)] dark:bg-transparent dark:hover:bg-[var(--color-primary-light)]'

/** Cuántos vencidos se ven antes de "Ver los N restantes". */
const VENCIDOS_A_LA_VISTA = 3

export interface PagoDesdePlanilla {
  id: string
  aQuien: string
  concepto: string
  montoCentavos: number
  medioPago: 'transferencia' | 'cheque' | 'efectivo'
  proveedorONombre: string
  moneda: MonedaCompromiso
}

function TotalSeccion({ valores, rojo = false }: { valores: MontosMoneda; rojo?: boolean }) {
  const hayPesos = valores.ars > 0
  const hayDolares = valores.usd > 0
  if (!hayPesos && !hayDolares) {
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">nada para pagar</span>
  }
  const color = rojo ? 'text-red-700 dark:text-red-300' : 'text-heading'
  const pesos = hayPesos ? formatMoneyCentavos(valores.ars, 'ARS') : ''
  const dolares = hayDolares ? formatMoneyCentavos(valores.usd, 'USD') : ''
  return (
    <span className={`ml-auto shrink-0 text-right whitespace-nowrap ${color}`}>
      {pesos ? <span className="text-base font-semibold tabular-nums">{pesos}</span> : null}
      {dolares ? (
        <span className={pesos ? 'ml-1.5 text-sm font-normal tabular-nums' : 'text-base font-semibold tabular-nums'}>
          {pesos ? `+ ${dolares}` : dolares}
        </span>
      ) : null}
    </span>
  )
}

function EncabezadoSeccion({
  titulo,
  valores,
  tono,
}: {
  titulo: string
  valores: MontosMoneda
  tono: 'normal' | 'hoy' | 'vencidos'
}) {
  const color =
    tono === 'vencidos' ? 'text-red-700 dark:text-red-300' : tono === 'hoy' ? 'text-[var(--color-primary)]' : 'text-heading'
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 pt-3 pb-1.5">
      <h3 className={`min-w-0 text-base font-semibold ${color}`}>{titulo}</h3>
      <TotalSeccion valores={valores} rojo={tono === 'vencidos'} />
    </div>
  )
}

function medioDe(medio: string): PagoDesdePlanilla['medioPago'] {
  if (medio === 'cheque' || medio === 'efectivo') return medio
  return 'transferencia'
}

function FilaCompromiso({
  fila,
  hoy,
  onPagar,
  mostrarAtraso = false,
}: {
  fila: FilaListaSemana
  hoy: string
  onPagar: (pago: PagoDesdePlanilla) => void
  mostrarAtraso?: boolean
}) {
  const como = fila.cuota ? `${textoComoSePaga(fila.medioPago)} y cuota ${fila.cuota}` : textoComoSePaga(fila.medioPago)
  const parcial = textoPagoParcial(fila.acumuladoCentavos, fila.importeCentavos, fila.diferenciaCentavos, (centavos) =>
    formatMoneyCentavos(centavos, fila.moneda),
  )
  const detalle = [fila.proveedorONombre, como, parcial ?? '', fila.enFirmaCentavos > 0 ? `${formatMoneyCentavos(fila.enFirmaCentavos, fila.moneda)} en firma` : '']
    .filter((parte) => parte.trim().length > 0)
    .join(' · ')
  const atraso = mostrarAtraso ? etiquetaAtraso(fila.fechaVencimiento, hoy) : null
  const puedeAgenda = usePermisosFinanzas().agenda
  const puedePagar =
    puedeAgenda && fila.faltaCentavos > 0 && fila.estado !== 'pagado' && fila.estado !== 'confeccionada_pendiente_autorizacion'
  const monto =
    fila.faltaCentavos > 0
      ? formatMoneyCentavos(fila.faltaCentavos, fila.moneda)
      : fila.enFirmaCentavos > 0
        ? ''
        : 'pagado'
  const porcentaje = fila.importeCentavos > 0 ? Math.min(100, Math.round((fila.acumuladoCentavos / fila.importeCentavos) * 100)) : 0
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-heading break-words text-[15px] font-medium">{fila.concepto}</span>
          {atraso ? (
            <span className="inline-flex shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {atraso}
            </span>
          ) : null}
        </p>
        {detalle ? <p className="mt-0.5 break-words text-xs text-neutral-500 dark:text-neutral-400">{detalle}</p> : null}
        {parcial ? (
          <div className="mt-1.5 h-1 w-40 overflow-hidden rounded bg-neutral-100 dark:bg-zinc-800" aria-hidden>
            <div className="h-full rounded bg-emerald-600 dark:bg-emerald-400" style={{ width: `${porcentaje}%` }} />
          </div>
        ) : null}
      </div>
      <div className="text-left sm:text-right">
        {monto ? (
          <span
            className={`text-[15px] font-semibold whitespace-nowrap tabular-nums ${
              monto === 'pagado' ? 'text-emerald-700 dark:text-emerald-400' : 'text-heading'
            }`}
          >
            {monto}
          </span>
        ) : null}
      </div>
      <div className="justify-self-end">
        {puedePagar ? (
          <button
            type="button"
            className={botonPagar}
            onClick={() =>
              onPagar({
                id: fila.compromisoId,
                aQuien: fila.proveedorONombre,
                concepto: fila.concepto,
                montoCentavos: fila.faltaCentavos,
                medioPago: medioDe(fila.medioPago),
                proveedorONombre: fila.proveedorONombre,
                moneda: fila.moneda,
              })
            }
          >
            Pagar
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function CompromisosSemana({ onPagar }: { onPagar: (pago: PagoDesdePlanilla) => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const hoy = hoyArgentina()
  const [lunes, setLunes] = useState(() => lunesDe(hoy))
  const [alta, setAlta] = useState(false)
  const [verVencidos, setVerVencidos] = useState(false)

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
  const esEstaSemana = lunes === lunesDe(hoy)
  const lista = armarListaSemana({ planillas, dias, hoy, esEstaSemana })
  const grupos = planillas[0]?.grupos.map((grupo) => grupo.grupo) ?? [...GRUPOS_COMPROMISO]
  const vencidosVisibles = verVencidos ? lista.vencidos : lista.vencidos.slice(0, VENCIDOS_A_LA_VISTA)
  const vencidosOcultos = lista.vencidos.length - VENCIDOS_A_LA_VISTA

  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: COMPROMISOS_MES_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'hoy'] })
  }

  return (
    <Tarjeta
      titulo={esEstaSemana ? 'Compromisos de esta semana' : 'Compromisos de la semana'}
      subtitulo={rangoSemana(dias)}
      claseTitulo="text-brand-primary text-base font-semibold"
      claseSubtitulo="text-brand-primary text-xs"
      claseAyuda="text-xs"
      derecha={
        <>
          <span className="inline-flex items-center gap-1">
            <button type="button" aria-label="Semana anterior" className={control} onClick={() => { setVerVencidos(false); setLunes((actual) => sumarDias(actual, -7)) }}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Semana siguiente" className={control} onClick={() => { setVerVencidos(false); setLunes((actual) => sumarDias(actual, 7)) }}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </span>
          <Link to="/finanzas/agenda?tab=planilla" className="text-xs text-[var(--color-primary)] underline-offset-2 hover:underline">
            ver mes en Agenda
          </Link>
          <button type="button" className={`${botonChico} gap-1`} onClick={() => setAlta(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Agregar
          </button>
        </>
      }
      ayuda="Son los mismos compromisos de Agenda: si pagás o cambiás algo acá, se actualiza allá."
    >
      {cargando ? <p className="text-body-muted py-2 text-[13px]">Cargando la semana…</p> : null}
      {error ? (
        <p className="py-2 text-[13px] text-red-700 dark:text-red-300">
          {error instanceof Error ? error.message : 'No se pudo cargar la semana'}
        </p>
      ) : null}
      {!cargando && !error && !esEstaSemana && lista.dias.length === 0 ? (
        <Vacio texto="Esta semana no hay compromisos anotados." />
      ) : null}

      {lista.vencidos.length > 0 ? (
        <section className="-mx-4 rounded-none border-l-[3px] border-red-500">
          <EncabezadoSeccion titulo={`Vencidos sin pagar · ${lista.vencidos.length}`} valores={lista.totalVencidos} tono="vencidos" />
          <div className="divide-y divide-neutral-200 dark:divide-zinc-800">
            {vencidosVisibles.map((fila) => (
              <FilaCompromiso key={fila.compromisoId} fila={fila} hoy={hoy} onPagar={onPagar} mostrarAtraso />
            ))}
          </div>
          {vencidosOcultos > 0 ? (
            <button
              type="button"
              className="px-4 py-2 text-left text-sm text-[var(--color-primary)] underline-offset-2 hover:underline"
              onClick={() => setVerVencidos((actual) => !actual)}
            >
              {verVencidos ? 'Ver menos' : vencidosOcultos === 1 ? 'Ver el restante ›' : `Ver los ${vencidosOcultos} restantes ›`}
            </button>
          ) : null}
        </section>
      ) : null}

      {lista.dias.map((dia, indice) => {
        const titulo = tituloDiaLista(dia.fecha, hoy)
        const separada = lista.vencidos.length > 0 || indice > 0
        return (
          <section key={dia.fecha} className={`-mx-4 ${separada ? 'border-t border-neutral-300 dark:border-zinc-600' : ''}`}>
            <EncabezadoSeccion titulo={titulo.texto} valores={dia.total} tono={titulo.esHoy ? 'hoy' : 'normal'} />
            {dia.filas.length > 0 ? (
              <div className="divide-y divide-neutral-200 dark:divide-zinc-800">
                {dia.filas.map((fila) => (
                  <FilaCompromiso key={fila.compromisoId} fila={fila} hoy={hoy} onPagar={onPagar} />
                ))}
              </div>
            ) : null}
          </section>
        )
      })}

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
