import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  VencimientoAlertTag,
  vencimientoRowClass,
} from '../../components/finanzas/VencimientoAlert'
import { FinanzasFormField, finanzasInputClass } from '../../components/finanzas/FinanzasFormField'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { useAuth } from '../../context'
import { fetchFinanzasCuentas, type FinanzasCuenta } from '../../services/finanzasApi'
import {
  confirmarCobroAgenda,
  createCobroAgenda,
  createCompromisoAgenda,
  fetchCobroHistorial,
  fetchCobrosAgenda,
  fetchCompromisoHistorial,
  fetchCompromisosAgenda,
  marcarCompromisoPagado,
  patchCobroUrgencia,
  patchCompromisoUrgencia,
  type CobroAgendaItem,
  type CobrosAgendaVista,
  type CompromisoAgendaItem,
  type CompromisosAgendaVista,
  type MedioPago,
  type PrioridadUrgencia,
} from '../../services/finanzasAgendaApi'
import { confeccionarTransferencia } from '../../services/finanzasTransferenciasApi'

type Tab = 'pagos' | 'cobros'

const URGENCIA_LABEL: Record<PrioridadUrgencia, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR')
}

function filterCompromisosForVista(
  rows: CompromisoAgendaItem[],
  vista: CompromisosAgendaVista,
): CompromisoAgendaItem[] {
  if (vista === 'pagados') return rows.filter((r) => r.estado === 'pagado')
  return rows.filter(
    (r) =>
      r.estado === 'pendiente' ||
      r.estado === 'vencido' ||
      r.estado === 'confeccionada_pendiente_autorizacion',
  )
}

const COMPROMISO_ESTADO_CONFECCIONADA = 'confeccionada_pendiente_autorizacion'

const TRANSFERENCIA_CONFECCIONADA_MSG =
  'Confeccionada — un aprobador tiene que autorizarla en Interbanking. El sistema va a detectar solo cuándo se efectivice.'

function filterCobrosForVista(rows: CobroAgendaItem[], vista: CobrosAgendaVista): CobroAgendaItem[] {
  if (vista === 'cobrados') return rows.filter((r) => r.estado === 'confirmado')
  return rows.filter((r) => r.estado === 'esperado')
}

const MEDIO_LABEL: Record<MedioPago, string> = {
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  efectivo: 'Efectivo',
}

export function FinanzasAgendaPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('pagos')
  const [vistaPagos, setVistaPagos] = useState<CompromisosAgendaVista>('pendientes')
  const [vistaCobros, setVistaCobros] = useState<CobrosAgendaVista>('esperados')
  const [showAlta, setShowAlta] = useState(false)
  const queryClient = useQueryClient()

  const { data: compromisosRaw = [], isLoading: loadingPagos } = useQuery({
    queryKey: ['finanzas', 'agenda', 'compromisos', vistaPagos],
    queryFn: () => fetchCompromisosAgenda(vistaPagos),
    enabled: Boolean(user) && tab === 'pagos',
  })

  const { data: cobrosRaw = [], isLoading: loadingCobros } = useQuery({
    queryKey: ['finanzas', 'agenda', 'cobros', vistaCobros],
    queryFn: () => fetchCobrosAgenda(vistaCobros),
    enabled: Boolean(user) && tab === 'cobros',
  })

  const compromisos = useMemo(
    () => filterCompromisosForVista(compromisosRaw, vistaPagos),
    [compromisosRaw, vistaPagos],
  )
  const cobros = useMemo(
    () => filterCobrosForVista(cobrosRaw, vistaCobros),
    [cobrosRaw, vistaCobros],
  )

  const { data: cuentasData } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: Boolean(user),
  })

  const cuentas = cuentasData?.cuentas ?? []
  const puedeAlta =
    (tab === 'pagos' && vistaPagos === 'pendientes') || (tab === 'cobros' && vistaCobros === 'esperados')

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-heading text-2xl font-bold tracking-tight sm:text-3xl">Agenda</h1>
        <p className="text-body-muted mt-2 max-w-2xl text-sm">
          Compromisos y cobros ordenados por vencimiento; podés marcar urgencia Alta, Media o Baja para
          priorizar. Los saldos de cuenta solo reflejan sync con Interbanking.
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
            Compromisos de pago
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
        {puedeAlta ? (
          <button
            type="button"
            onClick={() => setShowAlta(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            {tab === 'pagos' ? 'Nuevo compromiso' : 'Nuevo cobro'}
          </button>
        ) : null}
      </div>

      {tab === 'pagos' ? (
        <>
          <SubVistaTabs
            options={[
              { id: 'pendientes', label: 'Pendientes' },
              { id: 'pagados', label: 'Pagados' },
            ]}
            value={vistaPagos}
            onChange={(id) => setVistaPagos(id as CompromisosAgendaVista)}
          />
          {loadingPagos ? (
            <LoadingBlock />
          ) : (
            <CompromisosTable
              rows={compromisos}
              vista={vistaPagos}
              cuentas={cuentas}
              onUrgenciaChange={async (id, urgenciaManual) => {
                await patchCompromisoUrgencia(id, urgenciaManual)
                invalidate()
              }}
              onMarcarPagado={async (id, body) => {
                await marcarCompromisoPagado(id, body)
                toast.success('Marcado como pagado')
                invalidate()
              }}
              onConfeccionar={async (id, body) => {
                await confeccionarTransferencia({ compromisoPagoId: id, ...body })
                toast.success('Transferencia confeccionada (mock). Pendiente autorización en Interbanking.')
                invalidate()
              }}
            />
          )}
        </>
      ) : (
        <>
          <SubVistaTabs
            options={[
              { id: 'esperados', label: 'Esperados' },
              { id: 'cobrados', label: 'Cobrados' },
            ]}
            value={vistaCobros}
            onChange={(id) => setVistaCobros(id as CobrosAgendaVista)}
          />
          {loadingCobros ? (
            <LoadingBlock />
          ) : (
            <CobrosTable
              rows={cobros}
              vista={vistaCobros}
              cuentas={cuentas}
              onUrgenciaChange={async (id, urgenciaManual) => {
                await patchCobroUrgencia(id, urgenciaManual)
                invalidate()
              }}
              onConfirmar={async (id, body) => {
                await confirmarCobroAgenda(id, body)
                toast.success('Cobro confirmado')
                invalidate()
              }}
            />
          )}
        </>
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

function SubVistaTabs({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="mb-3 inline-flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-zinc-900">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            value === opt.id
              ? 'bg-white text-heading shadow-sm dark:bg-zinc-800'
              : 'text-body-muted hover:text-heading'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
    </div>
  )
}

function UrgenciaSelect({
  value,
  onChange,
  disabled,
}: {
  value: PrioridadUrgencia | null
  onChange: (v: PrioridadUrgencia | null) => void
  disabled?: boolean
}) {
  return (
    <select
      disabled={disabled}
      className="input-surface max-w-[7.5rem] rounded border px-2 py-1 text-sm"
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value
        onChange(v === '' ? null : (v as PrioridadUrgencia))
      }}
    >
      <option value="">Por fecha</option>
      <option value="alta">Alta</option>
      <option value="media">Media</option>
      <option value="baja">Baja</option>
    </select>
  )
}

function CompromisosTable({
  rows,
  vista,
  cuentas,
  onUrgenciaChange,
  onMarcarPagado,
  onConfeccionar,
}: {
  rows: CompromisoAgendaItem[]
  vista: CompromisosAgendaVista
  cuentas: FinanzasCuenta[]
  onUrgenciaChange: (id: string, urgenciaManual: PrioridadUrgencia | null) => Promise<void>
  onMarcarPagado: (id: string, body: Record<string, unknown>) => Promise<void>
  onConfeccionar: (
    id: string,
    body: { cuentaCreditoCbu: string; cuentaDebitoId: string },
  ) => Promise<void>
}) {
  const [historialId, setHistorialId] = useState<string | null>(null)
  const [marcarRow, setMarcarRow] = useState<CompromisoAgendaItem | null>(null)
  const [confeccionarRow, setConfeccionarRow] = useState<CompromisoAgendaItem | null>(null)
  const cuentasCc = useMemo(() => cuentas.filter((c) => c.tipo === 'CC'), [cuentas])
  const { data: historial = [] } = useQuery({
    queryKey: ['finanzas', 'agenda', 'historial', 'compromiso', historialId],
    queryFn: () => fetchCompromisoHistorial(historialId!),
    enabled: Boolean(historialId),
  })

  const emptyMsg = vista === 'pagados' ? 'No hay pagos registrados.' : 'No hay pagos pendientes.'

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-zinc-950/80">
            <tr>
              {vista === 'pendientes' ? (
                <th className="px-3 py-3 text-left font-medium">Urgencia</th>
              ) : null}
              <th className="px-3 py-3 text-left font-medium">Concepto</th>
              <th className="px-3 py-3 text-left font-medium">Monto</th>
              <th className="px-3 py-3 text-left font-medium">
                {vista === 'pagados' ? 'Pagado el' : 'Vencimiento'}
              </th>
              {vista === 'pendientes' ? (
                <>
                  <th className="px-3 py-3 text-left font-medium">Medio previsto</th>
                  <th className="px-3 py-3 text-left font-medium">Cheque</th>
                </>
              ) : null}
              <th className="px-3 py-3 text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`bg-white dark:bg-zinc-900 ${
                  vista === 'pendientes' ? vencimientoRowClass(row.alertaVencimiento) : ''
                }`}
              >
                {vista === 'pendientes' ? (
                  <td className="px-3 py-3">
                    <UrgenciaSelect
                      value={row.urgenciaManual}
                      onChange={(v) => void onUrgenciaChange(row.id, v)}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-3">
                  <div className="font-medium">{row.concepto}</div>
                  <div className="text-body-muted text-xs">{row.proveedorONombre}</div>
                  {row.estado === COMPROMISO_ESTADO_CONFECCIONADA ? (
                    <p className="mt-2 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      {TRANSFERENCIA_CONFECCIONADA_MSG}
                    </p>
                  ) : null}
                  {vista === 'pendientes' ? (
                    <div className="mt-1">
                      <VencimientoAlertTag alerta={row.alertaVencimiento} />
                    </div>
                  ) : row.urgenciaManual ? (
                    <div className="text-body-muted mt-1 text-xs">Urgencia: {URGENCIA_LABEL[row.urgenciaManual]}</div>
                  ) : null}
                </td>
                <td className="px-3 py-3 tabular-nums">{formatMoneyCentavos(row.montoCentavos, 'ARS')}</td>
                <td className="px-3 py-3">
                  {formatFecha(
                    vista === 'pagados'
                      ? row.fechaPago ?? row.updatedAt ?? null
                      : row.fechaVencimiento,
                  )}
                </td>
                {vista === 'pendientes' ? (
                  <>
                    <td className="px-3 py-3">{MEDIO_LABEL[row.medioPago]}</td>
                    <td className="px-3 py-3">
                      {row.cheque ? (
                        <span className="text-body-muted text-sm" title={`Estado: ${row.cheque.estadoLabel}`}>
                          Nº {row.cheque.numero}
                        </span>
                      ) : row.chequeId ? (
                        <span
                          className="text-body-muted text-xs"
                          title="Vínculo guardado (detalle cuando Cheques esté disponible)"
                        >
                          Vinculado
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </>
                ) : null}
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs font-medium"
                      onClick={() => setHistorialId(row.id)}
                    >
                      Historial
                    </button>
                    {vista === 'pendientes' &&
                    row.medioPago === 'transferencia' &&
                    (row.estado === 'pendiente' || row.estado === 'vencido') ? (
                      <button
                        type="button"
                        className="rounded bg-brand-primary px-2 py-1 text-xs font-medium text-white"
                        onClick={() => setConfeccionarRow(row)}
                      >
                        Confeccionar por API
                      </button>
                    ) : null}
                    {vista === 'pendientes' &&
                    row.estado !== COMPROMISO_ESTADO_CONFECCIONADA &&
                    !(row.medioPago === 'transferencia' && (row.estado === 'pendiente' || row.estado === 'vencido')) ? (
                      <button
                        type="button"
                        className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                        onClick={() => setMarcarRow(row)}
                      >
                        Marcar pagado
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="text-body-muted px-4 py-8 text-center">{emptyMsg}</p> : null}
      </div>
      {historialId ? (
        <HistorialModal historial={historial} onClose={() => setHistorialId(null)} />
      ) : null}
      {marcarRow ? (
        <MarcarPagadoModal
          row={marcarRow}
          cuentas={cuentas}
          onClose={() => setMarcarRow(null)}
          onSubmit={async (body) => {
            await onMarcarPagado(marcarRow.id, body)
            setMarcarRow(null)
          }}
        />
      ) : null}
      {confeccionarRow ? (
        <ConfeccionarTransferenciaModal
          row={confeccionarRow}
          cuentasCc={cuentasCc}
          onClose={() => setConfeccionarRow(null)}
          onSubmit={async (body) => {
            await onConfeccionar(confeccionarRow.id, body)
            setConfeccionarRow(null)
          }}
        />
      ) : null}
    </>
  )
}

function ConfeccionarTransferenciaModal({
  row,
  cuentasCc,
  onClose,
  onSubmit,
}: {
  row: CompromisoAgendaItem
  cuentasCc: FinanzasCuenta[]
  onClose: () => void
  onSubmit: (body: { cuentaCreditoCbu: string; cuentaDebitoId: string }) => Promise<void>
}) {
  const [cuentaDebitoId, setCuentaDebitoId] = useState(
    row.cuentaId && cuentasCc.some((c) => c.id === row.cuentaId) ? row.cuentaId : (cuentasCc[0]?.id ?? ''),
  )
  const [cbu, setCbu] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="surface-card w-full max-w-lg rounded-2xl border border-neutral-200 p-6 dark:border-zinc-700">
        <h2 className="text-heading text-lg font-semibold">Confeccionar transferencia (mock)</h2>
        <p className="text-body-muted mt-2 text-sm">
          Se enviará a Interbanking para confección. La autorización y el envío del dinero ocurren solo en
          la plataforma del banco.
        </p>
        <p className="text-body-muted mt-2 text-sm">
          <span className="text-heading font-medium">{row.concepto}</span> —{' '}
          {formatMoneyCentavos(row.montoCentavos, 'ARS')}
        </p>
        <div className="mt-4 space-y-3">
          <FinanzasFormField label="Cuenta de débito (CC)" htmlFor="conf-debito">
            <select
              id="conf-debito"
              className={finanzasInputClass}
              value={cuentaDebitoId}
              onChange={(e) => setCuentaDebitoId(e.target.value)}
            >
              {cuentasCc.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.bancoNombre} — {c.id}
                </option>
              ))}
            </select>
          </FinanzasFormField>
          <FinanzasFormField label="CBU cuenta crédito (22 dígitos)" htmlFor="conf-cbu">
            <input
              id="conf-cbu"
              className={finanzasInputClass}
              inputMode="numeric"
              value={cbu}
              onChange={(e) => setCbu(e.target.value)}
              placeholder="Ej. 2850590940090418135201"
            />
          </FinanzasFormField>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !cuentaDebitoId}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => {
              setSaving(true)
              void onSubmit({ cuentaCreditoCbu: cbu, cuentaDebitoId })
                .catch((err: unknown) => {
                  toast.error(err instanceof Error ? err.message : 'Error al confeccionar')
                })
                .finally(() => setSaving(false))
            }}
          >
            {saving ? 'Confeccionando…' : 'Confeccionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CobrosTable({
  rows,
  vista,
  cuentas,
  onUrgenciaChange,
  onConfirmar,
}: {
  rows: CobroAgendaItem[]
  vista: CobrosAgendaVista
  cuentas: FinanzasCuenta[]
  onUrgenciaChange: (id: string, urgenciaManual: PrioridadUrgencia | null) => Promise<void>
  onConfirmar: (id: string, body: Record<string, unknown>) => Promise<void>
}) {
  const [historialId, setHistorialId] = useState<string | null>(null)
  const [confirmarRow, setConfirmarRow] = useState<CobroAgendaItem | null>(null)
  const { data: historial = [] } = useQuery({
    queryKey: ['finanzas', 'agenda', 'historial', 'cobro', historialId],
    queryFn: () => fetchCobroHistorial(historialId!),
    enabled: Boolean(historialId),
  })

  const emptyMsg = vista === 'cobrados' ? 'No hay cobros confirmados.' : 'No hay cobros esperados.'

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-zinc-950/80">
            <tr>
              {vista === 'esperados' ? <th className="px-3 py-3 text-left font-medium">Urgencia</th> : null}
              <th className="px-3 py-3 text-left font-medium">Cliente</th>
              <th className="px-3 py-3 text-left font-medium">Monto</th>
              <th className="px-3 py-3 text-left font-medium">
                {vista === 'cobrados' ? 'Cobrado el' : 'Fecha esperada'}
              </th>
              <th className="px-3 py-3 text-left font-medium">Cheque</th>
              <th className="px-3 py-3 text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`bg-white dark:bg-zinc-900 ${
                  vista === 'esperados' ? vencimientoRowClass(row.alertaVencimiento) : ''
                }`}
              >
                {vista === 'esperados' ? (
                  <td className="px-3 py-3">
                    <UrgenciaSelect
                      value={row.urgenciaManual}
                      onChange={(v) => void onUrgenciaChange(row.id, v)}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-3">
                  <div className="font-medium">{row.clienteONombre}</div>
                  {vista === 'esperados' ? (
                    <VencimientoAlertTag alerta={row.alertaVencimiento} />
                  ) : row.urgenciaManual ? (
                    <div className="text-body-muted text-xs">Urgencia: {URGENCIA_LABEL[row.urgenciaManual]}</div>
                  ) : null}
                </td>
                <td className="px-3 py-3 tabular-nums">{formatMoneyCentavos(row.montoCentavos, 'ARS')}</td>
                <td className="px-3 py-3">
                  {formatFecha(
                    vista === 'cobrados'
                      ? row.fechaConfirmado ?? row.updatedAt ?? null
                      : row.fechaEsperada,
                  )}
                </td>
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
                    {vista === 'esperados' ? (
                      <button
                        type="button"
                        className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                        onClick={() => setConfirmarRow(row)}
                      >
                        Confirmar cobro
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="text-body-muted px-4 py-8 text-center">{emptyMsg}</p> : null}
      </div>
      {historialId ? (
        <HistorialModal historial={historial} onClose={() => setHistorialId(null)} />
      ) : null}
      {confirmarRow ? (
        <ConfirmarCobroModal
          row={confirmarRow}
          cuentas={cuentas}
          onClose={() => setConfirmarRow(null)}
          onSubmit={async (body) => {
            await onConfirmar(confirmarRow.id, body)
            setConfirmarRow(null)
          }}
        />
      ) : null}
    </>
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
    urgenciaManual: '' as '' | PrioridadUrgencia,
    medioPago: 'transferencia' as MedioPago,
    esViatico: false,
    beneficiarioEmpleado: '',
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
      const urgenciaManual = form.urgenciaManual === '' ? null : form.urgenciaManual
      if (tab === 'pagos') {
        await onSave({
          concepto: form.concepto,
          proveedorONombre: form.proveedorONombre,
          montoCentavos,
          fechaVencimiento: form.fecha,
          urgenciaManual,
          medioPago: form.medioPago,
          esViatico: form.medioPago === 'transferencia' && form.esViatico,
          beneficiarioEmpleado:
            form.medioPago === 'transferencia' && form.esViatico
              ? form.beneficiarioEmpleado.trim()
              : null,
        })
      } else {
        await onSave({
          clienteONombre: form.clienteONombre,
          montoCentavos,
          fechaEsperada: form.fecha,
          urgenciaManual,
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
              <FinanzasFormField label="Concepto" htmlFor="agenda-alta-concepto">
                <input
                  id="agenda-alta-concepto"
                  required
                  className={finanzasInputClass}
                  value={form.concepto}
                  onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                />
              </FinanzasFormField>
              <FinanzasFormField label="Proveedor" htmlFor="agenda-alta-proveedor">
                <input
                  id="agenda-alta-proveedor"
                  required
                  className={finanzasInputClass}
                  value={form.proveedorONombre}
                  onChange={(e) => setForm({ ...form, proveedorONombre: e.target.value })}
                />
              </FinanzasFormField>
              <FinanzasFormField label="Medio de pago previsto" htmlFor="agenda-alta-medio">
                <select
                  id="agenda-alta-medio"
                  className={finanzasInputClass}
                  value={form.medioPago}
                  onChange={(e) => setForm({ ...form, medioPago: e.target.value as MedioPago })}
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="efectivo">Efectivo</option>
                </select>
              </FinanzasFormField>
              {form.medioPago === 'transferencia' ? (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.esViatico}
                      onChange={(e) => setForm({ ...form, esViatico: e.target.checked })}
                    />
                    Viático (transferencia bancaria)
                  </label>
                  {form.esViatico ? (
                    <FinanzasFormField label="Beneficiario (empleado)" htmlFor="agenda-alta-viatico">
                      <input
                        id="agenda-alta-viatico"
                        required
                        className={finanzasInputClass}
                        value={form.beneficiarioEmpleado}
                        onChange={(e) => setForm({ ...form, beneficiarioEmpleado: e.target.value })}
                      />
                    </FinanzasFormField>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <FinanzasFormField label="Cliente" htmlFor="agenda-alta-cliente">
              <input
                id="agenda-alta-cliente"
                required
                className={finanzasInputClass}
                value={form.clienteONombre}
                onChange={(e) => setForm({ ...form, clienteONombre: e.target.value })}
              />
            </FinanzasFormField>
          )}
          <FinanzasFormField label="Monto" htmlFor="agenda-alta-monto">
            <input
              id="agenda-alta-monto"
              required
              className={finanzasInputClass}
              inputMode="decimal"
              placeholder="Ej. 150000,50 (ARS)"
              value={form.montoPesos}
              onChange={(e) => setForm({ ...form, montoPesos: e.target.value })}
            />
          </FinanzasFormField>
          <FinanzasFormField
            label={tab === 'pagos' ? 'Fecha de vencimiento' : 'Fecha esperada'}
            htmlFor="agenda-alta-fecha"
          >
            <input
              id="agenda-alta-fecha"
              required
              type="date"
              className={finanzasInputClass}
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            />
          </FinanzasFormField>
          <FinanzasFormField label="Urgencia" htmlFor="agenda-alta-urgencia" optional>
            <select
              id="agenda-alta-urgencia"
              className={finanzasInputClass}
              value={form.urgenciaManual}
              onChange={(e) =>
                setForm({
                  ...form,
                  urgenciaManual: e.target.value as '' | PrioridadUrgencia,
                })
              }
            >
              <option value="">Por fecha de vencimiento</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </FinanzasFormField>
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

function MarcarPagadoModal({
  row,
  cuentas,
  onClose,
  onSubmit,
}: {
  row: CompromisoAgendaItem
  cuentas: FinanzasCuenta[]
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [medioPago, setMedioPago] = useState<MedioPago>(row.medioPago)
  const [cuentaId, setCuentaId] = useState('')
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10))

  const needsCuenta = medioPago === 'transferencia' || medioPago === 'efectivo'
  const cuenta = needsCuenta && cuentaId ? cuentas.find((c) => c.id === cuentaId) : undefined
  const saldoInsuficiente =
    Boolean(cuenta) &&
    typeof cuenta!.saldoActualCentavos === 'number' &&
    cuenta!.saldoActualCentavos < row.montoCentavos

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (needsCuenta && !cuentaId) {
      toast.error('Seleccioná la cuenta de pago')
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        medioPago,
        cuentaId: needsCuenta ? cuentaId : undefined,
        fechaPago,
      })
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
        <h2 className="text-heading text-lg font-semibold">Marcar pagado</h2>
        <p className="text-body-muted mt-1 text-sm">
          {row.concepto} — {row.proveedorONombre} · {formatMoneyCentavos(row.montoCentavos, 'ARS')}
        </p>
        {saldoInsuficiente ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            El saldo de esta cuenta es menor al monto. Podés confirmar igual si el pago ya ocurrió fuera del sistema.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3">
          <FinanzasFormField label="Medio de pago real" htmlFor="agenda-pagado-medio">
            <select
              id="agenda-pagado-medio"
              className={finanzasInputClass}
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value as MedioPago)}
            >
              <option value="transferencia">Transferencia</option>
              <option value="cheque">Cheque</option>
              <option value="efectivo">Efectivo</option>
            </select>
          </FinanzasFormField>
          {needsCuenta ? (
            <FinanzasFormField label="Cuenta de pago" htmlFor="agenda-pagado-cuenta">
              <select
                id="agenda-pagado-cuenta"
                required
                className={finanzasInputClass}
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                disabled={cuentas.length === 0}
              >
                <option value="">
                  {cuentas.length === 0 ? 'No hay cuentas disponibles para vincular' : 'Seleccioná la cuenta'}
                </option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.bancoNombre} — {c.tipoLabel} ({formatMoneyCentavos(c.saldoActualCentavos, c.moneda)})
                  </option>
                ))}
              </select>
            </FinanzasFormField>
          ) : null}
          <FinanzasFormField label="Fecha de pago" htmlFor="agenda-pagado-fecha">
            <input
              id="agenda-pagado-fecha"
              required
              type="date"
              className={finanzasInputClass}
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </FinanzasFormField>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-brand-primary px-4 py-2 text-sm text-white">
            Confirmar pago
          </button>
        </div>
      </form>
    </div>
  )
}

function ConfirmarCobroModal({
  row,
  cuentas,
  onClose,
  onSubmit,
}: {
  row: CobroAgendaItem
  cuentas: FinanzasCuenta[]
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [cuentaId, setCuentaId] = useState('')
  const [fechaConfirmado, setFechaConfirmado] = useState(() => new Date().toISOString().slice(0, 10))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cuentaId) {
      toast.error('Seleccioná la cuenta de ingreso')
      return
    }
    setSaving(true)
    try {
      await onSubmit({ cuentaId, fechaConfirmado })
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
        <h2 className="text-heading text-lg font-semibold">Confirmar cobro</h2>
        <p className="text-body-muted mt-1 text-sm">{row.clienteONombre}</p>
        <div className="mt-4 grid gap-3">
          <FinanzasFormField label="Cuenta de ingreso" htmlFor="agenda-cobro-cuenta">
            <select
              id="agenda-cobro-cuenta"
              required
              className={finanzasInputClass}
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              disabled={cuentas.length === 0}
            >
              <option value="">
                {cuentas.length === 0 ? 'No hay cuentas disponibles para vincular' : 'Seleccioná la cuenta'}
              </option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.bancoNombre} — {c.tipoLabel} ({c.moneda})
                </option>
              ))}
            </select>
          </FinanzasFormField>
          <FinanzasFormField label="Fecha confirmado" htmlFor="agenda-cobro-fecha">
            <input
              id="agenda-cobro-fecha"
              required
              type="date"
              className={finanzasInputClass}
              value={fechaConfirmado}
              onChange={(e) => setFechaConfirmado(e.target.value)}
            />
          </FinanzasFormField>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-brand-primary px-4 py-2 text-sm text-white">
            Confirmar cobro
          </button>
        </div>
      </form>
    </div>
  )
}
