import { useQuery } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChequesVentana } from '../../components/tablero-finanzas/ChequesVentana'
import { fechaHora, mesLargo, plata, textoContraMesAnterior, textoMovimientos, textoPct, textoVariacion30 } from '../../components/tablero-finanzas/formatoTablero'
import { GraficoEntradasSalidas } from '../../components/tablero-finanzas/GraficoEntradasSalidas'
import { GruposPlata } from '../../components/tablero-finanzas/GruposPlata'
import { TarjetaTablero } from '../../components/tablero-finanzas/TarjetaTablero'
import { fetchTableroFinanzas, type MonedaTablero, type TableroFinanzas } from '../../services/finanzasTableroApi'

const CLASE_SELECT =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] font-normal text-neutral-900 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

function TarjetaNumero({
  titulo,
  valor,
  nota,
  tono,
}: {
  titulo: string
  valor: string
  nota: string
  tono?: 'bien' | 'mal'
}) {
  const colorNota =
    tono === 'bien' ? 'text-emerald-700 dark:text-emerald-400' : tono === 'mal' ? 'text-red-700 dark:text-red-400' : 'text-neutral-600 dark:text-gray-400'
  return (
    <article className="min-w-0 rounded-xl border border-neutral-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="text-brand-primary text-[14px] font-medium">{titulo}</h2>
      <p className="mt-1 break-words text-[26px] font-bold leading-tight tabular-nums text-neutral-900 dark:text-gray-100">{valor}</p>
      <p className={`mt-1 text-[13px] leading-snug ${colorNota}`}>{nota}</p>
    </article>
  )
}

function Resumen({ datos }: { datos: TableroFinanzas }) {
  const { resumen, moneda } = datos
  const variacion = textoVariacion30(resumen.variacion30Centavos, moneda)
  const notaSaldo = variacion
    ? resumen.saldoHace30Centavos != null
      ? `Hace 30 días: ${plata(resumen.saldoHace30Centavos, moneda)}. ${variacion.charAt(0).toUpperCase()}${variacion.slice(1)}.`
      : variacion
    : resumen.cuentasSinSaldoPrevio.length > 0
      ? `Falta el saldo de hace 30 días de ${resumen.cuentasSinSaldoPrevio.join(', ')}.`
      : 'Todavía no hay saldo de hace 30 días para comparar.'
  const notaCosto =
    resumen.costoBancarioPorcentaje == null
      ? 'Este mes no hubo salidas para comparar.'
      : resumen.costoBancarioCentavos < 0
        ? 'Hubo más reintegros que gastos.'
        : `${textoPct(resumen.costoBancarioPorcentaje)} de lo que salió`
  const tonoSaldo =
    resumen.variacion30Centavos == null || resumen.variacion30Centavos === 0
      ? undefined
      : resumen.variacion30Centavos > 0
        ? 'bien'
        : 'mal'

  return (
    <section className="grid min-w-0 gap-3">
      <p className="text-[14px] leading-snug text-neutral-600 dark:text-gray-400">
        El saldo es el de hoy. Lo que entró, lo que salió y el costo bancario son de {mesLargo(datos.mes)}.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaNumero titulo="Saldo de hoy" valor={plata(resumen.saldoHoyCentavos, moneda)} nota={notaSaldo} tono={tonoSaldo} />
        <TarjetaNumero titulo="Entró en el mes" valor={plata(resumen.entradasCentavos, moneda)} nota="Cobros, préstamos y otras entradas." />
        <TarjetaNumero titulo="Salió en el mes" valor={plata(resumen.salidasCentavos, moneda)} nota="Pagos, impuestos, gastos y el costo del banco." />
        <TarjetaNumero titulo="Costo bancario" valor={plata(resumen.costoBancarioCentavos, moneda)} nota={notaCosto} />
      </div>
    </section>
  )
}

function CostoPorBanco({ datos }: { datos: TableroFinanzas }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const { resumen, moneda } = datos
  const notaTotal =
    resumen.costoBancarioPorcentaje == null
      ? 'Este mes no hubo salidas para comparar.'
      : resumen.costoBancarioCentavos < 0
        ? 'Hubo más reintegros que gastos.'
        : `${textoPct(resumen.costoBancarioPorcentaje)} de lo que salió`
  return (
    <TarjetaTablero
      titulo="Costo bancario por banco"
      subtitulo="Comisiones, mantenimiento de cuenta, chequeras, Interbanking e impuesto al cheque. El IVA no entra. Tocá un banco para ver el detalle."
    >
      <p className="text-[15px] text-neutral-900 dark:text-gray-100">
        Total del mes: <strong className="tabular-nums">{plata(resumen.costoBancarioCentavos, moneda)}</strong>
        <span className="text-neutral-600 dark:text-gray-400"> · {notaTotal}</span>
      </p>
      <p className="mt-1 mb-4 text-[13px] text-neutral-600 dark:text-gray-400">
        Mes anterior: {plata(resumen.costoBancarioMesAnteriorCentavos, moneda)} ·{' '}
        {textoContraMesAnterior(resumen.costoBancarioVariacionPorcentaje, resumen.costoBancarioMesAnteriorCentavos)}
      </p>
      {datos.costoPorBanco.length === 0 ? (
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">Este mes no hubo costo bancario.</p>
      ) : (
        <ul className="grid gap-2">
          {datos.costoPorBanco.map((banco) => {
            const abiertoEste = abierto === banco.banco
            return (
              <li key={banco.banco} className="min-w-0 border-b border-neutral-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800">
                <button
                  type="button"
                  aria-expanded={abiertoEste}
                  onClick={() => setAbierto(abiertoEste ? null : banco.banco)}
                  className="grid w-full min-w-0 gap-0.5 rounded-lg px-1 py-1.5 text-left hover:bg-neutral-50 dark:hover:bg-zinc-800"
                >
                  <span className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-medium text-neutral-900 dark:text-gray-100">{banco.banco}</span>
                    <span className="shrink-0 tabular-nums text-neutral-900 dark:text-gray-100">{plata(banco.centavos, moneda)}</span>
                  </span>
                  <span className="text-[13px] text-neutral-600 dark:text-gray-400">
                    Mes anterior: {plata(banco.mesAnteriorCentavos, moneda)} · {textoContraMesAnterior(banco.variacionPorcentaje, banco.mesAnteriorCentavos)}
                  </span>
                </button>
                {abiertoEste ? (
                  banco.categorias.length === 0 ? (
                    <p className="mt-1 pl-3 text-[14px] text-neutral-600 dark:text-gray-400">Este mes no tuvo costo en este banco.</p>
                  ) : (
                    <ul className="mt-1 grid gap-2 border-l-2 border-neutral-200 py-1 pl-3 dark:border-zinc-700">
                      {banco.categorias.map((categoria) => (
                        <li key={categoria.nombre} className="flex min-w-0 items-baseline justify-between gap-3 text-[14px]">
                          <span className="min-w-0 truncate text-neutral-800 dark:text-gray-200">{categoria.nombre}</span>
                          <span className="shrink-0 text-right tabular-nums text-neutral-700 dark:text-gray-300">
                            {plata(categoria.centavos, moneda)}
                            <span className="text-neutral-500"> · {textoMovimientos(categoria.cantidad)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </TarjetaTablero>
  )
}

export function TableroFinanzasPage() {
  const [mes, setMes] = useState<string | null>(null)
  const [moneda, setMoneda] = useState<MonedaTablero>('ARS')
  const tablero = useQuery({
    queryKey: ['finanzas-tablero', mes, moneda],
    queryFn: () => fetchTableroFinanzas({ mes, moneda }),
    staleTime: 5 * 60_000,
  })
  const datos = tablero.data
  const mesVisible = mes ?? datos?.mes ?? ''
  const hayDolares = datos?.monedas.includes('USD') ?? false

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-5 px-4 py-6 sm:px-6">
      <header className="min-w-0">
        <Link to="/tableros" className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-neutral-600 hover:text-[var(--color-primary)] dark:text-gray-400">
          ← Tableros
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-gray-100">
          <Landmark className="h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden />
          Tablero de Finanzas
        </h1>
        <p className="mt-1 text-[13px] text-neutral-600 dark:text-gray-400">
          Cómo venimos, de un vistazo. No reemplaza la pantalla Hoy de Finanzas.
          {datos ? <span className="block">Actualizado el {fechaHora(datos.generadoEn)}.</span> : null}
        </p>
      </header>

      <div className="grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 sm:flex sm:flex-wrap sm:items-end dark:border-zinc-700 dark:bg-zinc-900/60">
        <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
          Mes
          <select value={mesVisible} onChange={(e) => setMes(e.target.value)} disabled={!datos} className={CLASE_SELECT}>
            {(datos ? [...datos.meses].reverse() : []).map((opcion) => (
              <option key={opcion} value={opcion}>
                {mesLargo(opcion)}
              </option>
            ))}
          </select>
        </label>
        {hayDolares ? (
          <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
            Moneda
            <select value={moneda} onChange={(e) => setMoneda(e.target.value === 'USD' ? 'USD' : 'ARS')} className={CLASE_SELECT}>
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </label>
        ) : null}
      </div>

      {tablero.isPending && <p className="text-body-muted text-[14px]">Cargando el tablero…</p>}
      {tablero.isError && (
        <p role="alert" className="text-[14px] text-red-700 dark:text-red-400">
          {tablero.error instanceof Error ? tablero.error.message : 'No se pudo cargar el tablero.'}
        </p>
      )}

      {datos ? (
        <div className="grid min-w-0 gap-5">
          <Resumen datos={datos} />
          <TarjetaTablero
            titulo="Entradas y salidas por mes"
            subtitulo="Tocá un mes para ver el monto. No cuenta los pases entre cuentas propias ni la plata de fondos comunes."
          >
            <GraficoEntradasSalidas key={`${datos.mes}-${datos.moneda}`} meses={datos.porMes} moneda={datos.moneda} />
          </TarjetaTablero>
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <TarjetaTablero
              titulo="En qué se fue la plata"
              subtitulo="Pagos y otros gastos del mes, sin el costo del banco. Tocá un grupo para ver el detalle."
            >
              <GruposPlata key={`salidas-${datos.mes}-${datos.moneda}`} grupos={datos.salidasPorGrupo} moneda={datos.moneda} vacio="Este mes no hubo salidas." />
            </TarjetaTablero>
            <TarjetaTablero
              titulo="De dónde vino la plata"
              subtitulo="Cobros, préstamos, adelantos y otras entradas. Un préstamo no es una venta. Tocá un grupo para ver el detalle."
            >
              <GruposPlata key={`entradas-${datos.mes}-${datos.moneda}`} grupos={datos.entradasPorGrupo} moneda={datos.moneda} vacio="Este mes no hubo entradas." />
            </TarjetaTablero>
          </div>
          <p className="text-[13px] leading-snug text-neutral-500 dark:text-gray-400">
            No se cuentan los pases entre cuentas propias ni la plata puesta y sacada de fondos comunes.
          </p>
          <CostoPorBanco key={`costo-${datos.mes}-${datos.moneda}`} datos={datos} />
          <ChequesVentana key={`cheques-${datos.mes}-${datos.moneda}`} datos={datos} />
        </div>
      ) : null}
    </div>
  )
}
