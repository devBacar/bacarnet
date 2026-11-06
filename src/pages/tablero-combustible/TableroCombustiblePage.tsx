import { useQuery } from '@tanstack/react-query'
import { Fuel } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarraHorizontal, EvolucionMensual } from '../../components/tablero-ventas/graficos'
import { TarjetaTablero } from '../../components/tablero-finanzas/TarjetaTablero'
import { fechaHora, mesLargo, plata, textoPct } from '../../components/tablero-finanzas/formatoTablero'
import { fetchTableroCombustible, type TableroCombustible } from '../../services/finanzasCombustibleTableroApi'

const CLASE_SELECT =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] font-normal text-neutral-900 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

function mesesDesde(primerMes: string, hastaMes: string): string[] {
  const salida: string[] = []
  let [anio, mes] = hastaMes.split('-').map(Number)
  while (`${anio}-${String(mes).padStart(2, '0')}` >= primerMes) {
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

function Kpis({ datos, esMesEnCurso }: { datos: TableroCombustible; esMesEnCurso: boolean }) {
  const variacion = datos.variacionPorcentaje
  const notaVariacion = esMesEnCurso
    ? 'mes en curso: todavía puede faltar la factura consolidada'
    : datos.totalMesAnteriorCentavos > 0
      ? variacion == null || variacion === 0
        ? 'igual que el mes anterior'
        : `${variacion > 0 ? '↑' : '↓'} ${textoPct(variacion)} vs. mes anterior`
      : 'sin mes anterior para comparar'
  const interanual = datos.variacionInteranualPorcentaje
  const notaInteranual = esMesEnCurso
    ? 'mes en curso: no es comparable todavía'
    : datos.totalMismoMesAnioAnteriorCentavos > 0
      ? interanual == null || interanual === 0
        ? `igual que ${mesLargo(datos.mesAnioAnterior)}`
        : `${interanual > 0 ? '↑' : '↓'} ${textoPct(interanual)} vs. ${mesLargo(datos.mesAnioAnterior)}`
      : `sin datos de ${mesLargo(datos.mesAnioAnterior)}`
  return (
    <section className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        etiqueta="Gasto total del mes"
        valor={plata(datos.totalCentavos, 'ARS')}
        nota={notaVariacion}
        notaColor={esMesEnCurso ? 'neutral' : variacion == null ? 'neutral' : variacion > 0 ? 'bad' : variacion < 0 ? 'good' : 'neutral'}
      />
      <Kpi
        etiqueta="Vs. mismo mes, año anterior"
        valor={datos.totalMismoMesAnioAnteriorCentavos > 0 ? plata(datos.totalMismoMesAnioAnteriorCentavos, 'ARS') : '—'}
        nota={notaInteranual}
        notaColor={interanual == null ? 'neutral' : interanual > 0 ? 'bad' : 'good'}
      />
      <Kpi etiqueta="Comprobantes del mes" valor={datos.cantidadComprobantes.toLocaleString('es-AR')} />
      <Kpi etiqueta="Promedio por comprobante" valor={plata(datos.ticketPromedioCentavos, 'ARS')} />
    </section>
  )
}

function AvisoMesEnCurso() {
  return (
    <article className="min-w-0 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] leading-snug text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      Estás viendo el mes en curso. Los proveedores de combustible suelen facturar consolidado a fin de
      mes, así que el gasto de acá puede verse mucho más bajo de lo real hasta que cierre el mes
      (no significa que se gastó menos).
    </article>
  )
}

function AvisoSinMovil() {
  return (
    <article className="min-w-0 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] leading-snug text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      Este tablero muestra el gasto total por mes, proveedor y unidad de negocio. Vientri dejó de cargar
      el vale de combustible por móvil a fines de 2024, así que <strong>no hay forma de separar el gasto por móvil</strong> en
      este período. Si se retoma esa carga, se puede sumar el desglose por móvil más adelante.
    </article>
  )
}

function Evolucion({ datos }: { datos: TableroCombustible }) {
  return (
    <TarjetaTablero titulo="Evolución mensual" subtitulo="Gasto total en combustible, últimos meses.">
      <EvolucionMensual datos={datos.tendencia.map((t) => ({ mes: t.mes, totalCentavos: t.centavos }))} moneda="ARS" />
    </TarjetaTablero>
  )
}

function ComparativoAnual({ datos }: { datos: TableroCombustible }) {
  if (datos.comparativoAnual.length < 2) return null
  return (
    <TarjetaTablero titulo="Comparar años" subtitulo="Gasto acumulado hasta el mes elegido, año por año.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[13px]">
          <thead>
            <tr className="text-neutral-600 dark:text-gray-400">
              <th className="py-1.5 pr-3 text-left font-semibold">Año</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Gasto acumulado</th>
              <th className="py-1.5 text-right font-semibold">Meses con datos</th>
            </tr>
          </thead>
          <tbody>
            {[...datos.comparativoAnual].reverse().map((c) => (
              <tr key={c.anio} className="border-t border-neutral-100 dark:border-zinc-800">
                <td className="py-1.5 pr-3 text-neutral-900 dark:text-gray-100">{c.anio}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-900 dark:text-gray-100">{plata(c.centavos, 'ARS')}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-600 dark:text-gray-400">{c.meses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TarjetaTablero>
  )
}

function PorProveedor({ datos }: { datos: TableroCombustible }) {
  const [verTodos, setVerTodos] = useState(false)
  if (datos.porProveedor.length === 0) {
    return (
      <TarjetaTablero titulo="Por proveedor">
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">Este mes no hay compras de combustible cargadas.</p>
      </TarjetaTablero>
    )
  }
  const visibles = verTodos ? datos.porProveedor : datos.porProveedor.slice(0, 10)
  const maximo = Math.max(...datos.porProveedor.map((p) => p.centavos))
  return (
    <TarjetaTablero titulo="Por proveedor" subtitulo={verTodos ? `Los ${datos.porProveedor.length} proveedores del mes.` : 'Top 10 del mes.'}>
      <ul className={`grid gap-3 ${verTodos ? 'max-h-[480px] overflow-y-auto pr-1' : ''}`}>
        {visibles.map((p) => (
          <BarraHorizontal
            key={p.idProveedor ?? 'sin-proveedor'}
            etiqueta={p.nombre}
            valor={p.centavos}
            maximo={maximo}
            color="#2a78d6"
            texto={`${plata(p.centavos, 'ARS')}${p.porcentaje != null ? ` · ${textoPct(p.porcentaje)}` : ''}`}
          />
        ))}
      </ul>
      {datos.porProveedor.length > 10 ? (
        <button
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          className="mt-3 text-[13px] font-medium text-[var(--color-primary)] underline underline-offset-2 hover:no-underline"
        >
          {verTodos ? 'Ver solo el top 10' : `Ver todos los proveedores (${datos.porProveedor.length})`}
        </button>
      ) : null}
    </TarjetaTablero>
  )
}

function PorUnegocio({ datos }: { datos: TableroCombustible }) {
  if (datos.porUnegocio.length === 0) return null
  const maximo = Math.max(...datos.porUnegocio.map((u) => u.centavos))
  return (
    <TarjetaTablero
      titulo="Por unidad de negocio"
      subtitulo="La mayoría de las facturas de combustible no tienen una unidad de negocio asignada en Vientri."
    >
      <ul className="grid gap-3">
        {datos.porUnegocio.map((u) => (
          <BarraHorizontal
            key={u.idUnegocio ?? 'sin-unegocio'}
            etiqueta={u.nombre}
            valor={u.centavos}
            maximo={maximo}
            color="#2a78d6"
            texto={`${plata(u.centavos, 'ARS')}${u.porcentaje != null ? ` · ${textoPct(u.porcentaje)}` : ''}`}
          />
        ))}
      </ul>
    </TarjetaTablero>
  )
}

export function TableroCombustiblePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [mes, setMes] = useState<string | null>(searchParams.get('mes'))

  useEffect(() => {
    const params = new URLSearchParams()
    if (mes) params.set('mes', mes)
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes])

  const tablero = useQuery({
    queryKey: ['finanzas-combustible-tablero', mes],
    queryFn: () => fetchTableroCombustible({ mes }),
    staleTime: 5 * 60_000,
  })
  const datos = tablero.data
  const mesVisible = mes ?? datos?.mes ?? ''
  // Ancla en el mes actual real (no en el elegido): si ancla en el elegido, cada vez que se elige un
  // mes más viejo la ventana entera se corre para atrás y los meses más nuevos desaparecen del menú.
  const mesActual = new Date().toISOString().slice(0, 7)
  const anclaMeses = mesVisible > mesActual ? mesVisible : mesActual
  const opcionesMes = mesesDesde(datos?.primerMesConDatos ?? '2025-01', anclaMeses)
  const esMesEnCurso = mesVisible === mesActual

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-5 px-4 py-6 sm:px-6">
      <header className="min-w-0">
        <Link to="/tableros" className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-neutral-600 hover:text-[var(--color-primary)] dark:text-gray-400">
          ← Tableros
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-gray-100">
          <Fuel className="h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden />
          Tablero de Combustible
        </h1>
        <p className="mt-1 text-[13px] text-neutral-600 dark:text-gray-400">
          Gasto real en combustible (Vientri), por mes, proveedor y unidad de negocio. Desde enero de 2025.
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
      </div>

      {tablero.isPending && <p className="text-body-muted text-[14px]">Cargando el tablero…</p>}
      {tablero.isError && (
        <p role="alert" className="text-[14px] text-red-700 dark:text-red-400">
          {tablero.error instanceof Error ? tablero.error.message : 'No se pudo cargar el tablero.'}
        </p>
      )}

      {datos ? (
        <div className="grid min-w-0 gap-5">
          {esMesEnCurso ? <AvisoMesEnCurso /> : null}
          <AvisoSinMovil />
          <Kpis datos={datos} esMesEnCurso={esMesEnCurso} />
          <Evolucion datos={datos} />
          <ComparativoAnual datos={datos} />
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <PorProveedor datos={datos} />
            <PorUnegocio datos={datos} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
