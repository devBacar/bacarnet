import { useQueries, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
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
  armarListaSemana,
  diasDeLaSemana,
  lunesDe,
  mesesDe,
  rangoSemana,
  textoComoSePaga,
  textoVencido,
  tituloDiaLista,
  type FilaListaSemana,
} from './compromisosSemana/semana'
import { botonChico, linkChico, Tarjeta, Vacio } from './TarjetasHoy'

const control =
  'inline-flex items-center justify-center rounded-md border border-[var(--color-primary-muted)] bg-white p-1.5 text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-40 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'

export interface PagoDesdePlanilla {
  id: string
  aQuien: string
  concepto: string
  montoCentavos: number
  medioPago: 'transferencia' | 'cheque' | 'efectivo'
  proveedorONombre: string
  moneda: MonedaCompromiso
}

function textoMontos(valores: MontosMoneda): string {
  const partes: string[] = []
  if (valores.ars > 0) partes.push(formatMoneyCentavos(valores.ars, 'ARS'))
  if (valores.usd > 0) partes.push(formatMoneyCentavos(valores.usd, 'USD'))
  return partes.join(' + ')
}

function medioDe(medio: string): PagoDesdePlanilla['medioPago'] {
  if (medio === 'cheque' || medio === 'efectivo') return medio
  return 'transferencia'
}

function FilaCompromiso({
  fila,
  hoy,
  onPagar,
}: {
  fila: FilaListaSemana
  hoy: string
  onPagar: (pago: PagoDesdePlanilla) => void
}) {
  const secundario = [
    fila.proveedorONombre,
    fila.cuota ? `cuota ${fila.cuota}` : '',
    textoComoSePaga(fila.medioPago),
    textoVencido(fila.fechaVencimiento, hoy) ?? '',
    fila.grupo,
  ].filter(Boolean)
  const parcial =
    fila.acumuladoCentavos > 0 && fila.diferenciaCentavos > 0
      ? `pagado ${formatMoneyCentavos(fila.acumuladoCentavos, fila.moneda)} de ${formatMoneyCentavos(fila.importeCentavos, fila.moneda)}`
      : null
  const puedePagar = fila.faltaCentavos > 0 && fila.estado !== 'pagado' && fila.estado !== 'confeccionada_pendiente_autorizacion'
  const monto =
    fila.faltaCentavos > 0
      ? formatMoneyCentavos(fila.faltaCentavos, fila.moneda)
      : fila.enFirmaCentavos > 0
        ? ''
        : 'pagado'
  return (
    <div className="flex min-w-0 items-start justify-between gap-2 px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-heading break-words text-[15px] font-medium">{fila.concepto}</p>
        <p className="text-body-muted break-words text-[13px]">{secundario.join(' · ')}</p>
        {parcial ? (
          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[13px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            {parcial}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {monto ? (
          <span className={`text-[15px] font-medium tabular-nums ${monto === 'pagado' ? 'text-emerald-700 dark:text-emerald-400' : 'text-heading'}`}>
            {monto}
          </span>
        ) : null}
        {fila.enFirmaCentavos > 0 ? (
          <span className="text-[13px] tabular-nums text-neutral-500 dark:text-neutral-400">
            {formatMoneyCentavos(fila.enFirmaCentavos, fila.moneda)} en firma
          </span>
        ) : null}
        {puedePagar ? (
          <button
            type="button"
            className={botonChico}
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
  const vencidosVisibles = verVencidos ? lista.vencidos : lista.vencidos.slice(0, 3)

  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: COMPROMISOS_MES_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'hoy'] })
  }

  return (
    <Tarjeta
      titulo={esEstaSemana ? 'Compromisos de esta semana' : 'Compromisos de la semana'}
      subtitulo={rangoSemana(dias)}
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
          <Link to="/finanzas/agenda?tab=planilla" className="text-brand-primary text-[13px] underline-offset-2 hover:underline">
            ver el mes completo en Agenda
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
        <section className="-mx-4 mb-2">
          <div className="flex items-center justify-between gap-2 bg-red-50 px-4 py-2 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
            <span className="font-medium">Vencidos sin pagar ({lista.vencidos.length})</span>
            <span className="shrink-0 text-right font-medium tabular-nums">{textoMontos(lista.totalVencidos)}</span>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-zinc-800">
            {vencidosVisibles.map((fila) => (
              <FilaCompromiso key={fila.compromisoId} fila={fila} hoy={hoy} onPagar={onPagar} />
            ))}
          </div>
          {lista.vencidos.length > 3 && !verVencidos ? (
            <button type="button" className={`${linkChico} px-4 py-2`} onClick={() => setVerVencidos(true)}>
              Ver todos ({lista.vencidos.length}) ›
            </button>
          ) : null}
        </section>
      ) : null}

      {lista.dias.map((dia) => {
        const titulo = tituloDiaLista(dia.fecha, hoy)
        const total = textoMontos(dia.total)
        return (
          <section key={dia.fecha} className="-mx-4">
            <div className="flex items-center justify-between gap-2 bg-neutral-100 px-4 py-2 text-[13px] dark:bg-zinc-800">
              <span className={`font-medium ${titulo.esHoy ? 'text-brand-primary' : 'text-heading'}`}>{titulo.texto}</span>
              <span className={`shrink-0 text-right tabular-nums ${total ? 'text-heading font-medium' : 'text-body-muted'}`}>
                {total || 'nada para pagar'}
              </span>
            </div>
            {dia.filas.length > 0 ? (
              <div className="divide-y divide-neutral-100 dark:divide-zinc-800">
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
