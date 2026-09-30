import { useState } from 'react'
import { formatMoneyCentavos } from '../../formatMoney'
import type {
  ColumnaDiaMes,
  FilaCompromisoMes,
  MonedaCompromiso,
  MontosMoneda,
  PlanillaCompromisosMes,
} from '../../../../services/finanzasCompromisosMesApi'

const FONDO = 'bg-white dark:bg-zinc-900'
const FONDO_CABECERA = 'bg-neutral-50 dark:bg-zinc-950'
const FONDO_GRUPO = 'bg-neutral-100 dark:bg-zinc-800'
const FONDO_SUB = 'bg-neutral-50 dark:bg-zinc-950/80'
const FONDO_HOY = 'bg-sky-50 dark:bg-sky-950/40'
const FONDO_GRIS = 'bg-neutral-100 dark:bg-zinc-800/70'

function monto(centavos: number, moneda: MonedaCompromiso): string {
  return formatMoneyCentavos(centavos, moneda)
}

function pesosDe(valores: MontosMoneda, tipoCambio: number | null): string {
  if (valores.usd > 0 && tipoCambio == null) {
    const pesos = valores.ars > 0 ? `${monto(valores.ars, 'ARS')} + ` : ''
    return `${pesos}${monto(valores.usd, 'USD')}`
  }
  const convertido = valores.ars + (tipoCambio == null ? 0 : Math.round(valores.usd * tipoCambio))
  return monto(convertido, 'ARS')
}

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

function claseBorde(): string {
  return 'border-b border-neutral-200 px-2 py-1.5 align-top dark:border-zinc-800'
}

export function PlanillaCompromisos({
  planilla,
  onPagar,
  onEditar,
  onAgregar,
}: {
  planilla: PlanillaCompromisosMes
  onPagar: (compromisoId: string) => void
  onEditar: (fila: FilaCompromisoMes) => void
  onAgregar: (grupo: string) => void
}) {
  const [cerrados, setCerrados] = useState<Record<string, boolean>>({})
  const hayDolares = planilla.grupos.some(
    (grupo) => grupo.subtotal.importe.usd > 0 || grupo.subtotal.acumulado.usd > 0,
  )
  const totalImporte = sumar(planilla, 'importe')
  const totalAcumulado = sumar(planilla, 'acumulado')
  const totalDiferencia = sumar(planilla, 'diferencia')

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className={`sticky left-0 z-30 w-36 min-w-32 text-left text-xs font-medium ${claseBorde()} ${FONDO_CABECERA}`}>
                Concepto
              </th>
              <MetaHead texto="Deuda" left="min-[880px]:left-36" />
              <MetaHead texto="A pagar" left="min-[880px]:left-[16rem]" />
              <MetaHead texto="Cuota" left="min-[880px]:left-[23rem]" ancho="min-w-[4.5rem] w-[4.5rem]" />
              <MetaHead texto="Obs." left="min-[880px]:left-[27.5rem]" ancho="min-w-24 w-24" borde />
              {planilla.dias.map((dia) => {
                const rotulo = rotuloDia(dia)
                return (
                  <th
                    key={dia.fecha}
                    className={`min-w-[4.75rem] text-center text-xs font-medium ${claseBorde()} ${fondoDia(dia, FONDO_CABECERA)} ${dia.tipo === 'habil' && !dia.esHoy ? '' : 'text-neutral-500 dark:text-neutral-400'} ${dia.esHoy ? 'text-sky-900 dark:text-sky-100' : ''}`}
                  >
                    <span className="block">{rotulo.arriba}</span>
                    <span className="block tabular-nums">{rotulo.abajo}</span>
                  </th>
                )
              })}
              <th className={`z-30 min-w-28 text-right text-xs font-medium min-[880px]:sticky min-[880px]:right-28 ${claseBorde()} ${FONDO_CABECERA}`}>
                Acumulado
              </th>
              <th className={`z-30 min-w-28 text-right text-xs font-medium min-[880px]:sticky min-[880px]:right-0 ${claseBorde()} border-l border-neutral-200 dark:border-zinc-700 ${FONDO_CABECERA}`}>
                Diferencia
              </th>
            </tr>
          </thead>
          <tbody>
            {planilla.grupos.map((grupo) => {
              const cerrado = cerrados[grupo.grupo] === true
              return (
                <GrupoFilas
                  key={grupo.grupo}
                  grupoNombre={grupo.grupo}
                  filas={grupo.filas}
                  subtotal={grupo.subtotal}
                  subtotalPorDia={grupo.subtotalPorDia}
                  dias={planilla.dias}
                  cerrado={cerrado}
                  onToggle={() => setCerrados((actual) => ({ ...actual, [grupo.grupo]: !cerrado }))}
                  onPagar={onPagar}
                  onEditar={onEditar}
                  onAgregar={onAgregar}
                />
              )
            })}
            <tr>
              <td className={`sticky left-0 z-10 text-sm font-medium ${claseBorde()} ${FONDO_GRUPO}`}>Total egresos</td>
              <td className={meta(FONDO_GRUPO, 'min-[880px]:left-36')} />
              <td className={`text-right text-xs font-medium tabular-nums ${meta(FONDO_GRUPO, 'min-[880px]:left-[16rem]')}`}>
                {pesosDe(totalImporte, planilla.tipoCambio)}
              </td>
              <td className={meta(FONDO_GRUPO, 'min-[880px]:left-[23rem]', 'min-w-[4.5rem] w-[4.5rem]')} />
              <td className={meta(FONDO_GRUPO, 'min-[880px]:left-[27.5rem]', 'min-w-24 w-24', true)} />
              {planilla.dias.map((dia) => {
                const total = planilla.totalEgresosPorDia[dia.fecha]
                const vacio = !total || (total.ars === 0 && total.usd === 0)
                return (
                  <td
                    key={dia.fecha}
                    className={`text-center text-xs font-medium tabular-nums ${claseBorde()} ${fondoDia(dia, FONDO_GRUPO)}`}
                  >
                    {vacio ? '' : pesosDe(total, planilla.tipoCambio)}
                  </td>
                )
              })}
              <td className={`text-right text-xs font-medium tabular-nums min-[880px]:sticky min-[880px]:right-28 z-10 ${claseBorde()} ${FONDO_GRUPO}`}>
                {pesosDe(totalAcumulado, planilla.tipoCambio)}
              </td>
              <td
                className={`z-10 border-l border-neutral-200 text-right text-xs font-medium tabular-nums min-[880px]:sticky min-[880px]:right-0 dark:border-zinc-700 ${claseBorde()} ${FONDO_GRUPO} ${totalDiferencia.ars > 0 || totalDiferencia.usd > 0 ? 'text-red-600 dark:text-red-400' : ''}`}
              >
                {pesosDe(totalDiferencia, planilla.tipoCambio)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-body-muted px-3 py-2 text-xs">
        En gris, lo previsto para ese día. En verde, lo pagado. Si el vencimiento cae en finde o feriado, se marca en el
        hábil anterior.
      </p>
      {hayDolares && planilla.tipoCambio != null ? (
        <p className="text-body-muted px-3 pb-3 text-xs">
          El total en pesos incluye los dólares al tipo de cambio{' '}
          {planilla.tipoCambio.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.
        </p>
      ) : null}
      {hayDolares && planilla.tipoCambio == null ? (
        <p className="px-3 pb-3 text-xs text-red-600 dark:text-red-400">
          Falta el tipo de cambio para pasar los dólares a pesos. El total muestra las dos monedas.
        </p>
      ) : null}
    </div>
  )
}

function sumar(planilla: PlanillaCompromisosMes, campo: 'importe' | 'acumulado' | 'diferencia'): MontosMoneda {
  return planilla.grupos.reduce(
    (total, grupo) => ({
      ars: total.ars + grupo.subtotal[campo].ars,
      usd: total.usd + grupo.subtotal[campo].usd,
    }),
    { ars: 0, usd: 0 },
  )
}

function meta(fondo: string, left: string, ancho = 'min-w-28 w-28', borde = false): string {
  return `${claseBorde()} ${fondo} ${ancho} min-[880px]:sticky ${left} z-10 ${borde ? 'min-[880px]:border-r min-[880px]:border-neutral-200 min-[880px]:dark:border-zinc-700' : ''}`
}

function MetaHead({
  texto,
  left,
  ancho = 'min-w-28 w-28',
  borde = false,
}: {
  texto: string
  left: string
  ancho?: string
  borde?: boolean
}) {
  return (
    <th className={`z-30 text-left text-xs font-medium min-[880px]:sticky ${left} ${ancho} ${claseBorde()} ${FONDO_CABECERA} ${borde ? 'min-[880px]:border-r min-[880px]:border-neutral-200 dark:min-[880px]:border-zinc-700' : ''}`}>
      {texto}
    </th>
  )
}

function GrupoFilas({
  grupoNombre,
  filas,
  subtotal,
  subtotalPorDia,
  dias,
  cerrado,
  onToggle,
  onPagar,
  onEditar,
  onAgregar,
}: {
  grupoNombre: string
  filas: FilaCompromisoMes[]
  subtotal: { importe: MontosMoneda; acumulado: MontosMoneda; diferencia: MontosMoneda }
  subtotalPorDia: Record<string, MontosMoneda>
  dias: ColumnaDiaMes[]
  cerrado: boolean
  onToggle: () => void
  onPagar: (compromisoId: string) => void
  onEditar: (fila: FilaCompromisoMes) => void
  onAgregar: (grupo: string) => void
}) {
  return (
    <>
      <tr>
        <td className={`sticky left-0 z-10 ${claseBorde()} ${FONDO_GRUPO}`}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="text-left text-sm font-medium" aria-expanded={!cerrado} onClick={onToggle}>
              <span className="mr-1 text-xs">{cerrado ? '▸' : '▾'}</span>
              {grupoNombre}
            </button>
            <button type="button" className="text-xs font-medium text-brand-primary" onClick={() => onAgregar(grupoNombre)}>
              + Agregar
            </button>
          </div>
        </td>
        <td className={meta(FONDO_GRUPO, 'min-[880px]:left-36')} />
        <td className={meta(FONDO_GRUPO, 'min-[880px]:left-[16rem]')} />
        <td className={meta(FONDO_GRUPO, 'min-[880px]:left-[23rem]', 'min-w-[4.5rem] w-[4.5rem]')} />
        <td className={meta(FONDO_GRUPO, 'min-[880px]:left-[27.5rem]', 'min-w-24 w-24', true)} />
        {dias.map((dia) => (
          <td key={dia.fecha} className={`${claseBorde()} ${fondoDia(dia, FONDO_GRUPO)}`} />
        ))}
        <td className={`min-[880px]:sticky min-[880px]:right-28 z-10 ${claseBorde()} ${FONDO_GRUPO}`} />
        <td className={`min-[880px]:sticky min-[880px]:right-0 z-10 border-l border-neutral-200 dark:border-zinc-700 ${claseBorde()} ${FONDO_GRUPO}`} />
      </tr>
      {cerrado
        ? null
        : filas.map((fila) => (
            <tr key={fila.compromisoId}>
              <td className={`sticky left-0 z-10 w-36 min-w-32 ${claseBorde()} ${FONDO}`}>
                <button type="button" className="text-left text-sm font-medium text-heading hover:underline" onClick={() => onEditar(fila)}>
                  {fila.concepto}
                </button>
                <p className="text-body-muted text-xs">{fila.proveedorONombre}</p>
                {fila.acumuladoCentavos > 0 && fila.diferenciaCentavos > 0 ? (
                  <p className="text-body-muted text-xs">
                    Pagado {monto(fila.acumuladoCentavos, fila.moneda)} de {monto(fila.importeCentavos, fila.moneda)}
                  </p>
                ) : null}
              </td>
              <td className={`text-right text-xs tabular-nums ${meta(FONDO, 'min-[880px]:left-36')}`}>
                {fila.deudaTotalCentavos == null ? '—' : monto(fila.deudaTotalCentavos, fila.moneda)}
              </td>
              <td className={`text-right text-xs tabular-nums ${meta(FONDO, 'min-[880px]:left-[16rem]')}`}>
                {monto(fila.importeCentavos, fila.moneda)}
              </td>
              <td className={`text-xs ${meta(FONDO, 'min-[880px]:left-[23rem]', 'min-w-[4.5rem] w-[4.5rem]')}`}>
                {fila.cuota ?? '—'}
              </td>
              <td className={`max-w-24 truncate text-xs ${meta(FONDO, 'min-[880px]:left-[27.5rem]', 'min-w-24 w-24', true)}`} title={fila.observacion ?? undefined}>
                {fila.observacion ?? '—'}
              </td>
              {dias.map((dia) => (
                <td key={dia.fecha} className={`text-center text-xs ${claseBorde()} ${fondoDia(dia, FONDO)}`}>
                  <Celda fila={fila} dia={dia} onPagar={onPagar} />
                </td>
              ))}
              <td className={`text-right text-xs tabular-nums min-[880px]:sticky min-[880px]:right-28 z-10 ${claseBorde()} ${FONDO}`}>
                {monto(fila.acumuladoCentavos, fila.moneda)}
              </td>
              <td
                className={`z-10 border-l border-neutral-200 text-right text-xs tabular-nums min-[880px]:sticky min-[880px]:right-0 dark:border-zinc-700 ${claseBorde()} ${FONDO} ${fila.diferenciaCentavos > 0 ? 'text-red-600 dark:text-red-400' : ''}`}
              >
                {monto(fila.diferenciaCentavos, fila.moneda)}
              </td>
            </tr>
          ))}
      {filas.length === 0 ? null : (
        <tr>
          <td className={`sticky left-0 z-10 text-xs font-medium ${claseBorde()} ${FONDO_SUB}`}>Subtotal</td>
          <td className={meta(FONDO_SUB, 'min-[880px]:left-36')} />
          <td className={`text-right text-xs font-medium tabular-nums ${meta(FONDO_SUB, 'min-[880px]:left-[16rem]')}`}>
            <MonedaDoble valores={subtotal.importe} />
          </td>
          <td className={meta(FONDO_SUB, 'min-[880px]:left-[23rem]', 'min-w-[4.5rem] w-[4.5rem]')} />
          <td className={meta(FONDO_SUB, 'min-[880px]:left-[27.5rem]', 'min-w-24 w-24', true)} />
          {dias.map((dia) => (
            <td key={dia.fecha} className={`text-center text-xs font-medium ${claseBorde()} ${fondoDia(dia, FONDO_SUB)}`}>
              <MonedaDoble valores={subtotalPorDia[dia.fecha]} />
            </td>
          ))}
          <td className={`text-right text-xs font-medium min-[880px]:sticky min-[880px]:right-28 z-10 ${claseBorde()} ${FONDO_SUB}`}>
            <MonedaDoble valores={subtotal.acumulado} />
          </td>
          <td
            className={`z-10 border-l border-neutral-200 text-right text-xs font-medium min-[880px]:sticky min-[880px]:right-0 dark:border-zinc-700 ${claseBorde()} ${FONDO_SUB} ${subtotal.diferencia.ars > 0 || subtotal.diferencia.usd > 0 ? 'text-red-600 dark:text-red-400' : ''}`}
          >
            <MonedaDoble valores={subtotal.diferencia} />
          </td>
        </tr>
      )}
    </>
  )
}

function MonedaDoble({ valores }: { valores: MontosMoneda | undefined }) {
  if (!valores || (valores.ars === 0 && valores.usd === 0)) return null
  return (
    <span className="tabular-nums">
      {valores.ars > 0 ? <span className="block">{monto(valores.ars, 'ARS')}</span> : null}
      {valores.usd > 0 ? <span className="block">{monto(valores.usd, 'USD')}</span> : null}
    </span>
  )
}

function Celda({
  fila,
  dia,
  onPagar,
}: {
  fila: FilaCompromisoMes
  dia: ColumnaDiaMes
  onPagar: (compromisoId: string) => void
}) {
  const celda = fila.porDia[dia.fecha]
  if (!celda || (celda.planificadoCentavos <= 0 && celda.pagadoCentavos <= 0)) return null
  const muestraPlan = celda.planificadoCentavos > 0 && celda.pagadoCentavos < celda.planificadoCentavos
  const puedePagar =
    dia.esHoy &&
    muestraPlan &&
    fila.diferenciaCentavos > 0 &&
    fila.estado !== 'pagado' &&
    fila.estado !== 'confeccionada_pendiente_autorizacion'
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      {muestraPlan ? (
        <span
          className="text-neutral-400 tabular-nums dark:text-neutral-500"
          title={celda.corrido ? 'Pasado al día hábil anterior' : undefined}
        >
          {celda.corrido ? '↩ ' : ''}
          {monto(celda.planificadoCentavos, fila.moneda)}
        </span>
      ) : null}
      {celda.pagadoCentavos > 0 ? (
        <span className="text-emerald-700 tabular-nums dark:text-emerald-400">
          ✓ {monto(celda.pagadoCentavos, fila.moneda)}
        </span>
      ) : null}
      {puedePagar ? (
        <button
          type="button"
          className="rounded bg-brand-primary px-1.5 py-0.5 text-[11px] font-medium leading-none text-white"
          onClick={() => onPagar(fila.compromisoId)}
        >
          Pagar
        </button>
      ) : null}
    </span>
  )
}
