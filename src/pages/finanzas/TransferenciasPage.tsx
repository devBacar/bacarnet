import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { finanzasInputClass } from '../../components/finanzas/FinanzasFormField'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { useAuth } from '../../context'
import { fetchFinanzasCuentas } from '../../services/finanzasApi'
import {
  cancelarTransferenciaConfeccionada,
  fetchTransferenciaHistorial,
  fetchTransferencias,
  type TransferenciaEstadoUi,
  type TransferenciaHistorialItem,
  type TransferenciaListItem,
  type TransferenciasListFilters,
} from '../../services/finanzasTransferenciasApi'

const CANCELAR_AVISO =
  '⚠️ Esto NO cancela la transferencia en Interbanking. Solo la marca como cancelada acá, en BacarNet. Si la transferencia sigue activa en la plataforma de Interbanking, andá ahí a cancelarla también — de lo contrario, alguien podría autorizarla igual sin saber que acá la dimos por cancelada.'

const TIPO_LABEL: Record<string, string> = {
  cuentas_propias: 'Cuentas propias',
  proveedores: 'Proveedores',
  terceros: 'Terceros',
  sueldos: 'Sueldos',
  pagos_arca: 'Pagos ARCA',
}

const ESTADO_LABEL: Record<string, string> = {
  confeccionada: 'Confeccionada',
  pendiente_proceso: 'Pendiente de proceso',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  efectivizada: 'Efectivizada',
}

const ESTADO_BADGE: Record<string, string> = {
  confeccionada: 'border-amber-300 bg-amber-100 text-amber-950',
  pendiente_proceso: 'border-zinc-300 bg-zinc-200 text-zinc-800',
  rechazada: 'border-red-300 bg-red-100 text-red-900',
  cancelada: 'border-zinc-200 bg-zinc-50 text-zinc-500',
  efectivizada: 'border-emerald-300 bg-emerald-100 text-emerald-900',
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function FinanzasTransferenciasPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [estado, setEstado] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [tipo, setTipo] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [historialId, setHistorialId] = useState<string | null>(null)
  const [cancelarRow, setCancelarRow] = useState<TransferenciaListItem | null>(null)

  const filters: TransferenciasListFilters = { estado, cuentaId, tipo, desde, hasta }

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'transferencias', filters],
    queryFn: () => fetchTransferencias(filters),
    enabled: Boolean(user),
  })

  const { data: cuentasData } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: Boolean(user),
  })

  const { data: historial = [], isLoading: loadingHistorial } = useQuery({
    queryKey: ['finanzas', 'transferencias', 'historial', historialId],
    queryFn: () => fetchTransferenciaHistorial(historialId!),
    enabled: Boolean(historialId),
  })

  const cuentas = (cuentasData?.cuentas ?? []).filter((cuenta) => cuenta.tipo === 'CC')

  return (
    <>
      <header className="mb-6">
        <h1 className="text-heading text-2xl font-semibold">Transferencias</h1>
        <p className="text-body-muted mt-1 text-sm">
          Historial de confecciones hechas desde BacarNet. Cancelar acá no cancela la operación en
          Interbanking.
        </p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Estado</span>
          <select className={finanzasInputClass} value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ESTADO_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Cuenta de débito</span>
          <select className={finanzasInputClass} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="">Todas</option>
            {cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.bancoNombre} {cuenta.tipo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Tipo</span>
          <select className={finanzasInputClass} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(TIPO_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Desde</span>
          <input className={finanzasInputClass} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Hasta</span>
          <input className={finanzasInputClass} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-700">{error instanceof Error ? error.message : 'No se pudo cargar'}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-zinc-950/80">
              <tr>
                <th className="px-3 py-3 text-left font-medium">Fecha</th>
                <th className="px-3 py-3 text-left font-medium">Dirección</th>
                <th className="px-3 py-3 text-left font-medium">Tipo</th>
                <th className="px-3 py-3 text-left font-medium">Monto</th>
                <th className="px-3 py-3 text-left font-medium">Estado</th>
                <th className="px-3 py-3 text-left font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
              {rows.map((row) => (
                <tr key={row.id} className="bg-white dark:bg-zinc-900">
                  <td className="px-3 py-3 whitespace-nowrap">{formatFecha(row.fechaConfeccion)}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{row.direccion}</div>
                    {row.concepto ? <div className="text-body-muted text-xs">{row.concepto}</div> : null}
                  </td>
                  <td className="px-3 py-3">{TIPO_LABEL[row.tipo] ?? row.tipo}</td>
                  <td className="px-3 py-3 tabular-nums">{formatMoneyCentavos(row.montoCentavos, 'ARS')}</td>
                  <td className="px-3 py-3">
                    <EstadoBadge estado={row.estado} />
                    {row.estado === 'rechazada' && row.erroresInterbanking?.length ? (
                      <p className="mt-1 max-w-xs text-xs text-red-800">{row.erroresInterbanking.join(' ')}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs font-medium"
                        onClick={() => setHistorialId(row.id)}
                      >
                        Ver historial
                      </button>
                      {row.puedeCancelar ? (
                        <button
                          type="button"
                          className="rounded border border-amber-600 px-2 py-1 text-xs font-medium text-amber-900"
                          onClick={() => setCancelarRow(row)}
                        >
                          Cancelar
                        </button>
                      ) : null}
                      <Link
                        className="rounded border px-2 py-1 text-xs font-medium"
                        to={`/finanzas/agenda?compromiso=${encodeURIComponent(row.compromisoPagoId)}`}
                      >
                        Ver compromiso
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="text-body-muted px-4 py-8 text-center">No hay transferencias con esos filtros.</p>
          ) : null}
        </div>
      )}

      {historialId ? (
        <HistorialModal
          historial={historial}
          loading={loadingHistorial}
          onClose={() => setHistorialId(null)}
        />
      ) : null}
      {cancelarRow ? (
        <CancelarModal
          row={cancelarRow}
          onClose={() => setCancelarRow(null)}
          onConfirm={async () => {
            await cancelarTransferenciaConfeccionada(cancelarRow.id)
            toast.success('Marcada como cancelada en BacarNet. Interbanking no se modificó.')
            setCancelarRow(null)
            await queryClient.invalidateQueries({ queryKey: ['finanzas', 'transferencias'] })
          }}
        />
      ) : null}
    </>
  )
}

function EstadoBadge({ estado }: { estado: TransferenciaEstadoUi | string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
        ESTADO_BADGE[estado] ?? 'border-zinc-300 bg-zinc-100 text-zinc-700'
      }`}
    >
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  )
}

function HistorialModal({
  historial,
  loading,
  onClose,
}: {
  historial: TransferenciaHistorialItem[]
  loading: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="surface-card max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 p-6 dark:border-zinc-700">
        <h2 className="text-heading text-lg font-semibold">Historial</h2>
        {loading ? (
          <p className="text-body-muted mt-4 text-sm">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="text-body-muted mt-4 text-sm">No hay eventos.</p>
        ) : (
          <ol className="mt-4 space-y-2 text-sm">
            {historial.map((ev) => (
              <li key={ev.id} className="rounded border border-neutral-200 px-3 py-2 dark:border-zinc-800">
                <p className="font-medium">
                  {ev.estadoAnterior ?? 'Alta'} → {ev.estadoNuevo}
                </p>
                <p className="text-body-muted text-xs">
                  {formatFecha(ev.fecha)} · {ev.origen}
                </p>
                {ev.nota ? <p className="mt-1">{ev.nota}</p> : null}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-6 flex justify-end">
          <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function CancelarModal({
  row,
  onClose,
  onConfirm,
}: {
  row: TransferenciaListItem
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="surface-card w-full max-w-xl rounded-2xl border border-neutral-200 p-6 dark:border-zinc-700">
        <h2 className="text-heading text-lg font-semibold">Marcar como cancelada</h2>
        <p className="text-body-muted mt-2 text-sm">{row.direccion}</p>
        <p className="mt-4 rounded-xl border-2 border-amber-600 bg-amber-50 px-4 py-4 text-base font-semibold leading-relaxed text-amber-950">
          {CANCELAR_AVISO}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={onClose} disabled={saving}>
            Volver
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => {
              setSaving(true)
              void onConfirm()
                .catch((err: unknown) => {
                  toast.error(err instanceof Error ? err.message : 'No se pudo marcar como cancelada')
                })
                .finally(() => setSaving(false))
            }}
          >
            {saving ? 'Marcando…' : 'Marcar como cancelada'}
          </button>
        </div>
      </div>
    </div>
  )
}
