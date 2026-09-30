import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { finanzasInputClass } from '../../components/finanzas/FinanzasFormField'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { useAuth } from '../../context'
import { fetchFinanzasCuentas, type FinanzasCuenta } from '../../services/finanzasApi'
import {
  descargarExtractoExcel,
  fetchExtracto,
  nombreArchivoExtracto,
  type ExtractoConsulta,
  type ExtractoPedido,
  type ExtractoControlDia,
  type ExtractoControlItem,
} from '../../services/finanzasExtractosApi'

const PAGE_SIZE = 50
const LISTA_CORTA = 8

type ModoPeriodo = 'mes-pasado' | 'este-mes' | 'fechas'

function isoArgentina(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function rangoMesPasado(hoy: string): { desde: string; hasta: string } {
  const [year, month] = hoy.split('-').map((part) => Number(part))
  const ultimo = new Date(Date.UTC(year, month - 1, 1))
  ultimo.setUTCDate(0)
  const y = ultimo.getUTCFullYear()
  const m = String(ultimo.getUTCMonth() + 1).padStart(2, '0')
  const d = String(ultimo.getUTCDate()).padStart(2, '0')
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${d}` }
}

function rangoEsteMes(hoy: string): { desde: string; hasta: string } {
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy }
}

function formatFecha(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function etiquetaCuenta(cuenta: FinanzasCuenta): string {
  const tipo = cuenta.tipo === 'CC' ? 'Cuenta corriente' : cuenta.tipoLabel
  return `Banco ${cuenta.bancoNombre} · ${tipo}`
}

function textoMovimiento(item: ExtractoControlItem): string {
  const verbo = item.tipo === 'debito' ? 'salió' : 'entró'
  return `${formatFecha(item.fecha)} · ${item.concepto} · ${verbo} ${formatMoneyCentavos(item.montoCentavos, 'ARS')}`
}

function textoDia(dia: ExtractoControlDia): string {
  return `${formatFecha(dia.fecha)}: el banco dice que salió ${formatMoneyCentavos(dia.debitosExtractoCentavos, 'ARS')} y entró ${formatMoneyCentavos(dia.creditosExtractoCentavos, 'ARS')}. BacarNet tiene salidas ${formatMoneyCentavos(dia.debitosBacarnetCentavos, 'ARS')} y entradas ${formatMoneyCentavos(dia.creditosBacarnetCentavos, 'ARS')}.`
}

function ListaCorta({ titulo, lineas }: { titulo: string; lineas: string[] }) {
  const visibles = lineas.slice(0, LISTA_CORTA)
  const resto = lineas.length - visibles.length
  return (
    <div className="mt-3">
      <p className="font-medium">{titulo}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {visibles.map((linea, indice) => (
          <li key={`${indice}-${linea}`}>{linea}</li>
        ))}
      </ul>
      {resto > 0 ? <p className="mt-1">Y {resto} más, en la hoja Control del Excel.</p> : null}
    </div>
  )
}

function ControlExtracto({ consulta, buscando }: { consulta: ExtractoConsulta | undefined; buscando: boolean }) {
  if (!consulta) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        {buscando
          ? 'Estamos bajando el extracto del banco…'
          : 'Cuando veas el extracto en pantalla, acá te decimos si BacarNet tiene los mismos movimientos que el banco.'}
      </div>
    )
  }

  if (consulta.control.coincide) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
        Está todo: BacarNet tiene los mismos movimientos que el extracto del banco.
      </div>
    )
  }

  const dias = consulta.control.porDia.filter((dia) => !dia.coincide)
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
      <p className="font-semibold">El extracto del banco y BacarNet no coinciden.</p>
      {consulta.control.faltanEnBacarnet.length > 0 ? (
        <ListaCorta
          titulo={`En el extracto del banco hay ${consulta.control.faltanEnBacarnet.length.toLocaleString('es-AR')} movimientos que no están en BacarNet.`}
          lineas={consulta.control.faltanEnBacarnet.map(textoMovimiento)}
        />
      ) : null}
      {consulta.control.sobranEnBacarnet.length > 0 ? (
        <ListaCorta
          titulo={`En BacarNet hay ${consulta.control.sobranEnBacarnet.length.toLocaleString('es-AR')} movimientos que no están en el extracto del banco.`}
          lineas={consulta.control.sobranEnBacarnet.map(textoMovimiento)}
        />
      ) : null}
      {dias.length > 0 ? (
        <ListaCorta
          titulo={`En ${dias.length.toLocaleString('es-AR')} días, lo que sumó el banco no es lo mismo que lo que tiene BacarNet.`}
          lineas={dias.map(textoDia)}
        />
      ) : null}
    </div>
  )
}

export function FinanzasExtractosPage() {
  const { user } = useAuth()
  const hoy = isoArgentina(new Date())
  const inicial = rangoMesPasado(hoy)
  const [modo, setModo] = useState<ModoPeriodo>('mes-pasado')
  const [cuentaId, setCuentaId] = useState('')
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [pedido, setPedido] = useState<(ExtractoPedido & { n: number }) | null>(null)
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const { data: cuentasData } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: Boolean(user),
  })
  const cuentas = (cuentasData?.cuentas ?? []).filter(
    (cuenta) => cuenta.origenSaldo === 'interbanking' && cuenta.moneda === 'ARS' && cuenta.tipo === 'CC',
  )
  const cuenta = cuentas.find((item) => item.id === cuentaId) ?? null

  useEffect(() => {
    if (cuentaId || !cuentasData) return
    const primera = cuentasData.cuentas.find(
      (item) => item.origenSaldo === 'interbanking' && item.moneda === 'ARS' && item.tipo === 'CC',
    )
    if (primera) setCuentaId(primera.id)
  }, [cuentaId, cuentasData])

  const vista = useQuery({
    queryKey: ['finanzas', 'extractos', pedido],
    queryFn: () => {
      if (!pedido) throw new Error('Falta el período')
      return fetchExtracto(pedido)
    },
    enabled: Boolean(user && pedido),
  })

  useEffect(() => {
    setPage(1)
  }, [pedido])

  const periodoInvalido = !desde || !hasta || desde > hasta
  const ocupado = bajando || vista.isFetching
  const puedePedir = Boolean(cuenta && !periodoInvalido && !ocupado)

  function elegirModo(next: ModoPeriodo) {
    setModo(next)
    if (next === 'mes-pasado') {
      const rango = rangoMesPasado(hoy)
      setDesde(rango.desde)
      setHasta(rango.hasta)
    } else if (next === 'este-mes') {
      const rango = rangoEsteMes(hoy)
      setDesde(rango.desde)
      setHasta(rango.hasta)
    }
  }

  async function bajarExcel() {
    if (!cuenta) return
    setError(null)
    setAviso(null)
    setBajando(true)
    try {
      await descargarExtractoExcel(
        { cuentaId: cuenta.id, desde, hasta },
        nombreArchivoExtracto(cuenta.bancoNombre, cuenta.tipo, desde, hasta),
      )
      setAviso('Se descargó el Excel.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo bajar el Excel')
    } finally {
      setBajando(false)
    }
  }

  function verEnPantalla() {
    if (!cuenta) return
    setError(null)
    setAviso(null)
    setPedido({ cuentaId: cuenta.id, desde, hasta, n: Date.now() })
  }

  const consulta = vista.data
  const filas = consulta?.filas ?? []
  const paginas = Math.max(1, Math.ceil(filas.length / PAGE_SIZE))
  const paginaActual = Math.min(page, paginas)
  const visibles = filas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)
  const errorVista = vista.error instanceof Error ? vista.error.message : null

  const atajoClass = (activo: boolean) =>
    `rounded-xl px-4 py-3 text-base font-semibold ${
      activo
        ? 'btn-primary'
        : 'border border-neutral-300 bg-white text-neutral-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'
    }`

  return (
    <>
      <header className="mb-6">
        <h1 className="text-heading text-2xl font-semibold">Extractos</h1>
        <p className="text-body-muted mt-1 text-sm">
          Bajá el extracto oficial del banco, con la categoría de BacarNet, y fijate si falta algún movimiento.
        </p>
      </header>

      <div className="mb-4 max-w-xl">
        <label className="text-sm">
          <span className="text-body-muted mb-1 block font-medium">Cuenta</span>
          <select
            className={finanzasInputClass}
            value={cuentaId}
            onChange={(event) => setCuentaId(event.target.value)}
          >
            {cuentas.length === 0 ? <option value="">No hay cuentas corrientes del banco</option> : null}
            {cuentas.map((item) => (
              <option key={item.id} value={item.id}>
                {etiquetaCuenta(item)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" className={atajoClass(modo === 'mes-pasado')} aria-pressed={modo === 'mes-pasado'} onClick={() => elegirModo('mes-pasado')}>
          Mes pasado
        </button>
        <button type="button" className={atajoClass(modo === 'este-mes')} aria-pressed={modo === 'este-mes'} onClick={() => elegirModo('este-mes')}>
          Este mes
        </button>
        <button type="button" className={atajoClass(modo === 'fechas')} aria-pressed={modo === 'fechas'} onClick={() => elegirModo('fechas')}>
          Elegir fechas
        </button>
      </div>

      <p className="text-body-muted mb-3 text-sm">
        Del {formatFecha(desde)} al {formatFecha(hasta)}.
      </p>

      {modo === 'fechas' ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-body-muted mb-1 block font-medium">Desde</span>
            <input type="date" className={finanzasInputClass} value={desde} max={hoy} onChange={(event) => setDesde(event.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-body-muted mb-1 block font-medium">Hasta</span>
            <input type="date" className={finanzasInputClass} value={hasta} max={hoy} onChange={(event) => setHasta(event.target.value)} />
          </label>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-primary rounded-xl px-5 py-3 text-base font-semibold disabled:opacity-60" disabled={!puedePedir} onClick={() => void bajarExcel()}>
          {bajando ? 'Bajando…' : 'Bajar Excel'}
        </button>
        <button
          type="button"
          className="rounded-xl border border-neutral-300 bg-white px-5 py-3 text-base font-semibold text-neutral-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
          disabled={!puedePedir}
          onClick={verEnPantalla}
        >
          {vista.isFetching ? 'Buscando…' : 'Ver en pantalla'}
        </button>
      </div>

      {periodoInvalido ? (
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">La fecha desde tiene que ser anterior o igual a la fecha hasta.</p>
      ) : null}
      {error || errorVista ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          {error || errorVista}
        </p>
      ) : null}
      {aviso ? <p className="text-body-muted mb-4 text-sm">{aviso}</p> : null}

      <div className="mb-4">
        <ControlExtracto consulta={consulta} buscando={vista.isFetching} />
      </div>

      {consulta ? (
        <>
          <p className="text-heading mb-3 text-sm font-medium">
            Banco {consulta.cuenta.bancoNombre} · {consulta.cuenta.tipoLabel} · cuenta {consulta.cuenta.numeroCuenta} · del{' '}
            {formatFecha(consulta.desde)} al {formatFecha(consulta.hasta)}
          </p>

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-body-muted text-xs font-medium uppercase tracking-wide">Saldo inicial</p>
              <p className="text-heading mt-1 text-lg font-semibold">{formatMoneyCentavos(consulta.resumen.saldoInicialCentavos, 'ARS')}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Entró</p>
              <p className="mt-1 text-lg font-semibold text-emerald-950 dark:text-emerald-50">{formatMoneyCentavos(consulta.resumen.totalCreditosCentavos, 'ARS')}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
              <p className="text-xs font-medium uppercase tracking-wide text-red-800 dark:text-red-200">Salió</p>
              <p className="mt-1 text-lg font-semibold text-red-950 dark:text-red-50">{formatMoneyCentavos(consulta.resumen.totalDebitosCentavos, 'ARS')}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-body-muted text-xs font-medium uppercase tracking-wide">Saldo final</p>
              <p className="text-heading mt-1 text-lg font-semibold">{formatMoneyCentavos(consulta.resumen.saldoFinalCentavos, 'ARS')}</p>
            </div>
          </div>

          <div className="max-h-[32rem] overflow-auto rounded-xl border border-neutral-200 dark:border-zinc-800">
            <table className="min-w-[40rem] w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="sticky top-0 bg-neutral-50 px-3 py-2 dark:bg-zinc-900">Fecha</th>
                  <th className="sticky top-0 bg-neutral-50 px-3 py-2 dark:bg-zinc-900">Concepto</th>
                  <th className="sticky top-0 bg-neutral-50 px-3 py-2 dark:bg-zinc-900">Categoría</th>
                  <th className="sticky top-0 bg-neutral-50 px-3 py-2 text-right dark:bg-zinc-900">Débito</th>
                  <th className="sticky top-0 bg-neutral-50 px-3 py-2 text-right dark:bg-zinc-900">Crédito</th>
                  <th className="sticky top-0 bg-neutral-50 px-3 py-2 text-right dark:bg-zinc-900">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((fila, indice) => (
                  <tr key={`${fila.fecha}-${indice}-${fila.concepto}-${fila.saldoCentavos}`} className="border-t border-neutral-100 dark:border-zinc-800">
                    <td className="whitespace-nowrap px-3 py-2">{formatFecha(fila.fecha)}</td>
                    <td className="px-3 py-2">{fila.concepto}</td>
                    <td className={`px-3 py-2 ${fila.categoria === 'Sin clasificar' ? 'text-body-muted' : ''}`}>{fila.categoria}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{fila.debitoCentavos ? formatMoneyCentavos(fila.debitoCentavos, 'ARS') : ''}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{fila.creditoCentavos ? formatMoneyCentavos(fila.creditoCentavos, 'ARS') : ''}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{formatMoneyCentavos(fila.saldoCentavos, 'ARS')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filas.length === 0 ? <p className="text-body-muted px-4 py-8 text-center">El banco no tiene movimientos en ese período.</p> : null}
          </div>

          {filas.length > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <button type="button" className="rounded border px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700" disabled={paginaActual <= 1} onClick={() => setPage((actual) => Math.max(1, actual - 1))}>
                Anterior
              </button>
              <span className="text-body-muted">
                Página {paginaActual} de {paginas.toLocaleString('es-AR')}
              </span>
              <button type="button" className="rounded border px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700" disabled={paginaActual >= paginas} onClick={() => setPage((actual) => actual + 1)}>
                Siguiente
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  )
}
