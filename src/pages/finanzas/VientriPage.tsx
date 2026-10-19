import { useQuery } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { BotonTraerVientri } from '../../components/finanzas/BotonTraerVientri'
import { FranjaVientri } from '../../components/finanzas/FranjaVientri'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import {
  ESTADO_CHEQUE_VIENTRI_LABELS,
  fetchChequesVientri,
  fetchEstadoVientri,
  fetchPendientesVientri,
  type EstadoChequeVientri,
  type VientriCheque,
  type VientriPendiente,
} from '../../services/finanzasVientriApi'

type Pestana = 'recibidos' | 'emitidos' | 'pagar' | 'cobrar' | 'revisar'

const PESTANAS: Array<{ id: Pestana; label: string }> = [
  { id: 'recibidos', label: 'Cheques recibidos' },
  { id: 'emitidos', label: 'Cheques emitidos' },
  { id: 'pagar', label: 'A pagar' },
  { id: 'cobrar', label: 'A cobrar' },
  { id: 'revisar', label: 'Sin clasificar' },
]

const FILTROS_RECIBIDOS: Array<EstadoChequeVientri | ''> = ['en_cartera', 'depositado', 'vendido', 'entregado', 'rechazado', '']
const FILTROS_EMITIDOS: Array<EstadoChequeVientri | ''> = ['pendiente_debito', 'debitado', 'en_cartera', 'rechazado', 'anulado', '']

const pesos = (c: number) => formatMoneyCentavos(c, 'ARS')

function fecha(f: string | null): string {
  if (!f) return '—'
  const [a, m, d] = f.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

function botonClase(activo: boolean) {
  return `rounded-full border-2 px-4 py-1.5 text-base ${
    activo
      ? 'border-blue-600 bg-blue-50 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100'
      : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100'
  }`
}

export function FinanzasVientriPage() {
  const [pestana, setPestana] = useState<Pestana>('recibidos')
  const [estado, setEstado] = useState<EstadoChequeVientri | ''>('en_cartera')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const estadoQ = useQuery({ queryKey: ['finanzas', 'vientri', 'estado'], queryFn: fetchEstadoVientri })

  const esCheques = pestana === 'recibidos' || pestana === 'emitidos'
  const chequesQ = useQuery({
    queryKey: ['finanzas', 'vientri', 'cheques', pestana, estado, q, page],
    queryFn: () =>
      fetchChequesVientri({ direccion: pestana === 'emitidos' ? 'emitido' : 'recibido', estado: estado || undefined, q, page }),
    enabled: esCheques,
  })
  const pendientesQ = useQuery({
    queryKey: ['finanzas', 'vientri', 'pendientes', pestana, q, page],
    queryFn: () => fetchPendientesVientri({ lado: pestana as 'pagar' | 'cobrar' | 'revisar', q, page }),
    enabled: !esCheques,
  })
  const datos = esCheques ? chequesQ : pendientesQ

  function cambiarPestana(p: Pestana) {
    setPestana(p)
    setPage(1)
    setEstado(p === 'emitidos' ? 'pendiente_debito' : p === 'recibidos' ? 'en_cartera' : '')
  }

  return (
    <div className="text-base">
      <FranjaVientri estado={estadoQ.data} cargando={estadoQ.isLoading} />
      <BotonTraerVientri />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => cambiarPestana(p.id)}
            className={`rounded-lg border-2 px-5 py-2 text-base ${
              pestana === p.id
                ? 'border-blue-600 bg-blue-50 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                : 'border-neutral-300 bg-white text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {esCheques ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {(pestana === 'emitidos' ? FILTROS_EMITIDOS : FILTROS_RECIBIDOS).map((e) => (
            <button
              key={e || 'todos'}
              type="button"
              className={botonClase(estado === e)}
              onClick={() => {
                setEstado(e)
                setPage(1)
              }}
            >
              {e ? ESTADO_CHEQUE_VIENTRI_LABELS[e] : 'Todos'}
            </button>
          ))}
        </div>
      ) : null}

      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Buscar</span>
        <input
          type="search"
          value={q}
          onChange={(ev) => {
            setQ(ev.target.value)
            setPage(1)
          }}
          placeholder="Número, nombre, CUIT o importe"
          className="w-full rounded-lg border-2 border-neutral-300 px-4 py-2 text-base dark:border-neutral-600 dark:bg-neutral-900"
        />
      </label>

      {datos.isLoading ? <p className="py-6 text-neutral-600">Cargando…</p> : null}
      {datos.isError ? (
        <p className="py-6 font-semibold text-red-700">{(datos.error as Error).message}</p>
      ) : null}

      {datos.data ? (
        <>
          <p className="mb-2 text-neutral-700 dark:text-neutral-300">
            <strong>{datos.data.total.toLocaleString('es-AR')}</strong> {esCheques ? 'cheques' : 'comprobantes'} ·{' '}
            <strong>{pesos(datos.data.totalCentavos)}</strong>
          </p>
          {esCheques ? (
            <TablaCheques items={(chequesQ.data?.items ?? []) as VientriCheque[]} emitidos={pestana === 'emitidos'} />
          ) : (
            <TablaPendientes items={(pendientesQ.data?.items ?? []) as VientriPendiente[]} lado={pestana} />
          )}
          {datos.data.pages > 1 ? (
            <div className="mt-4 flex items-center gap-3">
              <button type="button" className={botonClase(false)} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </button>
              <span>
                Página {datos.data.page} de {datos.data.pages}
              </span>
              <button
                type="button"
                className={botonClase(false)}
                disabled={page >= datos.data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <p className="mt-6 text-sm text-neutral-600 dark:text-neutral-400">
        Estos datos vienen de Vientri y se ven al día siguiente de cargarlos. Para corregir algo, hacelo en Vientri.
      </p>
    </div>
  )
}

function TablaCheques({ items, emitidos }: { items: VientriCheque[]; emitidos: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  if (items.length === 0) return <p className="py-6 text-neutral-600">No hay cheques con este filtro.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="border-b-2 border-neutral-300 text-left text-sm text-neutral-600 dark:text-neutral-400">
            <th className="py-2 pr-3">Número</th>
            <th className="py-2 pr-3">Banco</th>
            <th className="py-2 pr-3">{emitidos ? 'Para' : 'De quién'}</th>
            <th className="py-2 pr-3">Vence</th>
            <th className="py-2 pr-3 text-right">Importe</th>
            <th className="py-2 pr-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const quien = emitidos
              ? c.entregadoA?.nombre ?? c.destinatario ?? '—'
              : c.librador?.nombre ?? c.entregadoPor?.nombre ?? '—'
            return (
              <Fragment key={c.id}>
                <tr
                  className="cursor-pointer border-b border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  onClick={() => setAbierto(abierto === c.id ? null : c.id)}
                >
                  <td className="py-2 pr-3">
                    {c.numero}
                    {c.revisar.length > 0 ? <span className="ml-2 text-sm font-semibold text-amber-700">Revisar</span> : null}
                  </td>
                  <td className="py-2 pr-3">{c.bancoNombre ?? '—'}</td>
                  <td className="py-2 pr-3">{quien}</td>
                  <td className="py-2 pr-3">{fecha(c.fechaVencimiento)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pesos(c.montoCentavos)}</td>
                  <td className="py-2 pr-3">{ESTADO_CHEQUE_VIENTRI_LABELS[c.estado]}</td>
                </tr>
                {abierto === c.id ? (
                  <tr className="bg-neutral-50 dark:bg-neutral-900">
                    <td colSpan={6} className="px-3 py-3 text-base">
                      <ul className="space-y-1">
                        <li>Tipo: {c.tipo === 'echeq' ? 'eCheq' : 'Cheque de papel'}</li>
                        <li>Firmado por: {c.librador?.nombre ?? '—'}{c.librador?.cuit ? ` (CUIT ${c.librador.cuit})` : ''}</li>
                        {!emitidos ? <li>Recibido el {fecha(c.fechaRecibido)} de {c.entregadoPor?.nombre ?? '—'}</li> : null}
                        <li>Entregado el {fecha(c.fechaEntregado)} a {c.entregadoA?.nombre ?? c.destinatario ?? '—'}</li>
                        {c.fechaDeposito ? <li>Depositado el {fecha(c.fechaDeposito)}</li> : null}
                        {c.fechaConciliado ? <li>Conciliado con el banco el {fecha(c.fechaConciliado)}</li> : null}
                        <li>Estado en Vientri: {c.estadoVientri}</li>
                        {c.revisar.map((r) => (
                          <li key={r} className="font-semibold text-amber-800 dark:text-amber-300">Revisar: {r}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TablaPendientes({ items, lado }: { items: VientriPendiente[]; lado: Pestana }) {
  if (items.length === 0) return <p className="py-6 text-neutral-600">No hay comprobantes pendientes.</p>
  const hoy = new Date().toISOString().slice(0, 10)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="border-b-2 border-neutral-300 text-left text-sm text-neutral-600 dark:text-neutral-400">
            <th className="py-2 pr-3">{lado === 'cobrar' ? 'Cliente' : lado === 'pagar' ? 'Proveedor' : 'Persona'}</th>
            <th className="py-2 pr-3">Comprobante</th>
            <th className="py-2 pr-3">Vence</th>
            <th className="py-2 pr-3 text-right">Total</th>
            <th className="py-2 pr-3 text-right">Falta</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const vencido = p.fechaVencimiento !== null && p.fechaVencimiento < hoy
            return (
              <tr key={p.id} className="border-b border-neutral-200 dark:border-neutral-700">
                <td className="py-2 pr-3">{p.persona?.nombre ?? '—'}</td>
                <td className="py-2 pr-3">
                  {p.comprobante}
                  {p.prestamo ? <span className="ml-2 text-sm font-semibold">Préstamo</span> : null}
                  {p.fechaProntoPago ? (
                    <span className="ml-2 text-sm font-semibold text-green-800">Pronto pago hasta {fecha(p.fechaProntoPago)}</span>
                  ) : null}
                </td>
                <td className={`py-2 pr-3 ${vencido ? 'font-semibold text-red-700 dark:text-red-400' : ''}`}>
                  {fecha(p.fechaVencimiento)}
                  {vencido ? ' · Vencido' : ''}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{pesos(p.totalCentavos)}</td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">{pesos(p.pendienteCentavos)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
