import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Download, TrendingUp, UserMinus, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarraHorizontal, EvolucionMensual, colorUnegocio } from '../../components/tablero-ventas/graficos'
import { TarjetaTablero } from '../../components/tablero-finanzas/TarjetaTablero'
import { fechaHora, mesLargo, plata, plataCorta, textoPct } from '../../components/tablero-finanzas/formatoTablero'
import {
  fetchTableroVentas,
  type ClienteVentaTablero,
  type ItemVentaTablero,
  type MonedaTablero,
  type TableroVentas,
} from '../../services/finanzasVentasTableroApi'

const CLASE_SELECT =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] font-normal text-neutral-900 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

const TODAS = 'todas'

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

function claveUnegocio(idUnegocio: number | null): string {
  return idUnegocio !== null ? String(idUnegocio) : 'sin-unegocio'
}

function csvEscapar(valor: string): string {
  if (/[;"\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

function descargarCsv(nombreArchivo: string, filas: string[][]): void {
  const contenido = filas.map((fila) => fila.map(csvEscapar).join(';')).join('\n')
  const blob = new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}

function exportarTablero(datos: TableroVentas): void {
  const filas: string[][] = [['Tablero de Ventas', mesLargo(datos.mes), datos.moneda]]
  filas.push([])
  filas.push(['Por unidad de negocio'])
  filas.push(['Unidad', 'Total', '% del total', 'Mes anterior', 'Variación %'])
  for (const u of datos.porUnegocio) {
    filas.push([
      u.nombre,
      plata(u.centavos, datos.moneda),
      u.porcentaje != null ? textoPct(u.porcentaje) : '',
      plata(u.centavosMesAnterior, datos.moneda),
      u.variacionPorcentaje != null ? `${u.variacionPorcentaje > 0 ? '+' : ''}${textoPct(u.variacionPorcentaje)}` : '',
    ])
  }
  filas.push([])
  filas.push(['Ítems más facturados'])
  filas.push(['Ítem', 'Total'])
  for (const it of datos.topItems) filas.push([it.nombre, plata(it.centavos, datos.moneda)])
  filas.push([])
  filas.push(['Clientes'])
  filas.push(['Cliente', 'Total'])
  for (const c of datos.clientes) filas.push([c.nombre, plata(c.centavos, datos.moneda)])
  descargarCsv(`ventas-${datos.mes}-${datos.moneda}.csv`, filas)
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
  const interanual = datos.comparativoInteranual
  const notaInteranual =
    interanual.totalCentavos > 0
      ? interanual.variacionPorcentaje == null || interanual.variacionPorcentaje === 0
        ? `igual que ${mesLargo(interanual.mesAnioAnterior)}`
        : `${interanual.variacionPorcentaje > 0 ? '↑' : '↓'} ${textoPct(interanual.variacionPorcentaje)} vs. ${mesLargo(interanual.mesAnioAnterior)}`
      : `sin datos de ${mesLargo(interanual.mesAnioAnterior)}`
  return (
    <section className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        etiqueta="Ventas totales del mes"
        valor={plata(datos.totalCentavos, datos.moneda)}
        nota={notaVariacion}
        notaColor={variacion == null ? 'neutral' : variacion > 0 ? 'good' : variacion < 0 ? 'bad' : 'neutral'}
      />
      <Kpi
        etiqueta="Vs. mismo mes, año anterior"
        valor={interanual.totalCentavos > 0 ? plata(interanual.totalCentavos, datos.moneda) : '—'}
        nota={notaInteranual}
        notaColor={interanual.variacionPorcentaje == null ? 'neutral' : interanual.variacionPorcentaje > 0 ? 'good' : 'bad'}
      />
      <Kpi etiqueta="Comprobantes emitidos" valor={datos.cantidadComprobantes.toLocaleString('es-AR')} />
      <Kpi etiqueta="Ticket promedio" valor={plata(datos.ticketPromedioCentavos, datos.moneda)} />
      <Kpi
        etiqueta="Clientes facturados"
        valor={datos.cantidadClientes.toLocaleString('es-AR')}
        nota={datos.concentracionTop5Porcentaje != null ? `top 5 = ${textoPct(datos.concentracionTop5Porcentaje)} del total` : undefined}
      />
      {datos.proyeccion ? (
        <Kpi
          etiqueta="Proyección a fin de mes"
          valor={plata(datos.proyeccion.totalProyectadoCentavos, datos.moneda)}
          nota={`con ${datos.proyeccion.diasHabilesTranscurridos} de ${datos.proyeccion.diasHabilesTotales} días hábiles`}
          notaColor="neutral"
        />
      ) : null}
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
          const clave = claveUnegocio(un.idUnegocio)
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
                <div className="flex min-w-0 items-center gap-1.5 pl-0.5 text-[12px]">
                  {un.caidaFuerte ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      cayó {textoPct(un.variacionPorcentaje)} vs. mes anterior
                    </span>
                  ) : un.variacionPorcentaje != null ? (
                    <span className={un.variacionPorcentaje >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-500 dark:text-gray-500'}>
                      {un.variacionPorcentaje >= 0 ? '↑' : '↓'} {textoPct(un.variacionPorcentaje)} vs. mes anterior
                    </span>
                  ) : (
                    <span className="text-neutral-400 dark:text-gray-500">sin mes anterior para comparar</span>
                  )}
                </div>
              </button>
              {abiertoEste ? (
                un.items.length === 0 ? (
                  <p className="mt-1 pl-3 text-[14px] text-neutral-600 dark:text-gray-400">
                    Sin ítems facturados cargados para esta unidad.
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-2 border-l-2 border-neutral-200 py-1 pl-3 dark:border-zinc-700">
                    {un.items.slice(0, 10).map((item) => (
                      <BarraHorizontal
                        key={`${item.idArt}`}
                        etiqueta={item.nombre}
                        valor={item.centavos}
                        maximo={un.items[0]?.centavos ?? 1}
                        color={color}
                        texto={plataCorta(item.centavos)}
                      />
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

function TopItems({ items, sinDatosDeItems }: { items: ItemVentaTablero[]; sinDatosDeItems: boolean }) {
  if (items.length === 0) {
    return (
      <TarjetaTablero titulo="Ítems más facturados">
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">
          {sinDatosDeItems ? 'Sin datos de ítems todavía.' : 'No hay ítems facturados para este filtro.'}
        </p>
      </TarjetaTablero>
    )
  }
  const maximo = Math.max(...items.map((it) => it.centavos))
  return (
    <TarjetaTablero titulo="Ítems más facturados" subtitulo="Top 8 del mes.">
      <ul className="grid gap-3">
        {items.slice(0, 8).map((item) => (
          <BarraHorizontal key={`${item.idArt}`} etiqueta={item.nombre} valor={item.centavos} maximo={maximo} color="#2a78d6" texto={plataCorta(item.centavos)} />
        ))}
      </ul>
    </TarjetaTablero>
  )
}

function RankingClientes({ clientes }: { clientes: Array<{ vientriId: number; nombre: string; centavos: number }> }) {
  if (clientes.length === 0) {
    return (
      <TarjetaTablero titulo="Clientes">
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">No hay facturación por cliente para este filtro.</p>
      </TarjetaTablero>
    )
  }
  const top = clientes.slice(0, 15)
  const maximo = Math.max(...top.map((c) => c.centavos))
  return (
    <TarjetaTablero titulo="Ranking de clientes" subtitulo="Top 15 por facturación total del mes.">
      <ul className="grid gap-3">
        {top.map((cliente, i) => (
          <BarraHorizontal key={cliente.vientriId} etiqueta={`${i + 1}. ${cliente.nombre}`} valor={cliente.centavos} maximo={maximo} color="#2a78d6" texto={plataCorta(cliente.centavos)} />
        ))}
      </ul>
    </TarjetaTablero>
  )
}

function ClientesNuevosPerdidos({ datos }: { datos: TableroVentas }) {
  if (datos.clientesNuevos.length === 0 && datos.clientesPerdidos.length === 0) return null
  return (
    <TarjetaTablero titulo="Clientes nuevos y perdidos" subtitulo="Comparado contra el mes anterior.">
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
            <UserPlus className="h-4 w-4" aria-hidden /> Altas ({datos.clientesNuevos.length})
          </h3>
          {datos.clientesNuevos.length === 0 ? (
            <p className="text-[13px] text-neutral-500 dark:text-gray-500">Sin clientes nuevos este mes.</p>
          ) : (
            <ul className="grid gap-1.5">
              {datos.clientesNuevos.map((c) => (
                <li key={c.vientriId} className="flex min-w-0 items-baseline justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate text-neutral-800 dark:text-gray-200">{c.nombre}</span>
                  <span className="shrink-0 tabular-nums text-neutral-700 dark:text-gray-300">{plataCorta(c.centavos)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-red-700 dark:text-red-400">
            <UserMinus className="h-4 w-4" aria-hidden /> Bajas ({datos.clientesPerdidos.length})
          </h3>
          {datos.clientesPerdidos.length === 0 ? (
            <p className="text-[13px] text-neutral-500 dark:text-gray-500">Nadie dejó de facturar este mes.</p>
          ) : (
            <ul className="grid gap-1.5">
              {datos.clientesPerdidos.map((c) => (
                <li key={c.vientriId} className="flex min-w-0 items-baseline justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate text-neutral-800 dark:text-gray-200">{c.nombre}</span>
                  <span className="shrink-0 tabular-nums text-neutral-500 dark:text-gray-500">facturaba {plataCorta(c.centavosMesAnterior)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </TarjetaTablero>
  )
}

export function TableroVentasPage() {
  const [mes, setMes] = useState<string | null>(null)
  const [moneda, setMoneda] = useState<MonedaTablero>('ARS')
  const [unegocioSel, setUnegocioSel] = useState<string>(TODAS)
  const tablero = useQuery({
    queryKey: ['finanzas-ventas-tablero', mes, moneda],
    queryFn: () => fetchTableroVentas({ mes, moneda }),
    staleTime: 5 * 60_000,
  })
  const datos = tablero.data
  const mesVisible = mes ?? datos?.mes ?? ''
  const opcionesMes = mesesRecientes(mesVisible || new Date().toISOString().slice(0, 7), 13)

  const unidadFiltrada = useMemo(() => {
    if (!datos || unegocioSel === TODAS) return null
    return datos.porUnegocio.find((u) => claveUnegocio(u.idUnegocio) === unegocioSel) ?? null
  }, [datos, unegocioSel])

  const itemsVisibles: ItemVentaTablero[] = unidadFiltrada ? unidadFiltrada.items : datos?.topItems ?? []

  const clientesVisibles: ClienteVentaTablero[] = useMemo(() => {
    if (!datos) return []
    if (unegocioSel === TODAS) return datos.clientes
    return datos.clientes
      .map((c) => ({ ...c, centavos: c.porUnegocio.find((pu) => claveUnegocio(pu.idUnegocio) === unegocioSel)?.centavos ?? 0 }))
      .filter((c) => c.centavos > 0)
      .sort((a, b) => b.centavos - a.centavos)
  }, [datos, unegocioSel])

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-5 px-4 py-6 sm:px-6">
      <header className="min-w-0">
        <Link to="/tableros" className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-neutral-600 hover:text-[var(--color-primary)] dark:text-gray-400">
          ← Tableros
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-gray-100">
              <TrendingUp className="h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden />
              Tablero de Ventas
            </h1>
            <p className="mt-1 text-[13px] text-neutral-600 dark:text-gray-400">
              Facturación real (Vientri), por unidad de negocio, ítem y cliente.
              {datos ? <span className="block">Actualizado el {fechaHora(datos.generadoEn)}.</span> : null}
            </p>
          </div>
          {datos ? (
            <button
              type="button"
              onClick={() => exportarTablero(datos)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-200 dark:hover:bg-zinc-800"
            >
              <Download className="h-4 w-4" aria-hidden />
              Exportar CSV
            </button>
          ) : null}
        </div>
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
        {datos && datos.porUnegocio.length > 0 ? (
          <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
            Unidad de negocio
            <select value={unegocioSel} onChange={(e) => setUnegocioSel(e.target.value)} className={CLASE_SELECT}>
              <option value={TODAS}>Todas</option>
              {datos.porUnegocio.map((u) => (
                <option key={claveUnegocio(u.idUnegocio)} value={claveUnegocio(u.idUnegocio)}>
                  {u.nombre}
                </option>
              ))}
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
          <Kpis datos={datos} />
          {datos.sinDatosDeItems ? <AvisoSinItems /> : null}
          <Evolucion datos={datos} />
          <ClientesNuevosPerdidos datos={datos} />
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <PorUnegocio datos={datos} />
            <TopItems items={itemsVisibles} sinDatosDeItems={datos.sinDatosDeItems} />
          </div>
          <RankingClientes clientes={clientesVisibles} />
        </div>
      ) : null}
    </div>
  )
}
