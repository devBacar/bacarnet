import { useQuery } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarraHorizontal, EvolucionMensual, colorUnegocio } from '../../components/tablero-ventas/graficos'
import { TarjetaTablero } from '../../components/tablero-finanzas/TarjetaTablero'
import { fechaHora, mesLargo, plata, plataCorta, textoPct } from '../../components/tablero-finanzas/formatoTablero'
import { fetchTableroVentas, type MonedaTablero, type TableroVentas } from '../../services/finanzasVentasTableroApi'

const CLASE_SELECT =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] font-normal text-neutral-900 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

function mesesRecientes(hastaMes: string, cantidad: number): string[] {
  const [anioStr, mesStr] = hastaMes.split('-')
  let anio = Number(anioStr)
  let mes = Number(mesStr)
  const salida: string[] = []
  for (let i = 0; i < cantidad; i++) {
    salida.push(`${anio}-${String(mes).padStart(2, '0')}`)
    mes -= 1
    if (mes === 0) {
      mes = 12
      anio -= 1
    }
  }
  return salida
}

function Kpi({ etiqueta, valor, nota, notaColor }: { etiqueta: string; valor: string; nota?: string; notaColor?: 'good' | 'bad' | 'neutral' }) {
  const colorNota =
    notaColor === 'good'
      ? 'text-emerald-700 dark:text-emerald-400'
      : notaColor === 'bad'
        ? 'text-red-700 dark:text-red-400'
        : 'text-neutral-600 dark:text-gray-400'
  return (
    <article className="min-w-0 rounded-xl border border-neutral-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="text-[13px] font-medium text-neutral-600 dark:text-gray-400">{etiqueta}</h2>
      <p className="mt-1 break-words text-[22px] font-bold leading-tight tabular-nums text-neutral-900 dark:text-gray-100">{valor}</p>
      {nota ? <p className={`mt-1 text-[12px] leading-snug ${colorNota}`}>{nota}</p> : null}
    </article>
  )
}

function Kpis({ datos }: { datos: TableroVentas }) {
  const variacion = datos.variacionPorcentaje
  const notaVariacion =
    datos.totalMesAnteriorCentavos > 0
      ? variacion == null || variacion === 0
        ? 'igual que el mes anterior'
        : `${variacion > 0 ? '↑' : '↓'} ${textoPct(variacion)} vs. mes anterior`
      : 'sin mes anterior para comparar'
  return (
    <section className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        etiqueta="Ventas totales del mes"
        valor={plata(datos.totalCentavos, datos.moneda)}
        nota={notaVariacion}
        notaColor={variacion == null ? 'neutral' : variacion > 0 ? 'good' : variacion < 0 ? 'bad' : 'neutral'}
      />
      <Kpi etiqueta="Comprobantes emitidos" valor={datos.cantidadComprobantes.toLocaleString('es-AR')} />
      <Kpi etiqueta="Ticket promedio" valor={plata(datos.ticketPromedioCentavos, datos.moneda)} />
      <Kpi
        etiqueta="Clientes facturados"
        valor={datos.cantidadClientes.toLocaleString('es-AR')}
        nota={datos.concentracionTop5Porcentaje != null ? `top 5 = ${textoPct(datos.concentracionTop5Porcentaje)} del total` : undefined}
      />
    </section>
  )
}

function AvisoSinItems() {
  return (
    <article className="min-w-0 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] leading-snug text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      Todavía no se importaron los ítems facturados (items.csv de Vientri). El desglose por unidad de negocio y por
      ítem va a aparecer vacío hasta que se corra una importación con ese archivo.
    </article>
  )
}

function Evolucion({ datos }: { datos: TableroVentas }) {
  return (
    <TarjetaTablero titulo="Evolución mensual" subtitulo="Facturación total, últimos 6 meses.">
      <EvolucionMensual datos={datos.tendencia} moneda={datos.moneda} />
    </TarjetaTablero>
  )
}

function PorUnegocio({ datos }: { datos: TableroVentas }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  if (datos.porUnegocio.length === 0) {
    return (
      <TarjetaTablero titulo="Por unidad de negocio">
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">Este mes no hay comprobantes de venta cargados.</p>
      </TarjetaTablero>
    )
  }
  const maximo = Math.max(...datos.porUnegocio.map((u) => u.centavos))
  return (
    <TarjetaTablero titulo="Por unidad de negocio" subtitulo="Las 6 unidades de Vientri, separadas. Tocá una para ver sus ítems facturados.">
      <ul className="grid gap-3">
        {datos.porUnegocio.map((un, i) => {
          const clave = String(un.idUnegocio ?? 'sin-unegocio')
          const abiertoEste = abierto === clave
          const color = colorUnegocio(un.idUnegocio, i)
          return (
            <li key={clave} className="min-w-0 border-b border-neutral-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800">
              <button
                type="button"
                aria-expanded={abiertoEste}
                onClick={() => setAbierto(abiertoEste ? null : clave)}
                className="grid w-full min-w-0 gap-1 rounded-lg px-1 py-1 text-left hover:bg-neutral-50 dark:hover:bg-zinc-800"
              >
                <BarraHorizontal
                  etiqueta={un.nombre}
                  valor={un.centavos}
                  maximo={maximo}
                  color={color}
                  texto={`${plata(un.centavos, datos.moneda)}${un.porcentaje != null ? ` · ${textoPct(un.porcentaje)}` : ''}`}
                />
              </button>
              {abiertoEste ? (
                un.items.length === 0 ? (
                  <p className="mt-1 pl-3 text-[14px] text-neutral-600 dark:text-gray-400">
                    Sin ítems facturados cargados para esta unidad.
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-2 border-l-2 border-neutral-200 py-1 pl-3 dark:border-zinc-700">
                    {un.items.map((item) => (
                      <li key={`${item.idArt}`} className="flex min-w-0 items-baseline justify-between gap-3 text-[14px]">
                        <span className="min-w-0 truncate text-neutral-800 dark:text-gray-200">{item.nombre}</span>
                        <span className="shrink-0 text-right tabular-nums text-neutral-700 dark:text-gray-300">{plata(item.centavos, datos.moneda)}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
    </TarjetaTablero>
  )
}

function TopItems({ datos }: { datos: TableroVentas }) {
  if (datos.topItems.length === 0) {
    return (
      <TarjetaTablero titulo="Ítems más facturados">
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">
          {datos.sinDatosDeItems ? 'Sin datos de ítems todavía.' : 'Este mes no hay ítems facturados cargados.'}
        </p>
      </TarjetaTablero>
    )
  }
  const maximo = Math.max(...datos.topItems.map((it) => it.centavos))
  return (
    <TarjetaTablero titulo="Ítems más facturados" subtitulo="Top 8 del mes, todas las unidades.">
      <ul className="grid gap-3">
        {datos.topItems.map((item) => (
          <BarraHorizontal
            key={`${item.idArt}`}
            etiqueta={item.nombre}
            valor={item.centavos}
            maximo={maximo}
            color="#2a78d6"
            texto={plataCorta(item.centavos)}
          />
        ))}
      </ul>
    </TarjetaTablero>
  )
}

function RankingClientes({ datos }: { datos: TableroVentas }) {
  if (datos.clientes.length === 0) {
    return (
      <TarjetaTablero titulo="Clientes">
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">Este mes no hay facturación por cliente.</p>
      </TarjetaTablero>
    )
  }
  const top = datos.clientes.slice(0, 15)
  const maximo = Math.max(...top.map((c) => c.centavos))
  return (
    <TarjetaTablero titulo="Ranking de clientes" subtitulo="Top 15 por facturación total del mes.">
      <ul className="grid gap-3">
        {top.map((cliente, i) => (
          <BarraHorizontal
            key={cliente.vientriId}
            etiqueta={`${i + 1}. ${cliente.nombre}`}
            valor={cliente.centavos}
            maximo={maximo}
            color="#2a78d6"
            texto={plataCorta(cliente.centavos)}
          />
        ))}
      </ul>
    </TarjetaTablero>
  )
}

export function TableroVentasPage() {
  const [mes, setMes] = useState<string | null>(null)
  const [moneda, setMoneda] = useState<MonedaTablero>('ARS')
  const tablero = useQuery({
    queryKey: ['finanzas-ventas-tablero', mes, moneda],
    queryFn: () => fetchTableroVentas({ mes, moneda }),
    staleTime: 5 * 60_000,
  })
  const datos = tablero.data
  const mesVisible = mes ?? datos?.mes ?? ''
  const opcionesMes = mesesRecientes(mesVisible || new Date().toISOString().slice(0, 7), 13)

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-5 px-4 py-6 sm:px-6">
      <header className="min-w-0">
        <Link to="/tableros" className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-neutral-600 hover:text-[var(--color-primary)] dark:text-gray-400">
          ← Tableros
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-gray-100">
          <TrendingUp className="h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden />
          Tablero de Ventas
        </h1>
        <p className="mt-1 text-[13px] text-neutral-600 dark:text-gray-400">
          Facturación real (Vientri), por unidad de negocio, ítem y cliente.
          {datos ? <span className="block">Actualizado el {fechaHora(datos.generadoEn)}.</span> : null}
        </p>
      </header>

      <div className="grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 sm:flex sm:flex-wrap sm:items-end dark:border-zinc-700 dark:bg-zinc-900/60">
        <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
          Mes
          <select value={mesVisible} onChange={(e) => setMes(e.target.value)} className={CLASE_SELECT}>
            {opcionesMes.map((opcion) => (
              <option key={opcion} value={opcion}>
                {mesLargo(opcion)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
          Moneda
          <select value={moneda} onChange={(e) => setMoneda(e.target.value === 'USD' ? 'USD' : 'ARS')} className={CLASE_SELECT}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
      </div>

      {tablero.isPending && <p className="text-body-muted text-[14px]">Cargando el tablero…</p>}
      {tablero.isError && (
        <p role="alert" className="text-[14px] text-red-700 dark:text-red-400">
          {tablero.error instanceof Error ? tablero.error.message : 'No se pudo cargar el tablero.'}
        </p>
      )}

      {datos ? (
        <div className="grid min-w-0 gap-5">
          <Kpis datos={datos} />
          {datos.sinDatosDeItems ? <AvisoSinItems /> : null}
          <Evolucion datos={datos} />
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <PorUnegocio datos={datos} />
            <TopItems datos={datos} />
          </div>
          <RankingClientes datos={datos} />
        </div>
      ) : null}
    </div>
  )
}
