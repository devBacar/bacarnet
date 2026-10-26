import { useQueries, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
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

export interface PagoDesdePlanilla {
  id: string
  aQuien: string
  concepto: string
  montoCentavos: number
  medioPago: 'transferencia' | 'cheque' | 'efectivo'
  proveedorONombre: string
  moneda: MonedaCompromiso
}

function TotalSeccion({ valores }: { valores: MontosMoneda }) {
  const hayPesos = valores.ars > 0
  const hayDolares = valores.usd > 0
  if (!hayPesos && !hayDolares) {
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">nada para pagar</span>
  }
  const pesos = hayPesos ? formatMoneyCentavos(valores.ars, 'ARS') : ''
  const dolares = hayDolares ? formatMoneyCentavos(valores.usd, 'USD') : ''
  return (
    <span className="text-heading ml-auto shrink-0 text-right whitespace-nowrap">
      {pesos ? <span className="text-base font-semibold tabular-nums">{pesos}</span> : null}
      {dolares ? (
        <span className={pesos ? 'ml-1.5 text-sm font-normal tabular-nums' : 'text-base font-semibold tabular-nums'}>
          {pesos ? `+ ${dolares}` : dolares}
        </span>
      ) : null}
    </span>
  )
}

function EncabezadoDia({
  titulo,
  valores,
  esHoy,
  abierto,
  desplegable,
  onToggle,
}: {
  titulo: string
  valores: MontosMoneda
  esHoy: boolean
  abierto: boolean
  desplegable: boolean
  onToggle: () => void
}) {
  const color = esHoy ? 'text-[var(--color-primary)]' : 'text-heading'
  const contenido = (
    <>
      {desplegable ? (
        abierto ? (
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        )
      ) : (
        <span className="inline-block w-4 shrink-0" aria-hidden />
      )}
      <h3 className={`min-w-0 text-base font-semibold ${color}`}>{titulo}</h3>
      <TotalSeccion valores={valores} />
    </>
  )
  if (!desplegable) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 pt-3 pb-1.5 opacity-50">{contenido}</div>
    )
  }
  return (
    <button
      type="button"
      className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 pt-3 pb-1.5 text-left"
      aria-expanded={abierto}
      onClick={onToggle}
    >
      {contenido}
    </button>
  )
}

function medioDe(medio: string): PagoDesdePlanilla['medioPago'] {
  if (medio === 'cheque' || medio === 'efectivo') return medio
  return 'transferencia'
}

function FilaCompromiso({ fila, onPagar }: { fila: FilaListaSemana; onPagar: (pago: PagoDesdePlanilla) => void }) {
  const como = fila.cuota ? `${textoComoSePaga(fila.medioPago)} y cuota ${fila.cuota}` : textoComoSePaga(fila.medioPago)
  const parcial = textoPagoParcial(fila.acumuladoCentavos, fila.importeCentavos, fila.diferenciaCentavos, (centavos) =>
    formatMoneyCentavos(centavos, fila.moneda),
  )
  const detalle = [fila.proveedorONombre, como, parcial ?? '', fila.enFirmaCentavos > 0 ? `${formatMoneyCentavos(fila.enFirmaCentavos, fila.moneda)} en firma` : '']
    .filter((parte) => parte.trim().length > 0)
    .join(' · ')
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
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>(() => ({ [hoy]: true }))

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
  const esSemanaPasada = lunes < lunesDe(hoy)
  const lista = esSemanaPasada ? { dias: [] } : armarListaSemana({ planillas, dias, hoy, esEstaSemana })
  const grupos = planillas[0]?.grupos.map((grupo) => grupo.grupo) ?? [...GRUPOS_COMPROMISO]

  useEffect(() => {
    setAbiertos({ [hoy]: true })
  }, [lunes, hoy])

  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: COMPROMISOS_MES_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'hoy'] })
  }

  return (
    <Tarjeta
      tour="hoy-semana"
      titulo={esEstaSemana ? 'Compromisos de esta semana' : 'Compromisos de la semana'}
      subtitulo={rangoSemana(dias)}
      claseTitulo="text-brand-primary text-base font-semibold"
      claseSubtitulo="text-brand-primary text-xs"
      claseAyuda="text-xs"
      derecha={
        <>
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-label="Semana anterior"
              className={control}
              onClick={() => setLunes((actual) => sumarDias(actual, -7))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Semana siguiente"
              className={control}
              onClick={() => setLunes((actual) => sumarDias(actual, 7))}
            >
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

      {!cargando && !error && esSemanaPasada ? (
        <p className="text-body-muted py-2 text-[13px]">Lo atrasado está en Pagos/Cobros atrasados.</p>
      ) : null}

      {!cargando && !error && !esSemanaPasada && lista.dias.length === 0 ? (
        <Vacio texto="Esta semana no hay compromisos anotados." />
      ) : null}

      {!esSemanaPasada
        ? lista.dias.map((dia, indice) => {
            const titulo = tituloDiaLista(dia.fecha, hoy)
            const tiene = dia.filas.length > 0
            const abierto = Boolean(abiertos[dia.fecha])
            return (
              <section
                key={dia.fecha}
                className={`-mx-4 ${indice > 0 ? 'border-t border-neutral-300 dark:border-zinc-600' : ''}`}
              >
                <EncabezadoDia
                  titulo={titulo.texto}
                  valores={dia.total}
                  esHoy={titulo.esHoy}
                  abierto={abierto}
                  desplegable={tiene}
                  onToggle={() =>
                    setAbiertos((actual) => ({ ...actual, [dia.fecha]: !actual[dia.fecha] }))
                  }
                />
                {tiene && abierto ? (
                  <div className="divide-y divide-neutral-200 dark:divide-zinc-800">
                    {dia.filas.map((fila) => (
                      <FilaCompromiso key={fila.compromisoId} fila={fila} onPagar={onPagar} />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })
        : null}

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
