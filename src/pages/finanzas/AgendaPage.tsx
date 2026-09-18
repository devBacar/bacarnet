import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  VencimientoAlertTag,
  vencimientoRowClass,
} from '../../components/finanzas/VencimientoAlert'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { useAuth } from '../../context'
import { fetchFinanzasCuentas } from '../../services/finanzasApi'
import {
  confirmarCobroAgenda,
  createCobroAgenda,
  createCompromisoAgenda,
  fetchCobrosAgenda,
  fetchCompromisoHistorial,
  fetchCompromisosAgenda,
  marcarCompromisoPagado,
  patchCobroPrioridad,
  patchCompromisoPrioridad,
  type CobroAgendaItem,
  type CompromisoAgendaItem,
  type MedioPago,
} from '../../services/finanzasAgendaApi'

type Tab = 'pagos' | 'cobros'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR')
}

const MEDIO_LABEL: Record<MedioPago, string> = {
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  efectivo: 'Efectivo',
}

export function FinanzasAgendaPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('pagos')
  const [showAlta, setShowAlta] = useState(false)
  const queryClient = useQueryClient()

  const { data: compromisos = [], isLoading: loadingPagos } = useQuery({
    queryKey: ['finanzas', 'agenda', 'compromisos'],
    queryFn: fetchCompromisosAgenda,
    enabled: Boolean(user),
  })

  const { data: cobros = [], isLoading: loadingCobros } = useQuery({
    queryKey: ['finanzas', 'agenda', 'cobros'],
    queryFn: fetchCobrosAgenda,
    enabled: Boolean(user),
  })

  const { data: cuentasData } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: Boolean(user),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-heading text-2xl font-bold tracking-tight sm:text-3xl">Agenda</h1>
        <p className="text-body-muted mt-2 max-w-2xl text-sm">
          Pagos pendientes y cobros esperados, con prioridad manual y trazabilidad al saldar.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-neutral-200 p-1 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setTab('pagos')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'pagos' ? 'bg-brand-primary text-white' : 'text-body-muted'
            }`}
          >
            Pagos pendientes
          </button>
          <button
            type="button"
            onClick={() => setTab('cobros')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'cobros' ? 'bg-brand-primary text-white' : 'text-body-muted'
            }`}
          >
            Cobros esperados
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowAlta(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          {tab === 'pagos' ? 'Nuevo compromiso' : 'Nuevo cobro'}
        </button>
      </div>

      {tab === 'pagos' ? (
        loadingPagos ? (
          <LoadingBlock />
        ) : (
          <CompromisosTable
            rows={compromisos}
            cuentas={cuentasData?.cuentas ?? []}
            onPrioridadChange={async (id, prioridad) => {
              await patchCompromisoPrioridad(id, prioridad)
              invalidate()
            }}
            onMarcarPagado={async (id, body) => {
              await marcarCompromisoPagado(id, body)
              toast.success('Marcado como pagado')
              invalidate()
            }}
          />
        )
      ) : loadingCobros ? (
        <LoadingBlock />
      ) : (
        <CobrosTable
          rows={cobros}
          cuentas={cuentasData?.cuentas ?? []}
          onPrioridadChange={async (id, prioridad) => {
            await patchCobroPrioridad(id, prioridad)
            invalidate()
          }}
          onConfirmar={async (id, body) => {
            await confirmarCobroAgenda(id, body)
            toast.success('Cobro confirmado')
            invalidate()
          }}
        />
      )}

      {showAlta ? (
        <AltaAgendaModal
          tab={tab}
          onClose={() => setShowAlta(false)}
          onSave={async (body) => {
            if (tab === 'pagos') await createCompromisoAgenda(body)
            else await createCobroAgenda(body)
            toast.success('Registro creado')
            invalidate()
            setShowAlta(false)
          }}
        />
      ) : null}
    </>
  )
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
    </div>
  )
}

function PrioridadInput({
  value,
  onCommit,
}: {
  value: number
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  return (
    <input
      type="number"
      className="input-surface w-16 rounded border px-2 py-1 text-sm tabular-nums"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft)
        if (Number.isFinite(n) && n !== value) onCommit(Math.round(n))
      }}
    />
  )
}

function CompromisosTable({
  rows,
  cuentas,
  onPrioridadChange,
  onMarcarPagado,
}: {
  rows: CompromisoAgendaItem[]
  cuentas: Array<{ id: string; bancoNombre: string; tipo: string; tipoLabel: string }>
  onPrioridadChange: (id: string, prioridad: number) => Promise<void>
  onMarcarPagado: (id: string, body: Record<string, unknown>) => Promise<void>
}) {
  const [historialId, setHistorialId] = useState<string | null>(null)
  const { data: historial = [] } = useQuery({
    queryKey: ['finanzas', 'agenda', 'historial', historialId],
    queryFn: () => fetchCompromisoHistorial(historialId!),
    enabled: Boolean(historialId),
  })

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-zinc-950/80">
            <tr>
              <th className="px-3 py-3 text-left font-medium">Prioridad</th>
              <th className="px-3 py-3 text-left font-medium">Concepto</th>
              <th className="px-3 py-3 text-left font-medium">Monto</th>
              <th className="px-3 py-3 text-left font-medium">Vencimiento</th>
              <th className="px-3 py-3 text-left font-medium">Medio previsto</th>
              <th className="px-3 py-3 text-left font-medium">Cheque</th>
              <th className="px-3 py-3 text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <tr key={row.id} className={`bg-white dark:bg-zinc-900 ${vencimientoRowClass(row.alertaVencimiento)}`}>
                <td className="px-3 py-3">
                  <PrioridadInput value={row.prioridad} onCommit={(v) => onPrioridadChange(row.id, v)} />
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">{row.concepto}</div>
                  <div className="text-body-muted text-xs">{row.proveedorONombre}</div>
                  <div className="mt-1">
                    <VencimientoAlertTag alerta={row.alertaVencimiento} />
                  </div>
                </td>
                <td className="px-3 py-3 tabular-nums">{formatMoneyCentavos(row.montoCentavos, 'ARS')}</td>
                <td className="px-3 py-3">{formatFecha(row.fechaVencimiento)}</td>
                <td className="px-3 py-3">{MEDIO_LABEL[row.medioPago]}</td>
                <td className="px-3 py-3">
                  {row.cheque ? (
                    <span className="text-body-muted text-sm" title={`Estado: ${row.cheque.estadoLabel}`}>
                      Nº {row.cheque.numero}
                    </span>
                  ) : row.chequeId ? (
                    <span className="text-body-muted text-xs" title="Vínculo guardado (detalle cuando Cheques esté disponible)">
                      Vinculado
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs font-medium"
                      onClick={() => setHistorialId(row.id)}
                    >
                      Historial
                    </button>
                    <button
                      type="button"
                      className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                      onClick={() => {
                        const medio = window.prompt(
                          'Medio de pago real (transferencia / cheque / efectivo):',
                          row.medioPago,
                        ) as MedioPago | null
                        if (!medio || !['transferencia', 'cheque', 'efectivo'].includes(medio)) return
                        let cuentaId: string | undefined
                        if (medio === 'transferencia' || medio === 'efectivo') {
                          const opts = cuentas.map((c) => `${c.id}:${c.bancoNombre} ${c.tipo}`).join('\n')
                          const picked = window.prompt(`cuentaId (cuentas disponibles):\n${opts}`)
                          if (!picked?.trim()) return
                          cuentaId = picked.split(':')[0]?.trim()
                        }
                        const fecha = window.prompt('Fecha de pago (YYYY-MM-DD):', new Date().toISOString().slice(0, 10))
                        void onMarcarPagado(row.id, {
                          medioPago: medio,
                          cuentaId,
                          fechaPago: fecha ?? undefined,
                        })
                      }}
                    >
                      Marcar pagado
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="text-body-muted px-4 py-8 text-center">No hay pagos pendientes.</p>
        ) : null}
      </div>
      {historialId ? (
        <HistorialModal historial={historial} onClose={() => setHistorialId(null)} />
      ) : null}
    </>
  )
}

function CobrosTable({
  rows,
  cuentas,
  onPrioridadChange,
  onConfirmar,
}: {
  rows: CobroAgendaItem[]
  cuentas: Array<{ id: string; bancoNombre: string; tipo: string }>
  onPrioridadChange: (id: string, prioridad: number) => Promise<void>
  onConfirmar: (id: string, body: Record<string, unknown>) => Promise<void>
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-zinc-950/80">
          <tr>
            <th className="px-3 py-3 text-left font-medium">Prioridad</th>
            <th className="px-3 py-3 text-left font-medium">Cliente</th>
            <th className="px-3 py-3 text-left font-medium">Monto</th>
            <th className="px-3 py-3 text-left font-medium">Fecha esperada</th>
            <th className="px-3 py-3 text-left font-medium">Cheque</th>
            <th className="px-3 py-3 text-left font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <tr key={row.id} className={`bg-white dark:bg-zinc-900 ${vencimientoRowClass(row.alertaVencimiento)}`}>
              <td className="px-3 py-3">
                <PrioridadInput value={row.prioridad} onCommit={(v) => onPrioridadChange(row.id, v)} />
              </td>
              <td className="px-3 py-3">
                <div className="font-medium">{row.clienteONombre}</div>
                <VencimientoAlertTag alerta={row.alertaVencimiento} />
              </td>
              <td className="px-3 py-3 tabular-nums">{formatMoneyCentavos(row.montoCentavos, 'ARS')}</td>
              <td className="px-3 py-3">{formatFecha(row.fechaEsperada)}</td>
              <td className="px-3 py-3">
                {row.cheque ? (
                  <span className="text-body-muted text-sm">Nº {row.cheque.numero}</span>
                ) : row.chequeId ? (
                  <span className="text-body-muted text-xs" title="Vínculo guardado (detalle cuando Cheques esté disponible)">
                    Vinculado
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-3">
                <button
                  type="button"
                  className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                  onClick={() => {
                    const opts = cuentas.map((c) => `${c.id}:${c.bancoNombre} ${c.tipo}`).join('\n')
                    const picked = window.prompt(`Cuenta de ingreso (cuentaId):\n${opts}`)
                    if (!picked?.trim()) return
                    const cuentaId = picked.split(':')[0]?.trim()
                    const fecha = window.prompt(
                      'Fecha confirmado (YYYY-MM-DD):',
                      new Date().toISOString().slice(0, 10),
                    )
                    void onConfirmar(row.id, { cuentaId, fechaConfirmado: fecha ?? undefined })
                  }}
                >
                  Confirmar cobro
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="text-body-muted px-4 py-8 text-center">No hay cobros esperados.</p>
      ) : null}
    </div>
  )
}

function HistorialModal({
  historial,
  onClose,
}: {
  historial: Array<{ estadoAnterior: string | null; estadoNuevo: string; fecha: string | null; nota: string | null }>
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Cerrar" onClick={onClose} />
      <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
        <h3 className="text-heading font-semibold">Historial</h3>
        <ol className="mt-4 space-y-2 text-sm">
          {historial.map((ev, i) => (
            <li key={i} className="rounded border border-neutral-200 px-3 py-2 dark:border-zinc-800">
              <p className="font-medium">
                {ev.estadoAnterior ?? 'Alta'} → {ev.estadoNuevo}
              </p>
              <p className="text-body-muted text-xs">{formatFecha(ev.fecha)}</p>
              {ev.nota ? <p className="mt-1">{ev.nota}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function AltaAgendaModal({
  tab,
  onClose,
  onSave,
}: {
  tab: Tab
  onClose: () => void
  onSave: (body: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    concepto: '',
    proveedorONombre: '',
    clienteONombre: '',
    montoPesos: '',
    fecha: '',
    prioridad: '10',
    medioPago: 'transferencia' as MedioPago,
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const monto = Number(form.montoPesos.replace(',', '.'))
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error('Monto inválido')
      return
    }
    setSaving(true)
    try {
      const montoCentavos = Math.round(monto * 100)
      const prioridad = Number(form.prioridad)
      if (tab === 'pagos') {
        await onSave({
          concepto: form.concepto,
          proveedorONombre: form.proveedorONombre,
          montoCentavos,
          fechaVencimiento: form.fecha,
          prioridad: Number.isFinite(prioridad) ? prioridad : 10,
          medioPago: form.medioPago,
        })
      } else {
        await onSave({
          clienteONombre: form.clienteONombre,
          montoCentavos,
          fechaEsperada: form.fecha,
          prioridad: Number.isFinite(prioridad) ? prioridad : 10,
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Cerrar" />
      <form onSubmit={(e) => void submit(e)} className="relative w-full max-w-md rounded-2xl bg-white p-6 dark:bg-zinc-900">
        <h2 className="text-heading text-lg font-semibold">
          {tab === 'pagos' ? 'Nuevo compromiso de pago' : 'Nuevo cobro esperado'}
        </h2>
        <div className="mt-4 grid gap-3">
          {tab === 'pagos' ? (
            <>
              <input required className="input-surface rounded-lg border px-3 py-2" placeholder="Concepto" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
              <input required className="input-surface rounded-lg border px-3 py-2" placeholder="Proveedor" value={form.proveedorONombre} onChange={(e) => setForm({ ...form, proveedorONombre: e.target.value })} />
              <select className="input-surface rounded-lg border px-3 py-2" value={form.medioPago} onChange={(e) => setForm({ ...form, medioPago: e.target.value as MedioPago })}>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="efectivo">Efectivo</option>
              </select>
            </>
          ) : (
            <input required className="input-surface rounded-lg border px-3 py-2" placeholder="Cliente" value={form.clienteONombre} onChange={(e) => setForm({ ...form, clienteONombre: e.target.value })} />
          )}
          <input required className="input-surface rounded-lg border px-3 py-2" placeholder="Monto ARS" value={form.montoPesos} onChange={(e) => setForm({ ...form, montoPesos: e.target.value })} />
          <input required type="date" className="input-surface rounded-lg border px-3 py-2" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          <input type="number" className="input-surface rounded-lg border px-3 py-2" placeholder="Prioridad (menor = más urgente)" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-brand-primary px-4 py-2 text-sm text-white">
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}
