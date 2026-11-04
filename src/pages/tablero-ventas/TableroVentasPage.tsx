import { useQuery } from '@tanstack/react-query'
import { Download, Search, TrendingUp, UserMinus, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarraHorizontal, EvolucionMensual, MixMensualPorUnegocio, colorCalor, colorUnegocio, estadoVariacion } from '../../components/tablero-ventas/graficos'
import { TarjetaTablero } from '../../components/tablero-finanzas/TarjetaTablero'
import { fechaHora, mesLargo, plata, plataCorta, textoPct } from '../../components/tablero-finanzas/formatoTablero'
import {
  fetchHistorialCliente,
  fetchTableroVentas,
  type ClienteVentaTablero,
  type ItemVentaTablero,
  type MonedaTablero,
  type TableroVentas,
} from '../../services/finanzasVentasTableroApi'

const CLASE_SELECT =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] font-normal text-neutral-900 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'
const CLASE_INPUT =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white py-1.5 pl-8 pr-2.5 text-[14px] font-normal text-neutral-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

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

function MixMensual({ datos }: { datos: TableroVentas }) {
  return (
    <TarjetaTablero titulo="Mix mensual por unidad de negocio" subtitulo="Composición de la facturación, últimos 6 meses.">
      <MixMensualPorUnegocio datos={datos.tendenciaPorUnegocio} />
    </TarjetaTablero>
  )
}

function PorUnegocio({ datos, unegocioSel, onQuitarFiltro }: { datos: TableroVentas; unegocioSel: string; onQuitarFiltro: () => void }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const filtrando = unegocioSel !== TODAS
  const lista = filtrando ? datos.porUnegocio.filter((u) => claveUnegocio(u.idUnegocio) === unegocioSel) : datos.porUnegocio
  if (datos.porUnegocio.length === 0) {
    return (
      <TarjetaTablero titulo="Por unidad de negocio">
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">Este mes no hay comprobantes de venta cargados.</p>
      </TarjetaTablero>
    )
  }
  const maximo = Math.max(...datos.porUnegocio.map((u) => u.centavos))
  return (
    <TarjetaTablero
      titulo="Por unidad de negocio"
      subtitulo={
        filtrando ? (
          <span className="inline-flex items-center gap-2">
            Mostrando solo esta unidad.
            <button type="button" onClick={onQuitarFiltro} className="underline hover:no-underline">
              Ver las 6
            </button>
          </span>
        ) : (
          'Las 6 unidades de Vientri, separadas. Tocá una para ver sus ítems facturados.'
        )
      }
    >
      <ul className="grid gap-3">
        {lista.map((un, i) => {
          const clave = claveUnegocio(un.idUnegocio)
          const abiertoEste = filtrando || abierto === clave
          const color = colorUnegocio(un.idUnegocio, i)
          const estado = estadoVariacion(un.variacionPorcentaje)
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
                  <span className="inline-flex h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: estado.color }} aria-hidden />
                  <span className="text-neutral-600 dark:text-gray-400">
                    {estado.etiqueta}
                    {un.variacionPorcentaje != null ? ` ${textoPct(un.variacionPorcentaje)} vs. mes anterior` : ' · sin mes anterior para comparar'}
                  </span>
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

function DetalleCliente({
  cliente,
  mes,
  moneda,
  onCerrar,
}: {
  cliente: { vientriId: number; nombre: string }
  mes: string
  moneda: MonedaTablero
  onCerrar: () => void
}) {
  const historial = useQuery({
    queryKey: ['finanzas-ventas-cliente-historial', cliente.vientriId, mes, moneda],
    queryFn: () => fetchHistorialCliente({ vientriId: cliente.vientriId, mes, moneda }),
    staleTime: 5 * 60_000,
  })
  return (
    <TarjetaTablero
      titulo={
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate">{cliente.nombre}</span>
          <button type="button" onClick={onCerrar} className="shrink-0 rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Cerrar">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
      }
      subtitulo="Facturación mensual de este cliente, últimos 6 meses."
    >
      {historial.isPending ? (
        <p className="text-[14px] text-neutral-600 dark:text-gray-400">Cargando…</p>
      ) : historial.isError ? (
        <p className="text-[14px] text-red-700 dark:text-red-400">No se pudo cargar el historial.</p>
      ) : (
        <EvolucionMensual datos={historial.data!.tendencia} moneda={moneda} />
      )}
    </TarjetaTablero>
  )
}

function RankingClientes({
  clientes,
  busqueda,
  onBusquedaChange,
  onSeleccionar,
}: {
  clientes: Array<{ vientriId: number; nombre: string; centavos: number }>
  busqueda: string
  onBusquedaChange: (v: string) => void
  onSeleccionar: (c: { vientriId: number; nombre: string }) => void
}) {
  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (!termino) return clientes
    return clientes.filter((c) => c.nombre.toLowerCase().includes(termino))
  }, [clientes, busqueda])
  const top = filtrados.slice(0, busqueda.trim() ? 50 : 15)
  const maximo = Math.max(1, ...top.map((c) => c.centavos))
  return (
    <TarjetaTablero titulo="Ranking de clientes" subtitulo={busqueda.trim() ? `${filtrados.length} resultado(s). Tocá uno para ver su historial.` : 'Top 15 por facturación total del mes. Tocá uno para ver su historial.'}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBusquedaChange(e.target.value)}
          placeholder="Buscar cliente…"
          className={CLASE_INPUT}
        />
      </div>
      {top.length === 0 ? (
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">
          {busqueda.trim() ? 'Ningún cliente coincide con la búsqueda.' : 'No hay facturación por cliente para este filtro.'}
        </p>
      ) : (
        <ul className="grid gap-3">
          {top.map((cliente, i) => (
            <BarraHorizontal
              key={cliente.vientriId}
              etiqueta={busqueda.trim() ? cliente.nombre : `${i + 1}. ${cliente.nombre}`}
              valor={cliente.centavos}
              maximo={maximo}
              color="#2a78d6"
              texto={plataCorta(cliente.centavos)}
              onClick={() => onSeleccionar({ vientriId: cliente.vientriId, nombre: cliente.nombre })}
            />
          ))}
        </ul>
      )}
    </TarjetaTablero>
  )
}

function MapaCalorClientes({ datos }: { datos: TableroVentas }) {
  const columnas = datos.porUnegocio
  const filas = datos.clientes.slice(0, 10)
  if (columnas.length === 0 || filas.length === 0) return null
  const maximo = Math.max(1, ...filas.flatMap((c) => c.porUnegocio.map((pu) => pu.centavos)))
  return (
    <TarjetaTablero titulo="Cliente × unidad de negocio" subtitulo="Top 10 clientes del mes, qué le compran a cada unidad.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-2 py-1.5 text-left font-semibold text-neutral-600 dark:bg-zinc-900 dark:text-gray-400">Cliente</th>
              {columnas.map((col) => (
                <th key={claveUnegocio(col.idUnegocio)} className="px-2 py-1.5 text-right font-semibold text-neutral-600 dark:text-gray-400">
                  {col.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((cliente) => (
              <tr key={cliente.vientriId} className="border-t border-neutral-100 dark:border-zinc-800">
                <td className="sticky left-0 max-w-[180px] truncate bg-white px-2 py-1.5 text-neutral-800 dark:bg-zinc-900 dark:text-gray-200" title={cliente.nombre}>
                  {cliente.nombre}
                </td>
                {columnas.map((col) => {
                  const valor = cliente.porUnegocio.find((pu) => claveUnegocio(pu.idUnegocio) === claveUnegocio(col.idUnegocio))?.centavos ?? 0
                  return (
                    <td
                      key={claveUnegocio(col.idUnegocio)}
                      className="px-2 py-1.5 text-right tabular-nums text-neutral-900 dark:text-gray-100"
                      style={{ backgroundColor: valor > 0 ? colorCalor(valor, maximo) : undefined }}
                    >
                      {valor > 0 ? plataCorta(valor) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function FilaComparacion({ etiqueta, a, b, moneda }: { etiqueta: string; a: number; b: number; moneda: MonedaTablero }) {
  const variacion = b > 0 ? ((a - b) / b) * 100 : null
  return (
    <tr className="border-t border-neutral-100 dark:border-zinc-800">
      <td className="py-1.5 pr-3 text-neutral-600 dark:text-gray-400">{etiqueta}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-900 dark:text-gray-100">{plata(b, moneda)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-900 dark:text-gray-100">{plata(a, moneda)}</td>
      <td className={`py-1.5 text-right tabular-nums ${variacion == null ? 'text-neutral-400 dark:text-gray-500' : variacion >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
        {variacion == null ? '—' : `${variacion >= 0 ? '+' : ''}${textoPct(variacion)}`}
      </td>
    </tr>
  )
}

function ComparacionMeses({ datosA, datosB, moneda }: { datosA: TableroVentas; datosB: TableroVentas; moneda: MonedaTablero }) {
  const unidadesIds = useMemo(() => {
    const ids = new Set<string>()
    for (const u of datosA.porUnegocio) ids.add(claveUnegocio(u.idUnegocio))
    for (const u of datosB.porUnegocio) ids.add(claveUnegocio(u.idUnegocio))
    return [...ids]
  }, [datosA, datosB])
  const nombrePor = (clave: string): string =>
    datosB.porUnegocio.find((u) => claveUnegocio(u.idUnegocio) === clave)?.nombre ?? datosA.porUnegocio.find((u) => claveUnegocio(u.idUnegocio) === clave)?.nombre ?? clave
  const centavosPor = (lista: TableroVentas, clave: string): number => lista.porUnegocio.find((u) => claveUnegocio(u.idUnegocio) === clave)?.centavos ?? 0
  return (
    <TarjetaTablero titulo="Comparar meses" subtitulo={`${mesLargo(datosB.mes)} vs. ${mesLargo(datosA.mes)}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr className="text-neutral-600 dark:text-gray-400">
              <th className="py-1.5 pr-3 text-left font-semibold"> </th>
              <th className="py-1.5 pr-3 text-right font-semibold">{mesLargo(datosB.mes)}</th>
              <th className="py-1.5 pr-3 text-right font-semibold">{mesLargo(datosA.mes)}</th>
              <th className="py-1.5 text-right font-semibold">Variación</th>
            </tr>
          </thead>
          <tbody>
            <FilaComparacion etiqueta="Ventas totales" a={datosA.totalCentavos} b={datosB.totalCentavos} moneda={moneda} />
            <FilaComparacion etiqueta="Ticket promedio" a={datosA.ticketPromedioCentavos} b={datosB.ticketPromedioCentavos} moneda={moneda} />
            {unidadesIds.map((clave) => (
              <FilaComparacion key={clave} etiqueta={nombrePor(clave)} a={centavosPor(datosA, clave)} b={centavosPor(datosB, clave)} moneda={moneda} />
            ))}
          </tbody>
        </table>
      </div>
    </TarjetaTablero>
  )
}

export function TableroVentasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [mes, setMes] = useState<string | null>(searchParams.get('mes'))
  const [moneda, setMoneda] = useState<MonedaTablero>(searchParams.get('moneda') === 'USD' ? 'USD' : 'ARS')
  const [unegocioSel, setUnegocioSel] = useState<string>(searchParams.get('unidad') ?? TODAS)
  const [mesComparar, setMesComparar] = useState<string | null>(searchParams.get('comparar'))
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clienteSel, setClienteSel] = useState<{ vientriId: number; nombre: string } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (mes) params.set('mes', mes)
    if (moneda !== 'ARS') params.set('moneda', moneda)
    if (unegocioSel !== TODAS) params.set('unidad', unegocioSel)
    if (mesComparar) params.set('comparar', mesComparar)
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, moneda, unegocioSel, mesComparar])

  const tablero = useQuery({
    queryKey: ['finanzas-ventas-tablero', mes, moneda],
    queryFn: () => fetchTableroVentas({ mes, moneda }),
    staleTime: 5 * 60_000,
  })
  const datos = tablero.data
  const mesVisible = mes ?? datos?.mes ?? ''
  const opcionesMes = mesesRecientes(mesVisible || new Date().toISOString().slice(0, 7), 13)

  const tableroComparar = useQuery({
    queryKey: ['finanzas-ventas-tablero', mesComparar, moneda],
    queryFn: () => fetchTableroVentas({ mes: mesComparar, moneda }),
    enabled: Boolean(mesComparar),
    staleTime: 5 * 60_000,
  })

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
        <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
          Comparar con
          <select value={mesComparar ?? ''} onChange={(e) => setMesComparar(e.target.value || null)} className={CLASE_SELECT}>
            <option value="">(ninguno)</option>
            {opcionesMes
              .filter((m) => m !== mesVisible)
              .map((opcion) => (
                <option key={opcion} value={opcion}>
                  {mesLargo(opcion)}
                </option>
              ))}
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
          <MixMensual datos={datos} />
          {mesComparar && tableroComparar.data ? <ComparacionMeses datosA={datos} datosB={tableroComparar.data} moneda={moneda} /> : null}
          <ClientesNuevosPerdidos datos={datos} />
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <PorUnegocio datos={datos} unegocioSel={unegocioSel} onQuitarFiltro={() => setUnegocioSel(TODAS)} />
            <TopItems items={itemsVisibles} sinDatosDeItems={datos.sinDatosDeItems} />
          </div>
          <MapaCalorClientes datos={datos} />
          <RankingClientes clientes={clientesVisibles} busqueda={busquedaCliente} onBusquedaChange={setBusquedaCliente} onSeleccionar={setClienteSel} />
          {clienteSel ? <DetalleCliente cliente={clienteSel} mes={datos.mes} moneda={datos.moneda} onCerrar={() => setClienteSel(null)} /> : null}
        </div>
      ) : null}
    </div>
  )
}
