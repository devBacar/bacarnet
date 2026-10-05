import { useState } from 'react'
import { formatMoneyCentavos } from '../../formatMoney'
import type {
  ColumnaDiaMes,
  FilaCompromisoMes,
  GrupoCompromisoMes,
  PlanillaCompromisosMes,
} from '../../../../services/finanzasCompromisosMesApi'
import {
  BotonAgregar,
  ConceptoFila,
  LineasPagosHechos,
  MontoUno,
  MontosEnLineas,
  NombreGrupo,
  PanelJuntoAlBoton,
  PieGruposVacios,
} from './planillaComun'
import {
  GRILLA,
  claseTono,
  estaPago,
  montosVacios,
  puedePagarFila,
  sumarCampo,
  tonoFalta,
  useGruposPlanilla,
} from './planillaModelo'
import { usePermisosFinanzas } from '../../permisosFinanzas'
import { montosPlanificados } from './semanasDelMes'

const FONDO_HEAD = 'bg-neutral-50 dark:bg-zinc-950'
const FONDO_GRUPO = 'bg-neutral-100 dark:bg-zinc-800'
const FONDO_TOTAL = 'bg-neutral-200 dark:bg-zinc-800'
const FONDO_HOY = 'bg-sky-50 dark:bg-sky-950'
const FONDO_GRIS = 'bg-neutral-100 dark:bg-zinc-800'
const FONDO_FILA = 'bg-white group-hover:bg-neutral-100 dark:bg-zinc-900 dark:group-hover:bg-zinc-800'

const CONCEPTO = 'sticky left-0 z-20 w-44 min-w-44 max-w-44'
const VENIA = 'w-28 min-w-28 sm:sticky sm:left-44 sm:z-20'
const PAGADO = 'min-w-28 md:sticky md:right-28 md:z-20'
const FALTA = 'min-w-28 md:sticky md:right-0 md:z-20'
const CONCEPTO_HEAD = 'sticky left-0 z-30 w-44 min-w-44 max-w-44'
const VENIA_HEAD = 'w-28 min-w-28 sm:sticky sm:left-44 sm:z-30'
const PAGADO_HEAD = 'min-w-28 md:sticky md:right-28 md:z-30'
const FALTA_HEAD = 'min-w-28 md:sticky md:right-0 md:z-30'

function rotuloDia(dia: ColumnaDiaMes): { arriba: string; abajo: string } {
  const numeros = dia.fechas.map((fecha) => String(Number(fecha.slice(8)))).join('-')
  if (dia.tipo === 'finde') return { arriba: dia.esHoy ? 'Hoy' : 'Finde', abajo: numeros }
  if (dia.tipo === 'feriado') return { arriba: dia.esHoy ? 'Hoy' : 'Feriado', abajo: numeros }
  const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(`${dia.fecha}T12:00:00Z`))
    .replace('.', '')
  return { arriba: dia.esHoy ? 'Hoy' : weekday, abajo: numeros }
}

function fondoDia(dia: ColumnaDiaMes, base: string): string {
  if (dia.esHoy) return FONDO_HOY
  if (dia.tipo !== 'habil') return FONDO_GRIS
  return base
}

function angosta(dia: ColumnaDiaMes): string {
  return dia.tipo === 'habil' ? 'min-w-[4.5rem]' : 'w-9 min-w-9'
}

export function PlanillaCompromisos({
  planilla,
  hoy,
  mesAnterior,
  onPagar,
  onEditar,
  onAgregar,
}: {
  planilla: PlanillaCompromisosMes
  hoy: string
  mesAnterior: string
  onPagar: (compromisoId: string) => void
  onEditar: (fila: FilaCompromisoMes) => void
  onAgregar: (grupo: string) => void
}) {
  const { cerrados, toggle, mostrarVacios, setMostrarVacios, vacios, visibles } = useGruposPlanilla(planilla.grupos)
  const hayArrastre = !montosVacios(planilla.arrastreCentavos)
  const filas = planilla.grupos.flatMap((grupo) => grupo.filas)
  const totalPagado = sumarCampo(planilla.grupos, 'acumulado')
  const totalFalta = sumarCampo(planilla.grupos, 'diferencia')

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <table className="border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={`${GRILLA} ${CONCEPTO_HEAD} ${FONDO_HEAD} text-left text-[13px] font-medium`}>Concepto</th>
              {hayArrastre ? (
                <th className={`${GRILLA} ${VENIA_HEAD} ${FONDO_HEAD} text-left text-[13px] font-medium leading-tight text-red-700 dark:text-red-400`}>
                  <span className="block">Venía de {mesAnterior}</span>
                  <span className="block">sin pagar</span>
                </th>
              ) : null}
              {planilla.dias.map((dia) => {
                const rotulo = rotuloDia(dia)
                const habil = dia.tipo === 'habil'
                return (
                  <th
                    key={dia.fecha}
                    title={rotulo.arriba}
                    className={`${GRILLA} ${angosta(dia)} text-center text-[13px] font-medium ${fondoDia(dia, FONDO_HEAD)} ${habil ? '' : 'text-neutral-500 dark:text-neutral-400'}`}
                  >
                    {habil ? <span className="block">{rotulo.arriba}</span> : null}
                    <span className="block tabular-nums">{rotulo.abajo}</span>
                  </th>
                )
              })}
              <th className={`${GRILLA} ${PAGADO_HEAD} ${FONDO_HEAD} text-right text-[13px] font-medium text-emerald-700 dark:text-emerald-400`}>
                Pagado
              </th>
              <th className={`${GRILLA} ${FALTA_HEAD} ${FONDO_HEAD} text-right text-[13px] font-medium`}>Falta pagar</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((grupo) => (
              <GrupoDias
                key={grupo.grupo}
                grupo={grupo}
                dias={planilla.dias}
                hayArrastre={hayArrastre}
                hoy={hoy}
                cerrado={cerrados[grupo.grupo] === true}
                onToggle={() => toggle(grupo.grupo)}
                onAgregar={() => onAgregar(grupo.grupo)}
                onEditar={onEditar}
                onPagar={onPagar}
              />
            ))}
            <tr>
              <td className={`${GRILLA} ${CONCEPTO} ${FONDO_TOTAL} text-[15px] font-bold`}>Total</td>
              {hayArrastre ? (
                <td className={`${GRILLA} ${VENIA} ${FONDO_TOTAL} text-right font-bold`}>
                  <MontosEnLineas valores={planilla.arrastreCentavos} className="text-red-600 dark:text-red-400" />
                </td>
              ) : null}
              {planilla.dias.map((dia) => (
                <td key={dia.fecha} className={`${GRILLA} ${angosta(dia)} text-center font-bold ${fondoDia(dia, FONDO_TOTAL)}`}>
                  <MontosEnLineas valores={montosPlanificados(filas, [dia.fecha])} />
                </td>
              ))}
              <td className={`${GRILLA} ${PAGADO} ${FONDO_TOTAL} text-right font-bold`}>
                <MontosEnLineas valores={totalPagado} className="text-emerald-700 dark:text-emerald-400" />
              </td>
              <td className={`${GRILLA} ${FALTA} ${FONDO_TOTAL} text-right font-bold`}>
                <MontosEnLineas valores={totalFalta} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PieGruposVacios cantidad={vacios.length} mostrar={mostrarVacios} onToggle={() => setMostrarVacios((actual) => !actual)} />
    </div>
  )
}

function GrupoDias({
  grupo,
  dias,
  hayArrastre,
  hoy,
  cerrado,
  onToggle,
  onAgregar,
  onEditar,
  onPagar,
}: {
  grupo: GrupoCompromisoMes
  dias: ColumnaDiaMes[]
  hayArrastre: boolean
  hoy: string
  cerrado: boolean
  onToggle: () => void
  onAgregar: () => void
  onEditar: (fila: FilaCompromisoMes) => void
  onPagar: (compromisoId: string) => void
}) {
  const puedeEditar = usePermisosFinanzas().agenda
  const hayFilas = grupo.filas.length > 0
  const plegar = hayFilas ? onToggle : undefined
  return (
    <>
      <tr>
        <td className={`${GRILLA} ${CONCEPTO} ${FONDO_GRUPO}`}>
          <div className="flex min-w-0 items-center justify-between gap-1">
            {hayFilas ? (
              <button type="button" className="min-w-0 text-left" aria-expanded={!cerrado} onClick={onToggle}>
                <NombreGrupo cerrado={cerrado}>{grupo.grupo}</NombreGrupo>
              </button>
            ) : (
              <span className="truncate text-[15px] font-medium">{grupo.grupo}</span>
            )}
            <BotonAgregar onClick={onAgregar} />
          </div>
        </td>
        {hayArrastre ? (
          <td className={`${GRILLA} ${VENIA} ${FONDO_GRUPO} text-right font-medium`} onClick={plegar}>
            <MontosEnLineas valores={grupo.subtotal.arrastre} className="text-red-600 dark:text-red-400" />
          </td>
        ) : null}
        {dias.map((dia) => (
          <td
            key={dia.fecha}
            className={`${GRILLA} ${angosta(dia)} text-center font-medium ${fondoDia(dia, FONDO_GRUPO)}`}
            onClick={plegar}
          >
            <MontosEnLineas valores={montosPlanificados(grupo.filas, [dia.fecha])} />
          </td>
        ))}
        <td className={`${GRILLA} ${PAGADO} ${FONDO_GRUPO} text-right font-medium`} onClick={plegar}>
          <MontosEnLineas valores={grupo.subtotal.acumulado} className="text-emerald-700 dark:text-emerald-400" />
        </td>
        <td className={`${GRILLA} ${FALTA} ${FONDO_GRUPO} text-right font-medium`} onClick={plegar}>
          <MontosEnLineas valores={grupo.subtotal.diferencia} />
        </td>
      </tr>
      {cerrado
        ? null
        : grupo.filas.map((fila) => (
            <tr
              key={fila.compromisoId}
              className={puedeEditar ? 'group cursor-pointer' : 'group'}
              onClick={puedeEditar ? () => onEditar(fila) : undefined}
            >
              <td className={`${GRILLA} ${CONCEPTO} overflow-hidden ${FONDO_FILA}`}>
                <ConceptoFila fila={fila} onEditar={() => onEditar(fila)} />
              </td>
              {hayArrastre ? (
                <td className={`${GRILLA} ${VENIA} text-right ${FONDO_FILA}`}>
                  <MontoUno centavos={fila.arrastreCentavos} moneda={fila.moneda} tono="vencido" />
                </td>
              ) : null}
              {dias.map((dia) => (
                <td key={dia.fecha} className={`${GRILLA} ${angosta(dia)} text-center ${fondoDia(dia, FONDO_FILA)}`}>
                  <Celda fila={fila} dia={dia} hoy={hoy} onPagar={onPagar} />
                </td>
              ))}
              <td className={`${GRILLA} ${PAGADO} text-right ${FONDO_FILA}`}>
                <MontoUno centavos={fila.acumuladoCentavos} moneda={fila.moneda} tono="pagado" tilde={estaPago(fila)} />
              </td>
              <td className={`${GRILLA} ${FALTA} text-right ${FONDO_FILA}`}>
                <MontoUno centavos={fila.diferenciaCentavos} moneda={fila.moneda} tono={tonoFalta(fila, hoy)} />
              </td>
            </tr>
          ))}
    </>
  )
}

function Celda({
  fila,
  dia,
  hoy,
  onPagar,
}: {
  fila: FilaCompromisoMes
  dia: ColumnaDiaMes
  hoy: string
  onPagar: (compromisoId: string) => void
}) {
  const puedeEditar = usePermisosFinanzas().agenda
  const [ancla, setAncla] = useState<HTMLButtonElement | null>(null)
  const celda = fila.porDia[dia.fecha]
  if (!celda || (celda.planificadoCentavos <= 0 && celda.pagadoCentavos <= 0)) return null
  const pagoCompleto = estaPago(fila)
  const faltaEnElDia = celda.planificadoCentavos > celda.pagadoCentavos
  const tonoPlan = pagoCompleto ? 'pagado' : dia.fecha < hoy ? 'vencido' : 'aPagar'
  const puedePagar = puedeEditar && dia.esHoy && puedePagarFila(fila) && faltaEnElDia
  const lineas = fila.pagosResumen ?? []
  const abrir = (boton: HTMLButtonElement) => setAncla(boton)
  const monto = (centavos: number, clase: string, conTilde: boolean) =>
    lineas.length > 0 ? (
      <button
        type="button"
        className={`max-w-full truncate tabular-nums underline-offset-2 hover:underline ${clase}`}
        onClick={(event) => {
          event.stopPropagation()
          abrir(event.currentTarget)
        }}
      >
        {conTilde ? '✓ ' : ''}
        {formatMoneyCentavos(centavos, fila.moneda)}
      </button>
    ) : (
      <span className={`tabular-nums ${clase}`}>
        {conTilde ? '✓ ' : ''}
        {formatMoneyCentavos(centavos, fila.moneda)}
      </span>
    )
  return (
    <span className="inline-flex max-w-full flex-col items-center gap-0.5">
      {faltaEnElDia ? (
        <span title={celda.corrido ? 'Cayó en finde o feriado: se anota este día.' : undefined}>
          {celda.corrido ? <span className={claseTono(tonoPlan)}>↩ </span> : null}
          {monto(celda.planificadoCentavos, claseTono(tonoPlan), pagoCompleto)}
        </span>
      ) : null}
      {celda.pagadoCentavos > 0 ? monto(celda.pagadoCentavos, 'text-emerald-700 dark:text-emerald-400', pagoCompleto && !faltaEnElDia) : null}
      {puedePagar ? (
        <button
          type="button"
          className="rounded bg-brand-primary px-1.5 py-0.5 text-[13px] font-medium leading-none text-white"
          onClick={(event) => {
            event.stopPropagation()
            onPagar(fila.compromisoId)
          }}
        >
          Pagar
        </button>
      ) : null}
      {ancla ? (
        <PanelJuntoAlBoton boton={ancla} etiqueta={`Pagos de ${fila.concepto}`} onCerrar={() => setAncla(null)}>
          <p className="text-[15px] font-medium text-neutral-900 dark:text-gray-100">{fila.concepto}</p>
          <LineasPagosHechos pagos={lineas} />
        </PanelJuntoAlBoton>
      ) : null}
    </span>
  )
}
