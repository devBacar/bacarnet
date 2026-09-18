import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  ChequeEmitidoRechazadoAlert,
  ChequeEstadoBadge,
} from '../../components/finanzas/ChequeEstadoBadge'
import { FinanzasFormField, finanzasInputClass } from '../../components/finanzas/FinanzasFormField'
import { PosicionMonto } from '../../components/finanzas/PosicionMonto'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { useAuth } from '../../context'
import {
  anularChequeEmitido,
  createCheque,
  debitarChequeEmitido,
  depositarCheque,
  endosarCheque,
  entregarChequeEmitido,
  fetchAgendaCobros,
  fetchAgendaCompromisos,
  fetchChequeDetail,
  fetchCheques,
  rechazarCheque,
  venderCheque,
  type ChequeDetail,
  type ChequeDireccion,
  type ChequeEstado,
} from '../../services/finanzasChequesApi'
import { fetchFinanzasCuentas } from '../../services/finanzasApi'

const ESTADOS_FILTRO_RECIBIDO: { value: '' | ChequeEstado; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'en_cartera', label: 'En cartera' },
  { value: 'depositado', label: 'Depositado' },
  { value: 'endosado', label: 'Endosado' },
  { value: 'vendido', label: 'Vendido' },
  { value: 'acreditado', label: 'Acreditado' },
  { value: 'rechazado', label: 'Rechazado' },
]

const ESTADOS_FILTRO_EMITIDO: { value: '' | ChequeEstado; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'emitido', label: 'Emitido' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'debitado', label: 'Debitado' },
  { value: 'anulado', label: 'Anulado' },
  { value: 'rechazado', label: 'Rechazado' },
]

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function FinanzasChequesPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [direccionVista, setDireccionVista] = useState<ChequeDireccion>('recibido')
  const [estado, setEstado] = useState<'' | ChequeEstado>('')
  const [banco, setBanco] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAlta, setShowAlta] = useState(false)

  const estadosFiltro =
    direccionVista === 'emitido' ? ESTADOS_FILTRO_EMITIDO : ESTADOS_FILTRO_RECIBIDO

  const filters = useMemo(
    () => ({
      direccion: direccionVista,
      estado: estado || undefined,
      banco: banco || undefined,
      fechaPagoDesde: fechaDesde || undefined,
      fechaPagoHasta: fechaHasta || undefined,
    }),
    [direccionVista, estado, banco, fechaDesde, fechaHasta],
  )

  const { data: cheques = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['finanzas', 'cheques', filters],
    queryFn: () => fetchCheques(filters),
    enabled: Boolean(user),
  })

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['finanzas', 'cheque', selectedId],
    queryFn: () => fetchChequeDetail(selectedId!),
    enabled: Boolean(selectedId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques'] })
    if (selectedId) {
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheque', selectedId] })
    }
  }

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-heading text-2xl font-bold tracking-tight sm:text-3xl">Cheques</h1>
          <p className="text-body-muted mt-2 max-w-2xl text-sm">
            {direccionVista === 'recibido'
              ? 'Cheques que recibimos de clientes o terceros, con historial y vínculos a cobros.'
              : 'Cheques emitidos con nuestra chequera para pagar proveedores, contra cuentas CC.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowAlta(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            {direccionVista === 'emitido' ? 'Alta de cheque emitido' : 'Alta de cheque recibido'}
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </header>

      <nav
        aria-label="Dirección del cheque"
        className="mb-6 inline-flex gap-1 rounded-xl border border-neutral-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {(
          [
            { id: 'recibido' as const, label: 'Recibidos' },
            { id: 'emitido' as const, label: 'Emitidos' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setDireccionVista(tab.id)
              setEstado('')
              setSelectedId(null)
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              direccionVista === tab.id
                ? 'bg-brand-primary text-white'
                : 'text-body-muted hover:bg-neutral-100 dark:hover:bg-zinc-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="surface-card mb-6 grid gap-4 rounded-2xl border border-neutral-200 p-4 md:grid-cols-4 dark:border-zinc-800">
        <label className="block text-sm">
          <span className="text-body-muted mb-1 block">Estado</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as '' | ChequeEstado)}
            className="input-surface w-full rounded-lg border px-3 py-2"
          >
            {estadosFiltro.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-body-muted mb-1 block">Banco emisor</span>
          <input
            value={banco}
            onChange={(e) => setBanco(e.target.value)}
            className="input-surface w-full rounded-lg border px-3 py-2"
            placeholder="Patagonia, Julio…"
          />
        </label>
        <label className="block text-sm">
          <span className="text-body-muted mb-1 block">Fecha de pago desde</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="input-surface w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-body-muted mb-1 block">Fecha de pago hasta</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="input-surface w-full rounded-lg border px-3 py-2"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Error'}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-zinc-800">
            <thead className="bg-neutral-50 dark:bg-zinc-950/80">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Número</th>
                <th className="px-4 py-3 text-left font-medium">
                  {direccionVista === 'emitido' ? 'Beneficiario' : 'Librador'}
                </th>
                <th className="px-4 py-3 text-left font-medium">Banco</th>
                <th className="px-4 py-3 text-left font-medium">Monto</th>
                <th className="px-4 py-3 text-left font-medium">Fecha de pago</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
              {cheques.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-zinc-950/50"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="px-4 py-3 font-medium">{row.numero}</td>
                  <td className="px-4 py-3">
                    {row.direccion === 'emitido' ? row.beneficiarioNombre : row.libradorNombre}
                  </td>
                  <td className="px-4 py-3">{row.bancoEmisor}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoneyCentavos(row.montoCentavos, 'ARS')}</td>
                  <td className="px-4 py-3">{formatFecha(row.fechaPago)}</td>
                  <td className="px-4 py-3">
                    <ChequeEstadoBadge
                      label={row.estadoLabel}
                      estado={row.estadoActual}
                      direccion={row.direccion}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cheques.length === 0 ? (
            <p className="text-body-muted px-4 py-8 text-center text-sm">No hay cheques con estos filtros.</p>
          ) : null}
        </div>
      )}

      {selectedId ? (
        <ChequeDetailPanel
          loading={detailLoading}
          detail={detail}
          onClose={() => setSelectedId(null)}
          onUpdated={invalidate}
        />
      ) : null}

      {showAlta ? (
        <AltaChequeModal
          direccion={direccionVista}
          onClose={() => setShowAlta(false)}
          onCreated={(id) => {
            setShowAlta(false)
            invalidate()
            setSelectedId(id)
          }}
        />
      ) : null}
    </>
  )
}

function ChequeDetailPanel({
  loading,
  detail,
  onClose,
  onUpdated,
}: {
  loading: boolean
  detail: ChequeDetail | undefined
  onClose: () => void
  onUpdated: () => void
}) {
  const action = useMutation({
    mutationFn: async (fn: () => Promise<ChequeDetail>) => fn(),
    onSuccess: () => {
      toast.success('Cheque actualizado')
      onUpdated()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const esEmitido = detail?.direccion === 'emitido'
  const canDepositar = !esEmitido && detail?.estadoActual === 'en_cartera'
  const canEndosar = !esEmitido && detail?.estadoActual === 'en_cartera'
  const canVender = !esEmitido && detail?.estadoActual === 'en_cartera'
  const canRechazarRecibido =
    !esEmitido &&
    (detail?.estadoActual === 'depositado' ||
      detail?.estadoActual === 'endosado' ||
      detail?.estadoActual === 'vendido')
  const canEntregar = esEmitido && detail?.estadoActual === 'emitido'
  const canDebitar = esEmitido && detail?.estadoActual === 'entregado'
  const canAnular = esEmitido && detail?.estadoActual === 'emitido'
  const canRechazarEmitido = esEmitido && detail?.estadoActual === 'entregado'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-heading text-lg font-semibold">Detalle del cheque</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-zinc-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        {loading || !detail ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          </div>
        ) : (
          <div className="space-y-6 p-5">
            <div>
              <p className="text-body-muted text-sm">Número {detail.numero}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ChequeEstadoBadge
                  label={detail.estadoLabel}
                  estado={detail.estadoActual}
                  direccion={detail.direccion}
                />
                <span className="text-body-muted text-sm">{detail.bancoEmisor}</span>
              </div>
              <div className="mt-3">
                <PosicionMonto centavos={detail.montoCentavos} moneda="ARS" size="lg" />
              </div>
              {detail.direccion === 'emitido' ? (
                <>
                  <p className="text-body-muted mt-2 text-sm">
                    Beneficiario: {detail.beneficiarioNombre} · CUIT {detail.beneficiarioCuit}
                  </p>
                  {detail.cuentaResumen ? (
                    <p className="text-body-muted text-sm">
                      Cuenta chequera: {detail.cuentaResumen.bancoNombre} {detail.cuentaResumen.tipoLabel}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-body-muted mt-2 text-sm">
                  Librador: {detail.libradorNombre} · CUIT {detail.libradorCuit}
                </p>
              )}
              <p className="text-body-muted text-sm">Fecha de pago: {formatFecha(detail.fechaPago)}</p>
            </div>

            {detail.direccion === 'emitido' && detail.estadoActual === 'rechazado' ? (
              <ChequeEmitidoRechazadoAlert motivo={detail.motivoRechazo} />
            ) : null}

            {(detail.compromisoResumen || detail.cobroResumen) && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                <p className="text-heading text-sm font-semibold">Vínculos</p>
                {detail.compromisoResumen ? (
                  <p className="mt-2 text-sm">
                    <span className="text-body-muted">Compromiso de pago:</span>{' '}
                    {detail.compromisoResumen.concepto} — {detail.compromisoResumen.proveedorONombre}
                  </p>
                ) : null}
                {detail.cobroResumen ? (
                  <p className="mt-2 text-sm">
                    <span className="text-body-muted">Cobro esperado:</span> {detail.cobroResumen.clienteONombre}
                  </p>
                ) : null}
              </div>
            )}

            {detail.endosadoA ? (
              <p className="text-sm">
                <span className="text-body-muted">Endosado a:</span> {detail.endosadoA}
              </p>
            ) : null}
            {detail.vendidoA ? (
              <p className="text-sm">
                <span className="text-body-muted">Vendido a:</span> {detail.vendidoA}
                {detail.vendidoConResponsabilidad ? ' (con responsabilidad)' : ''}
              </p>
            ) : null}
            {detail.motivoRechazo && !(detail.direccion === 'emitido' && detail.estadoActual === 'rechazado') ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                Motivo de rechazo: {detail.motivoRechazo}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {canEntregar ? (
                <button
                  type="button"
                  disabled={action.isPending}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                  onClick={() =>
                    action.mutate(() => entregarChequeEmitido(detail.id, 'Entrega al beneficiario'))
                  }
                >
                  Marcar entregado
                </button>
              ) : null}
              {canDebitar ? (
                <button
                  type="button"
                  disabled={action.isPending}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                  onClick={() =>
                    action.mutate(() => debitarChequeEmitido(detail.id, 'Débito confirmado en cuenta'))
                  }
                >
                  Marcar debitado
                </button>
              ) : null}
              {canAnular ? (
                <button
                  type="button"
                  disabled={action.isPending}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                  onClick={() => {
                    if (!window.confirm('¿Anular este cheque emitido?')) return
                    action.mutate(() => anularChequeEmitido(detail.id, 'Anulación'))
                  }}
                >
                  Anular
                </button>
              ) : null}
              {canDepositar ? (
                <button
                  type="button"
                  disabled={action.isPending}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                  onClick={() =>
                    action.mutate(() => depositarCheque(detail.id, 'Depósito registrado'))
                  }
                >
                  Depositar
                </button>
              ) : null}
              {canEndosar ? (
                <button
                  type="button"
                  disabled={action.isPending}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                  onClick={() => {
                    const endosadoA = window.prompt('Endosado a (nombre o razón social):')
                    if (!endosadoA?.trim()) return
                    action.mutate(() =>
                      endosarCheque(detail.id, { endosadoA: endosadoA.trim() }),
                    )
                  }}
                >
                  Endosar
                </button>
              ) : null}
              {canVender ? (
                <button
                  type="button"
                  disabled={action.isPending}
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                  onClick={() => {
                    const vendidoA = window.prompt('Vendido a:')
                    if (!vendidoA?.trim()) return
                    const conResp = window.confirm('¿Vendido con responsabilidad?')
                    action.mutate(() =>
                      venderCheque(detail.id, {
                        vendidoA: vendidoA.trim(),
                        vendidoConResponsabilidad: conResp,
                      }),
                    )
                  }}
                >
                  Vender
                </button>
              ) : null}
              {canRechazarRecibido ? (
                <button
                  type="button"
                  disabled={action.isPending}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:text-red-300"
                  onClick={() => {
                    const motivo = window.prompt('Motivo del rechazo:')
                    if (!motivo?.trim()) return
                    action.mutate(() =>
                      rechazarCheque(detail.id, { motivoRechazo: motivo.trim() }),
                    )
                  }}
                >
                  Rechazar
                </button>
              ) : null}
              {canRechazarEmitido ? (
                <button
                  type="button"
                  disabled={action.isPending}
                  className="rounded-lg border-2 border-red-600 px-3 py-2 text-sm font-bold text-red-800 dark:border-red-500 dark:text-red-200"
                  onClick={() => {
                    const motivo = window.prompt(
                      'Motivo del rechazo bancario (cheque emitido):',
                    )
                    if (!motivo?.trim()) return
                    action.mutate(() =>
                      rechazarCheque(detail.id, { motivoRechazo: motivo.trim() }),
                    )
                  }}
                >
                  Rechazar (emitido)
                </button>
              ) : null}
            </div>

            <section>
              <h3 className="text-heading mb-3 text-sm font-semibold uppercase tracking-wide">
                Historial de estados
              </h3>
              <ol className="space-y-3">
                {detail.historial.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <p className="font-medium">
                      {ev.estadoAnteriorLabel ?? 'Alta'} → {ev.estadoNuevoLabel}
                    </p>
                    <p className="text-body-muted text-xs">
                      {formatFecha(ev.fecha)} · usuario {ev.usuario.slice(0, 8)}…
                    </p>
                    {ev.nota ? <p className="mt-1 text-sm">{ev.nota}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </aside>
    </div>
  )
}

function AltaChequeModal({
  direccion,
  onClose,
  onCreated,
}: {
  direccion: ChequeDireccion
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const esEmitido = direccion === 'emitido'

  const [form, setForm] = useState({
    numero: '',
    bancoEmisor: '',
    libradorNombre: '',
    libradorCuit: '',
    cuentaId: '',
    beneficiarioNombre: '',
    beneficiarioCuit: '',
    tipo: 'fisico' as 'fisico' | 'echeq',
    montoPesos: '',
    fechaEmision: '',
    fechaPago: '',
    cobroOrigenId: '',
    compromisoPagoId: '',
    nota: '',
  })

  const { data: compromisos = [] } = useQuery({
    queryKey: ['finanzas', 'agenda', 'compromisos'],
    queryFn: fetchAgendaCompromisos,
  })
  const { data: cobros = [] } = useQuery({
    queryKey: ['finanzas', 'agenda', 'cobros'],
    queryFn: fetchAgendaCobros,
    enabled: !esEmitido,
  })
  const { data: cuentasData } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: esEmitido,
  })
  const cuentasCc = useMemo(
    () => (cuentasData?.cuentas ?? []).filter((c) => c.tipo === 'CC'),
    [cuentasData],
  )

  const createMut = useMutation({
    mutationFn: async () => {
      const monto = Number(form.montoPesos.replace(',', '.'))
      if (!Number.isFinite(monto) || monto <= 0) throw new Error('Monto inválido')
      const montoCentavos = Math.round(monto * 100)
      if (esEmitido) {
        return createCheque({
          direccion: 'emitido',
          numero: form.numero,
          cuentaId: form.cuentaId,
          beneficiarioNombre: form.beneficiarioNombre,
          beneficiarioCuit: form.beneficiarioCuit,
          montoCentavos,
          fechaEmision: form.fechaEmision,
          fechaPago: form.fechaPago,
          tipo: form.tipo,
          compromisoPagoId: form.compromisoPagoId || undefined,
          nota: form.nota || undefined,
        })
      }
      return createCheque({
        direccion: 'recibido',
        numero: form.numero,
        bancoEmisor: form.bancoEmisor,
        libradorNombre: form.libradorNombre,
        libradorCuit: form.libradorCuit,
        montoCentavos,
        fechaEmision: form.fechaEmision,
        fechaPago: form.fechaPago,
        tipo: form.tipo,
        cobroOrigenId: form.cobroOrigenId || undefined,
        compromisoPagoId: form.compromisoPagoId || undefined,
        nota: form.nota || undefined,
      })
    },
    onSuccess: (cheque) => {
      toast.success('Cheque registrado')
      onCreated(cheque.id)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-heading text-lg font-semibold">
          {esEmitido ? 'Alta de cheque emitido' : 'Alta de cheque recibido'}
        </h2>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            createMut.mutate()
          }}
        >
          <FinanzasFormField label="Número" htmlFor="cheque-alta-numero">
            <input
              id="cheque-alta-numero"
              className={finanzasInputClass}
              autoComplete="off"
              {...field('numero')}
              required
            />
          </FinanzasFormField>
          {esEmitido ? (
            <FinanzasFormField label="Cuenta chequera (CC)" htmlFor="cheque-alta-cuenta">
              <select
                id="cheque-alta-cuenta"
                className={finanzasInputClass}
                {...field('cuentaId')}
                required
                disabled={cuentasCc.length === 0}
              >
                <option value="">
                  {cuentasCc.length === 0
                    ? 'No hay cuentas corrientes disponibles'
                    : 'Seleccioná la cuenta'}
                </option>
                {cuentasCc.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.bancoNombre} — {c.tipoLabel} ({c.moneda})
                  </option>
                ))}
              </select>
            </FinanzasFormField>
          ) : (
            <>
              <FinanzasFormField label="Banco emisor" htmlFor="cheque-alta-banco">
                <input id="cheque-alta-banco" className={finanzasInputClass} {...field('bancoEmisor')} required />
              </FinanzasFormField>
              <FinanzasFormField label="Librador" htmlFor="cheque-alta-librador">
                <input id="cheque-alta-librador" className={finanzasInputClass} {...field('libradorNombre')} required />
              </FinanzasFormField>
              <FinanzasFormField label="CUIT" htmlFor="cheque-alta-cuit">
                <input
                  id="cheque-alta-cuit"
                  className={finanzasInputClass}
                  inputMode="numeric"
                  {...field('libradorCuit')}
                  required
                />
              </FinanzasFormField>
            </>
          )}
          {esEmitido ? (
            <>
              <FinanzasFormField label="Beneficiario" htmlFor="cheque-alta-beneficiario">
                <input
                  id="cheque-alta-beneficiario"
                  className={finanzasInputClass}
                  {...field('beneficiarioNombre')}
                  required
                />
              </FinanzasFormField>
              <FinanzasFormField label="CUIT del beneficiario" htmlFor="cheque-alta-beneficiario-cuit">
                <input
                  id="cheque-alta-beneficiario-cuit"
                  className={finanzasInputClass}
                  inputMode="numeric"
                  {...field('beneficiarioCuit')}
                  required
                />
              </FinanzasFormField>
            </>
          ) : null}
          <FinanzasFormField label="Tipo" htmlFor="cheque-alta-tipo">
            <select id="cheque-alta-tipo" className={finanzasInputClass} {...field('tipo')} required>
              <option value="fisico">Físico</option>
              <option value="echeq">E-cheq</option>
            </select>
          </FinanzasFormField>
          <FinanzasFormField label="Monto" htmlFor="cheque-alta-monto">
            <input
              id="cheque-alta-monto"
              className={finanzasInputClass}
              inputMode="decimal"
              placeholder="Ej. 150000,50 (ARS)"
              {...field('montoPesos')}
              required
            />
          </FinanzasFormField>
          <FinanzasFormField label="Fecha de emisión" htmlFor="cheque-alta-fecha-emision">
            <input
              id="cheque-alta-fecha-emision"
              type="date"
              className={finanzasInputClass}
              {...field('fechaEmision')}
              required
            />
          </FinanzasFormField>
          <FinanzasFormField label="Fecha de pago/cobro" htmlFor="cheque-alta-fecha-pago">
            <input
              id="cheque-alta-fecha-pago"
              type="date"
              className={finanzasInputClass}
              {...field('fechaPago')}
              required
            />
          </FinanzasFormField>
          {!esEmitido ? (
            <FinanzasFormField label="Cobro esperado" htmlFor="cheque-alta-cobro" optional>
              <select
                id="cheque-alta-cobro"
                className={finanzasInputClass}
                {...field('cobroOrigenId')}
                disabled={cobros.length === 0}
              >
                <option value="">
                  {cobros.length === 0
                    ? 'No hay cobros esperados pendientes para vincular'
                    : 'Sin vincular'}
                </option>
                {cobros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.clienteONombre}
                  </option>
                ))}
              </select>
            </FinanzasFormField>
          ) : null}
          <FinanzasFormField label="Compromiso de pago" htmlFor="cheque-alta-compromiso" optional>
            <select
              id="cheque-alta-compromiso"
              className={finanzasInputClass}
              {...field('compromisoPagoId')}
              disabled={compromisos.length === 0}
            >
              <option value="">
                {compromisos.length === 0
                  ? 'No hay compromisos pendientes para vincular'
                  : 'Sin vincular'}
              </option>
              {compromisos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.concepto} — {c.proveedorONombre}
                </option>
              ))}
            </select>
          </FinanzasFormField>
          <FinanzasFormField label="Nota inicial" htmlFor="cheque-alta-nota" optional>
            <textarea id="cheque-alta-nota" className={finanzasInputClass} rows={2} {...field('nota')} />
          </FinanzasFormField>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
