import { useQuery } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GraficoEntradasSalidas } from '../../components/tablero-finanzas/GraficoEntradasSalidas'
import {
  fechaCorta,
  fechaHora,
  mesLargo,
  plata,
  textoContraMesAnterior,
  textoPct,
  textoVariacion30,
} from '../../components/tablero-finanzas/formatoTablero'
import { TarjetaTablero } from '../../components/tablero-finanzas/TarjetaTablero'
import {
  fetchTableroFinanzas,
  type AlertaTablero,
  type BloqueTablero,
  type MonedaTablero,
  type TableroFinanzas,
} from '../../services/finanzasTableroApi'

const CLASE_SELECT =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] font-normal text-neutral-900 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

function textoAlerta(alerta: AlertaTablero): string {
  switch (alerta.tipo) {
    case 'descubierto':
      return `${alerta.banco} estuvo en descubierto ${alerta.dias === 1 ? '1 día' : `${alerta.dias} días`} en el mes.`
    case 'cheques_rechazados':
      return alerta.cantidad === 1
        ? `Hay 1 cheque rechazado en el mes, por ${plata(alerta.centavos, 'ARS')}.`
        : `Hay ${alerta.cantidad} cheques rechazados en el mes, por ${plata(alerta.centavos, 'ARS')}.`
    case 'costo_bancario':
      return `El costo bancario subió ${textoPct(alerta.porcentaje)} contra el mes anterior.`
    case 'salidas_mayores':
      return 'En el mes salió más plata de la que entró.'
  }
}

function Barra({ porcentaje }: { porcentaje: number | null }) {
  const ancho = Math.max(0, Math.min(100, porcentaje ?? 0))
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-zinc-800">
      <div className="h-full rounded-full bg-[#1f3b63]" style={{ width: `${ancho}%` }} />
    </div>
  )
}

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

function ListaBloque({ bloque, moneda, vacio }: { bloque: BloqueTablero; moneda: MonedaTablero; vacio: string }) {
  if (bloque.cantidad === 0) return <p className="text-[14px] text-neutral-600 dark:text-gray-400">{vacio}</p>
  const visibles = bloque.items.slice(0, 8)
  const resto = bloque.cantidad - visibles.length
  return (
    <div className="grid gap-2">
      <p className="text-[14px] font-medium text-neutral-800 dark:text-gray-200">
        {bloque.cantidad === 1 ? '1' : bloque.cantidad} · {plata(bloque.centavos, moneda)}
      </p>
      <ul className="grid gap-2">
        {visibles.map((item, i) => (
          <li key={`${item.fecha}-${item.etiqueta}-${i}`} className="flex min-w-0 items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0">
              <span className="block truncate text-neutral-800 dark:text-gray-200">{item.etiqueta}</span>
              <span className="text-[12px] text-neutral-500 dark:text-gray-400">{fechaCorta(item.fecha)}</span>
            </span>
            <span className="shrink-0 tabular-nums text-neutral-900 dark:text-gray-100">{plata(item.centavos, moneda)}</span>
          </li>
        ))}
      </ul>
      {resto > 0 ? <p className="text-[13px] text-neutral-500 dark:text-gray-400">y {resto} más</p> : null}
    </div>
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
        <TarjetaNumero titulo="Entró en el mes" valor={plata(resumen.entradasCentavos, moneda)} nota="Cobros y otras entradas." />
        <TarjetaNumero titulo="Salió en el mes" valor={plata(resumen.salidasCentavos, moneda)} nota="Pagos, impuestos y gastos." />
        <TarjetaNumero titulo="Costo bancario" valor={plata(resumen.costoBancarioCentavos, moneda)} nota={notaCosto} />
      </div>
    </section>
  )
}

function SalidasPorGrupo({ datos }: { datos: TableroFinanzas }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  return (
    <TarjetaTablero titulo="En qué se fue la plata" subtitulo="Agrupado por tipo de gasto. Tocá un grupo para ver el detalle.">
      {datos.salidasPorGrupo.length === 0 ? (
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">Este mes no hubo salidas.</p>
      ) : (
        <ul className="grid gap-2">
          {datos.salidasPorGrupo.map((grupo) => {
            const abiertoEste = abierto === grupo.grupo
            return (
              <li key={grupo.grupo} className="min-w-0">
                <button
                  type="button"
                  aria-expanded={abiertoEste}
                  onClick={() => setAbierto(abiertoEste ? null : grupo.grupo)}
                  className="grid w-full min-w-0 gap-1.5 rounded-lg px-1 py-1.5 text-left hover:bg-neutral-50 dark:hover:bg-zinc-800"
                >
                  <span className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-medium text-neutral-900 dark:text-gray-100">{grupo.grupo}</span>
                    <span className="shrink-0 text-[14px] tabular-nums text-neutral-800 dark:text-gray-200">
                      {plata(grupo.centavos, datos.moneda)}
                      {grupo.porcentaje != null ? <span className="text-neutral-500"> · {textoPct(grupo.porcentaje)}</span> : null}
                    </span>
                  </span>
                  <Barra porcentaje={grupo.porcentaje} />
                </button>
                {abiertoEste ? (
                  <ul className="mt-1 grid gap-2 border-l-2 border-neutral-200 py-1 pl-3 dark:border-zinc-700">
                    {grupo.categorias.map((categoria) => (
                      <li key={categoria.nombre} className="min-w-0">
                        <span className="flex min-w-0 items-baseline justify-between gap-3 text-[14px]">
                          <span className="min-w-0 truncate text-neutral-800 dark:text-gray-200">{categoria.nombre}</span>
                          <span className="shrink-0 tabular-nums text-neutral-700 dark:text-gray-300">
                            {plata(categoria.centavos, datos.moneda)}
                            {categoria.porcentaje != null ? ` · ${textoPct(categoria.porcentaje)}` : ''}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </TarjetaTablero>
  )
}

function CostoPorBanco({ datos }: { datos: TableroFinanzas }) {
  return (
    <TarjetaTablero
      titulo="Costo bancario por banco"
      subtitulo="Comisiones, mantenimiento de cuenta e impuesto al cheque. El IVA no entra, porque se mezcla con otras percepciones."
    >
      {datos.costoPorBanco.length === 0 ? (
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">Este mes no hubo costo bancario.</p>
      ) : (
        <ul className="grid gap-3">
          {datos.costoPorBanco.map((banco) => (
            <li key={banco.banco} className="grid min-w-0 gap-0.5 border-b border-neutral-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800">
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] font-medium text-neutral-900 dark:text-gray-100">{banco.banco}</span>
                <span className="shrink-0 tabular-nums text-neutral-900 dark:text-gray-100">{plata(banco.centavos, datos.moneda)}</span>
              </div>
              <p className="text-[13px] text-neutral-600 dark:text-gray-400">
                Mes anterior: {plata(banco.mesAnteriorCentavos, datos.moneda)} · {textoContraMesAnterior(banco.variacionPorcentaje, banco.mesAnteriorCentavos)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </TarjetaTablero>
  )
}

function ColumnaContrapartes({
  titulo,
  vacio,
  items,
  moneda,
}: {
  titulo: string
  vacio: string
  items: TableroFinanzas['contrapartes']['entradas']
  moneda: MonedaTablero
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-[14px] font-semibold text-neutral-800 dark:text-gray-200">{titulo}</h3>
      {items.length === 0 ? (
        <p className="text-[14px] text-neutral-600 dark:text-gray-400">{vacio}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item.nombre} className="min-w-0">
              <span className="flex min-w-0 items-baseline justify-between gap-3 text-[14px]">
                <span className="min-w-0 truncate text-neutral-800 dark:text-gray-200">{item.nombre}</span>
                <span className="shrink-0 tabular-nums text-neutral-900 dark:text-gray-100">
                  {plata(item.centavos, moneda)}
                  {item.porcentaje != null ? <span className="text-neutral-500"> · {textoPct(item.porcentaje)}</span> : null}
                </span>
              </span>
              <Barra porcentaje={item.porcentaje} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Contrapartes({ datos }: { datos: TableroFinanzas }) {
  return (
    <TarjetaTablero titulo="Quién nos paga y a quién pagamos" subtitulo="Los cinco que más movieron en el mes. Sin contar sueldos ni lo que no tiene nombre.">
      {datos.contrapartes.concentracionCobros ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          Las 3 primeras concentran el {textoPct(datos.contrapartes.concentracionPorcentaje)} de los cobros.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <ColumnaContrapartes titulo="Nos pagan" vacio="No hubo cobros." items={datos.contrapartes.entradas} moneda={datos.moneda} />
        <ColumnaContrapartes titulo="Les pagamos" vacio="No hubo pagos." items={datos.contrapartes.salidas} moneda={datos.moneda} />
      </div>
      {datos.contrapartes.entradasSinIdentificarPorcentaje || datos.contrapartes.salidasSinIdentificarPorcentaje ? (
        <p className="mt-4 text-[13px] text-neutral-500 dark:text-gray-400">
          Sin nombre: {textoPct(datos.contrapartes.entradasSinIdentificarPorcentaje)} de lo cobrado y{' '}
          {textoPct(datos.contrapartes.salidasSinIdentificarPorcentaje)} de lo pagado. Se completa desde Movimientos.
        </p>
      ) : null}
    </TarjetaTablero>
  )
}

function Proximos({ datos }: { datos: TableroFinanzas }) {
  const { proximos30: p, moneda } = datos
  return (
    <TarjetaTablero
      titulo="Próximos 30 días"
      subtitulo={`Del ${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)}. Depende de lo cargado en la Agenda: si no está ahí, acá no aparece.`}
    >
      {moneda === 'USD' ? (
        <p className="mb-4 text-[14px] text-neutral-600 dark:text-gray-400">Los cheques están en pesos. Acá se ven los compromisos y cobros en dólares.</p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 text-[14px] font-semibold text-neutral-800 dark:text-gray-200">Cheques propios a debitar</h3>
          <ListaBloque bloque={p.chequesADebitar} moneda="ARS" vacio="No hay cheques propios por debitar." />
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-[14px] font-semibold text-neutral-800 dark:text-gray-200">Cheques de terceros a cobrar</h3>
          <ListaBloque bloque={p.chequesACobrar} moneda="ARS" vacio="No hay cheques en cartera por cobrar." />
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-[14px] font-semibold text-neutral-800 dark:text-gray-200">Compromisos de la Agenda</h3>
          <ListaBloque bloque={p.compromisos} moneda={moneda} vacio="No hay compromisos pendientes en estos días." />
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-[14px] font-semibold text-neutral-800 dark:text-gray-200">Cobros de la Agenda</h3>
          <ListaBloque bloque={p.cobros} moneda={moneda} vacio="No hay cobros esperados en estos días." />
        </div>
      </div>
      <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-[15px] text-neutral-800 dark:bg-zinc-800 dark:text-gray-100">
        Saldo estimado: <strong className="tabular-nums">{plata(p.saldoEstimadoCentavos, moneda)}</strong>
        <span className="mt-0.5 block text-[13px] font-normal text-neutral-600 dark:text-gray-400">
          Saldo de hoy + lo que entra (cheques a cobrar y cobros) − lo que sale (cheques a debitar y compromisos).
        </span>
      </p>
    </TarjetaTablero>
  )
}

function Alertas({ datos }: { datos: TableroFinanzas }) {
  return (
    <TarjetaTablero titulo="Para mirar" subtitulo="Avisos simples de este mes, para no pasarlos por alto.">
      {datos.alertas.length === 0 ? (
        <p className="text-[14px] text-neutral-700 dark:text-gray-300">Nada para marcar en este mes.</p>
      ) : (
        <ul className="grid gap-2">
          {datos.alertas.map((alerta) => (
            <li key={alerta.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {textoAlerta(alerta)}
            </li>
          ))}
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
          <select
            value={mesVisible}
            onChange={(e) => setMes(e.target.value)}
            disabled={!datos}
            className={CLASE_SELECT}
          >
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
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value === 'USD' ? 'USD' : 'ARS')}
              className={CLASE_SELECT}
            >
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
            subtitulo="No cuenta la plata que solo pasó de una cuenta nuestra a otra."
          >
            <GraficoEntradasSalidas meses={datos.porMes} moneda={datos.moneda} />
          </TarjetaTablero>
          <SalidasPorGrupo key={`${datos.mes}-${datos.moneda}`} datos={datos} />
          <CostoPorBanco datos={datos} />
          <Contrapartes datos={datos} />
          <Proximos datos={datos} />
          <Alertas datos={datos} />
        </div>
      ) : null}
    </div>
  )
}
