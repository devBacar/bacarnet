import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { finanzasInputClass } from '../../components/finanzas/FinanzasFormField'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { AgendaDestinatariosPanel } from '../../components/finanzas/AgendaDestinatariosPanel'
import { NuevaTransferenciaModal } from '../../components/finanzas/NuevaTransferenciaModal'
import { useAuth } from '../../context'
import { fetchFinanzasCuentas } from '../../services/finanzasApi'
import {
  actualizarEstadosTransferencias,
  cancelarTransferenciaConfeccionada,
  confirmarMovimientoTransferencia,
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

const TONO_ESTADO: Record<string, string> = {
  pendiente:
    'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200',
  enviada:
    'border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100',
  hecha:
    'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100',
  rechazada:
    'border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function horaArgentina(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
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
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [pestana, setPestana] = useState<'historial' | 'agenda'>('historial')
  const [nuevaAbierta, setNuevaAbierta] = useState(false)
  const [actualizandoEstados, setActualizandoEstados] = useState(false)

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

  async function actualizarEstados() {
    setActualizandoEstados(true)
    try {
      const result = await actualizarEstadosTransferencias()
      const partes = [`Revisadas: ${result.revisadas}.`, `Actualizadas: ${result.actualizadas}.`]
      if (result.ambiguas > 0) {
        partes.push(`${result.ambiguas} no se pudieron identificar con seguridad.`)
      }
      toast.success(partes.join(' '))
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'transferencias'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron actualizar los estados')
    } finally {
      setActualizandoEstados(false)
    }
  }

  async function elegirCandidato(transferenciaId: string, movimientoId: string) {
    const clave = `${transferenciaId}:${movimientoId}`
    setConfirmando(clave)
    try {
      await confirmarMovimientoTransferencia(transferenciaId, movimientoId)
      toast.success('Transferencia efectivizada')
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'transferencias'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo confirmar el movimiento')
    } finally {
      setConfirmando(null)
    }
  }

  return (
    <>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-heading text-2xl font-semibold">Transferencias</h1>
          <p className="text-body-muted mt-1 text-sm">
            Historial de confecciones hechas desde BacarNet. Cancelar acá no cancela la operación en
            Interbanking.
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
          <button
            type="button"
            className="w-full rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white sm:w-auto"
            onClick={() => setNuevaAbierta(true)}
          >
            Nueva transferencia
          </button>
          <button
            type="button"
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800 sm:w-auto"
            disabled={actualizandoEstados}
            onClick={() => void actualizarEstados()}
          >
            {actualizandoEstados ? 'Actualizando…' : 'Actualizar estados'}
          </button>
        </div>
      </header>

      <div className="mb-4 inline-flex w-full rounded-xl border border-neutral-200 p-1 dark:border-zinc-800 sm:w-auto">
        <button
          type="button"
          onClick={() => setPestana('historial')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium sm:flex-none ${
            pestana === 'historial' ? 'bg-brand-primary text-white' : 'text-body-muted'
          }`}
        >
          Historial
        </button>
        <button
          type="button"
          onClick={() => setPestana('agenda')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium sm:flex-none ${
            pestana === 'agenda' ? 'bg-brand-primary text-white' : 'text-body-muted'
          }`}
        >
          Agenda de destinatarios
        </button>
      </div>

      {pestana === 'agenda' ? <AgendaDestinatariosPanel /> : null}

      {pestana === 'historial' ? (
      <>

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
                <Fragment key={row.id}>
                <tr className="bg-white dark:bg-zinc-900">
                  <td className="px-3 py-3 whitespace-nowrap">{formatFecha(row.fechaConfeccion)}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{row.direccion}</div>
                    {row.concepto ? <div className="text-body-muted text-xs">{row.concepto}</div> : null}
                    {row.referencia ? <div className="text-body-muted text-xs">Ref. {row.referencia}</div> : null}
                    {row.origen === 'directa' ? <div className="text-body-muted text-xs">Directa</div> : null}
                  </td>
                  <td className="px-3 py-3">{TIPO_LABEL[row.tipo] ?? row.tipo}</td>
                  <td className="px-3 py-3 tabular-nums">{formatMoneyCentavos(row.montoCentavos, 'ARS')}</td>
                  <td className="px-3 py-3">
                    <EstadoCelda row={row} />
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
                      {row.compromisoPagoId ? (
                      <Link
                        className="rounded border px-2 py-1 text-xs font-medium"
                        to={`/finanzas/agenda?compromiso=${encodeURIComponent(row.compromisoPagoId)}`}
                      >
                        Ver compromiso
                      </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {row.requiereConfirmacionManual ? (
                  <tr className="bg-amber-50 dark:bg-amber-950/30">
                    <td colSpan={6} className="px-3 py-3">
                      <p className="font-medium text-amber-950 dark:text-amber-100">
                        Múltiples movimientos podrían corresponder a esta transferencia
                      </p>
                      <ul className="mt-2 space-y-2">
                        {(row.candidatos ?? []).map((candidato) => {
                          const clave = `${row.id}:${candidato.id}`
                          return (
                            <li
                              key={candidato.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-white px-3 py-2 dark:border-amber-800 dark:bg-zinc-900"
                            >
                              <span>
                                <span className="tabular-nums">{candidato.fechaProceso}</span>
                                {' · '}
                                <span className="tabular-nums">
                                  {formatMoneyCentavos(candidato.montoCentavos, 'ARS')}
                                </span>
                                {' · '}
                                {candidato.descripcion || 'Sin descripción'}
                              </span>
                              <button
                                type="button"
                                className="rounded border border-emerald-700 px-2 py-1 text-xs font-medium text-emerald-900 disabled:opacity-50 dark:text-emerald-200"
                                disabled={confirmando !== null}
                                onClick={() => void elegirCandidato(row.id, candidato.id)}
                              >
                                {confirmando === clave ? 'Confirmando…' : 'Elegir este'}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="text-body-muted px-4 py-8 text-center">No hay transferencias con esos filtros.</p>
          ) : null}
        </div>
      )}
      </>
      ) : null}

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
      {nuevaAbierta ? <NuevaTransferenciaModal onClose={() => setNuevaAbierta(false)} /> : null}
    </>
  )
}

function EstadoCelda({ row }: { row: TransferenciaListItem }) {
  if (row.estadoInterbankingRotulo && row.estadoInterbankingTono) {
    return (
      <div>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
            TONO_ESTADO[row.estadoInterbankingTono] ?? TONO_ESTADO.pendiente
          }`}
        >
          {row.estadoInterbankingRotulo}
        </span>
        {row.estadoInterbankingActualizadoAt ? (
          <p className="text-body-muted mt-1 text-xs">
            actualizado {horaArgentina(row.estadoInterbankingActualizadoAt)}
          </p>
        ) : null}
      </div>
    )
  }
  return <EstadoBadge estado={row.estado} />
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
