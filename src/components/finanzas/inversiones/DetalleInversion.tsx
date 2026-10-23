import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { ComoLoPagasModal } from '../hoy/ComoLoPagasModal'
import { NuevaTransferenciaModal, type PrecargaTransferenciaHoy } from '../NuevaTransferenciaModal'
import { usePermisosFinanzas } from '../permisosFinanzas'
import { formatMoneyCentavos } from '../formatMoney'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import {
  anularInversion,
  aprobarInversion,
  enlaceDocumentoInversion,
  enviarAAprobacion,
  fetchInversion,
  quitarDocumentoInversion,
  rechazarInversion,
  subirDocumentoInversion,
  type CuotaDetalle,
  type DocumentoInversion,
  type EstadoCuota,
  type InversionDetalle,
  type MedioIngreso,
} from '../../../services/finanzasInversionesApi'
import { pagarHoyCombinado, type PagoHoy } from '../../../services/finanzasHoyApi'
import { FormInversion } from './FormInversion'
import { CuotaEnPesosModal } from './CuotaEnPesosModal'
import { RegistrarIngresoModal } from './RegistrarIngresoModal'
import { FichaInversorModal } from './FichaInversorModal'
import { textoEstado, textoSistema, textoTasa } from './textosInversiones'

function formatFecha(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

const TEXTO_CUOTA: Record<EstadoCuota, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  pagada: 'Pagada',
  atrasada: 'Atrasada',
  anulada: 'Anulada',
  renovada: 'Renovada',
}

const TEXTO_MEDIO_INGRESO: Record<MedioIngreso, string> = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  cheque: 'Cheque',
}

const TEXTO_DOC: Record<DocumentoInversion['tipo'], string> = {
  mutuo: 'Mutuo',
  pagare: 'Pagaré',
  otro: 'Otro',
}

const ABIERTAS: ReadonlySet<EstadoCuota> = new Set(['pendiente', 'parcial', 'atrasada'])

function franjaClase(estado: InversionDetalle['estado']): string {
  switch (estado) {
    case 'vigente':
      return 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100'
    case 'pendiente_aprobacion':
      return 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
    case 'borrador':
      return 'border-neutral-300 bg-neutral-50 text-neutral-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-200'
    case 'anulada':
      return 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
    default:
      return 'border-neutral-200 bg-white text-heading dark:border-zinc-700 dark:bg-zinc-900'
  }
}

function textoPeriodicidad(p: string): string {
  const map: Record<string, string> = {
    mensual: 'mensual',
    bimestral: 'bimestral',
    trimestral: 'trimestral',
    cuatrimestral: 'cuatrimestral',
    semestral: 'semestral',
    anual: 'anual',
  }
  return map[p] ?? p
}

function textoMedioDev(m: string): string {
  switch (m) {
    case 'transferencia_ars':
      return 'transferencia en pesos'
    case 'transferencia_usd':
      return 'transferencia en dólares'
    case 'efectivo':
      return 'efectivo'
    case 'cheque':
      return 'cheque'
    default:
      return m
  }
}

function condicionesEnPalabras(d: InversionDetalle): string {
  const c = d.condiciones
  const partes = [
    c.moneda === 'USD' ? 'Dólares' : 'Pesos',
    formatMoneyCentavos(c.capitalCentavos, c.moneda),
    textoSistema(c.sistema),
    textoTasa(c.tasa),
    `cada ${textoPeriodicidad(c.periodicidad)}`,
  ]
  if (c.sinVencimiento) partes.push('sin fecha de devolución')
  else partes.push(`${c.cantidadCuotas} cuota${c.cantidadCuotas === 1 ? '' : 's'}`)
  partes.push(`entra por ${TEXTO_MEDIO_INGRESO[c.medioIngresoPrevisto].toLowerCase()}`)
  partes.push(`devuelve por ${c.mediosDevolucion.map(textoMedioDev).join(', ')}`)
  return partes.join(' · ')
}

function MotivoModal({
  titulo,
  confirmacion,
  onClose,
  onConfirmar,
  enviando,
}: {
  titulo: string
  confirmacion: string
  onClose: () => void
  onConfirmar: (motivo: string) => void
  enviando: boolean
}) {
  const [motivo, setMotivo] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="surface-card w-full max-w-md rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700 sm:p-6"
      >
        <h2 className="text-heading text-lg font-semibold">{titulo}</h2>
        <p className="text-body-muted mt-2 text-sm">{confirmacion}</p>
        <div className="mt-4">
          <FinanzasFormField label="Motivo" htmlFor="di-motivo">
            <textarea
              id="di-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando || !motivo.trim()}
            onClick={() => {
              if (!window.confirm(confirmacion)) return
              onConfirmar(motivo.trim())
            }}
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function pagoDesdeCuota(d: InversionDetalle, c: CuotaDetalle): PagoHoy {
  return {
    id: c.compromisoId!,
    urgencia: 'Normal',
    vencido: c.estado === 'atrasada',
    vencidoTexto: null,
    aQuien: d.inversorNombre,
    concepto: `Inversión ${d.numero} · Cuota ${c.numero}`,
    montoCentavos: c.restanteCentavos > 0 ? c.restanteCentavos : c.aPagarCentavos,
    comoPagar: '',
    medioPago: 'transferencia',
    proveedorONombre: d.inversorNombre,
    sugerenciasBanco: [],
    moneda: c.monedaPago,
  }
}

export function DetalleInversion({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { aprobarInversiones } = usePermisosFinanzas()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['finanzas', 'inversiones', id],
    queryFn: () => fetchInversion(id),
  })

  const [editando, setEditando] = useState(false)
  const [fichaInversor, setFichaInversor] = useState(false)
  const [pagoModo, setPagoModo] = useState<PagoHoy | null>(null)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [transferencia, setTransferencia] = useState<PrecargaTransferenciaHoy | null>(null)
  const [cuotaPesos, setCuotaPesos] = useState<CuotaDetalle | null>(null)
  const [ingresoAbierto, setIngresoAbierto] = useState(false)
  const [motivoAccion, setMotivoAccion] = useState<'anular' | 'rechazar' | null>(null)
  const [enviandoAccion, setEnviandoAccion] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [subiendoDoc, setSubiendoDoc] = useState(false)
  const [tipoDoc, setTipoDoc] = useState<DocumentoInversion['tipo']>('mutuo')

  const alActualizar = (detalle: InversionDetalle) => {
    void queryClient.setQueryData(['finanzas', 'inversiones', id], detalle)
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'inversiones'] })
  }

  if (editando && data) {
    return (
      <FormInversion
        modo="editar"
        inversionId={id}
        inicial={data}
        onCerrar={() => setEditando(false)}
        onGuardado={(detalle) => {
          alActualizar(detalle)
          setEditando(false)
        }}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate('/finanzas/inversiones')}
          className="text-sm font-medium text-brand-primary hover:underline"
        >
          ← Volver a Inversores
        </button>
        <p className="text-danger mt-4 text-sm">
          {error instanceof Error ? error.message : 'No pude traer la inversión'}
        </p>
      </div>
    )
  }

  const d = data
  const moneda = d.condiciones.moneda
  const faltaIngresar = Math.max(0, d.ingresoEsperadoCentavos - d.ingresadoCentavos)
  // RG 830 se calcula por cuota: si dos cuotas con retención caen el mismo mes, el mínimo no imponible podría ser mensual.
  const mesesConRetencion = d.cronograma
    .filter((c) => c.retencionCentavos > 0)
    .map((c) => c.fechaVencimiento.slice(0, 7))
  const mesesRepetidos = [...new Set(mesesConRetencion.filter((m, i) => mesesConRetencion.indexOf(m) !== i))]

  const correrAccion = async (tarea: () => Promise<InversionDetalle>) => {
    setErrorAccion(null)
    setEnviandoAccion(true)
    try {
      const detalle = await tarea()
      alActualizar(detalle)
      setMotivoAccion(null)
      toast.success('Listo')
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo completar')
    } finally {
      setEnviandoAccion(false)
    }
  }

  const abrirDoc = async (docId: string) => {
    try {
      // La pestaña se abre antes del await: si se abre después, el navegador la bloquea como popup.
      const pestana = window.open('', '_blank')
      try {
        const { url } = await enlaceDocumentoInversion(id, docId)
        if (pestana) {
          pestana.opener = null
          pestana.location.href = url
        } else {
          window.open(url, '_blank', 'noopener,noreferrer')
        }
      } catch (e) {
        pestana?.close()
        throw e
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude abrir el documento')
    }
  }

  const subirDoc = async (archivo: File) => {
    setSubiendoDoc(true)
    try {
      const detalle = await subirDocumentoInversion(id, archivo, tipoDoc)
      alActualizar(detalle)
      toast.success('Documento adjunto')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude adjuntar el documento')
    } finally {
      setSubiendoDoc(false)
    }
  }

  const quitarDoc = async (docId: string) => {
    if (!window.confirm('¿Quitar este documento? No se borra el archivo.')) return
    try {
      const detalle = await quitarDocumentoInversion(id, docId)
      alActualizar(detalle)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude quitar el documento')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate('/finanzas/inversiones')}
            className="text-sm font-medium text-brand-primary hover:underline"
          >
            ← Volver a Inversores
          </button>
          <h1 className="text-heading mt-2 text-2xl font-bold tracking-tight">{d.numero}</h1>
          <button
            type="button"
            onClick={() => setFichaInversor(true)}
            className="mt-1 text-sm font-medium text-brand-primary hover:underline"
          >
            {d.inversorNombre}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.permisos.editar ? (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Editar
            </button>
          ) : null}
          {d.permisos.enviar ? (
            <button
              type="button"
              disabled={enviandoAccion}
              onClick={() => {
                if (!window.confirm('¿Enviar esta inversión a aprobación?')) return
                void correrAccion(() => enviarAAprobacion(id, null))
              }}
              className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              Enviar a aprobación
            </button>
          ) : null}
          {d.permisos.aprobar && aprobarInversiones ? (
            <>
              <button
                type="button"
                disabled={enviandoAccion}
                onClick={() => {
                  if (!window.confirm('¿Aprobar esta inversión?')) return
                  void correrAccion(() => aprobarInversion(id, null))
                }}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                Aprobar
              </button>
              <button
                type="button"
                disabled={enviandoAccion}
                onClick={() => setMotivoAccion('rechazar')}
                className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950"
              >
                Rechazar
              </button>
            </>
          ) : null}
          {d.permisos.anular ? (
            <button
              type="button"
              disabled={enviandoAccion}
              onClick={() => setMotivoAccion('anular')}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Anular
            </button>
          ) : null}
        </div>
      </div>

      {errorAccion ? <p className="text-danger text-sm">{errorAccion}</p> : null}

      <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${franjaClase(d.estado)}`}>
        {textoEstado(d.estado)}
      </div>

      <section className="space-y-2 text-sm">
        <p>{condicionesEnPalabras(d)}</p>
        <p className="tabular-nums">
          <span className="text-body-muted">Deuda de hoy: </span>
          {formatMoneyCentavos(d.deudaHoyCentavos, moneda)}
        </p>
        <p className="tabular-nums">
          <span className="text-body-muted">Ingresado / esperado: </span>
          {formatMoneyCentavos(d.ingresadoCentavos, moneda)} /{' '}
          {formatMoneyCentavos(d.ingresoEsperadoCentavos, moneda)}
        </p>
        {(d.alertas.cuotasAtrasadas > 0 || d.alertas.porVencer || d.alertas.proximaCuota) && (
          <p className="text-amber-900 dark:text-amber-100">
            {[
              d.alertas.cuotasAtrasadas > 0
                ? d.alertas.cuotasAtrasadas === 1
                  ? '1 cuota atrasada'
                  : `${d.alertas.cuotasAtrasadas} cuotas atrasadas`
                : null,
              d.alertas.porVencer
                ? d.alertas.diasParaVencer == null
                  ? 'Por vencer'
                  : d.alertas.diasParaVencer === 0
                    ? 'Vence hoy'
                    : `Vence en ${d.alertas.diasParaVencer} día${d.alertas.diasParaVencer === 1 ? '' : 's'}`
                : null,
              d.alertas.proximaCuota
                ? `Próxima cuota ${formatFecha(d.alertas.proximaCuota.fecha)} · ${formatMoneyCentavos(d.alertas.proximaCuota.montoCentavos, moneda)}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </section>

      {d.avisosAgenda.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">Avisos de la Agenda</p>
          <ul className="mt-1 list-inside list-disc">
            {d.avisosAgenda.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section>
        <h2 className="text-heading text-sm font-semibold">Cronograma</h2>
        {mesesRepetidos.length > 0 ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Hay dos o más cuotas con retención en el mismo mes ({mesesRepetidos.join(', ')}). La retención de
            Ganancias se calcula por cuota: revisala con el contador.
          </p>
        ) : null}
        <div className="mt-2 overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-zinc-950/80">
              <tr>
                <th className="px-3 py-2 text-left font-medium">N°</th>
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">A pagar</th>
                <th className="px-3 py-2 text-right font-medium">Pagado</th>
                <th className="px-3 py-2 text-right font-medium">Restante</th>
                <th className="px-3 py-2 text-right font-medium">Retención</th>
                <th className="px-3 py-2 text-left font-medium">Cómo se pagó</th>
                <th className="px-3 py-2 text-left font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
              {d.cronograma.map((c) => {
                const abierta = ABIERTAS.has(c.estado) && c.compromisoId
                return (
                  <tr key={c.numero}>
                    <td className="px-3 py-2 tabular-nums">{c.numero}</td>
                    <td className="px-3 py-2">{formatFecha(c.fechaVencimiento)}</td>
                    <td className="px-3 py-2">{TEXTO_CUOTA[c.estado]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoneyCentavos(c.aPagarCentavos, c.monedaPago)}
                      {c.monedaPago !== moneda ? (
                        <span className="text-body-muted block text-xs">en {c.monedaPago}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoneyCentavos(c.pagadoCentavos, c.monedaPago)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoneyCentavos(c.restanteCentavos, c.monedaPago)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.retencionCentavos > 0
                        ? formatMoneyCentavos(c.retencionCentavos, moneda)
                        : '—'}
                    </td>
                    <td className="px-3 py-2">{c.comoSePago ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {abierta ? (
                          <button
                            type="button"
                            onClick={() => setPagoModo(pagoDesdeCuota(d, c))}
                            className="rounded-lg bg-brand-primary px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                          >
                            Pagar
                          </button>
                        ) : null}
                        {moneda === 'USD' && ABIERTAS.has(c.estado) ? (
                          <button
                            type="button"
                            onClick={() => setCuotaPesos(c)}
                            className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          >
                            {c.enPesos ? 'Tipo de cambio' : 'Pagar en pesos'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {d.cronograma.length === 0 ? (
            <p className="text-body-muted px-4 py-6 text-center text-sm">No hay cuotas en el cronograma.</p>
          ) : null}
        </div>
        <p className="text-body-muted mt-2 text-sm tabular-nums">
          Totales · capital {formatMoneyCentavos(d.totales.capitalCentavos, moneda)} · interés{' '}
          {formatMoneyCentavos(d.totales.interesCentavos, moneda)} · total{' '}
          {formatMoneyCentavos(d.totales.totalCentavos, moneda)}
        </p>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading text-sm font-semibold">Ingresos</h2>
          {d.permisos.registrarIngreso ? (
            <button
              type="button"
              onClick={() => setIngresoAbierto(true)}
              className="rounded-xl bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Registrar ingreso
            </button>
          ) : null}
        </div>
        {d.ingresos.length === 0 ? (
          <p className="text-body-muted text-sm">Todavía no entró capital.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-zinc-800 dark:border-zinc-800">
            {d.ingresos.map((ing) => (
              <li key={ing.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {formatFecha(ing.fecha)} · {TEXTO_MEDIO_INGRESO[ing.medio]}
                  {ing.importado ? ' · importado' : ''}
                </span>
                <span className="tabular-nums font-medium">
                  {formatMoneyCentavos(ing.montoCentavos, moneda)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-heading text-sm font-semibold">Documentos</h2>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <FinanzasFormField label="Tipo" htmlFor="di-doc-tipo">
            <select
              id="di-doc-tipo"
              value={tipoDoc}
              onChange={(e) => setTipoDoc(e.target.value as DocumentoInversion['tipo'])}
              className={finanzasInputClass}
            >
              <option value="mutuo">Mutuo</option>
              <option value="pagare">Pagaré</option>
              <option value="otro">Otro</option>
            </select>
          </FinanzasFormField>
          <FinanzasFormField label="PDF" htmlFor="di-doc-file">
            <input
              id="di-doc-file"
              type="file"
              accept="application/pdf,.pdf"
              disabled={subiendoDoc}
              className="block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void subirDoc(f)
              }}
            />
          </FinanzasFormField>
        </div>
        {d.documentos.length === 0 ? (
          <p className="text-body-muted mt-2 text-sm">No hay documentos adjuntos.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-zinc-800 dark:border-zinc-800">
            {d.documentos.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => void abrirDoc(doc.id)}
                  className="font-medium text-brand-primary hover:underline"
                >
                  {TEXTO_DOC[doc.tipo]} · {doc.nombre}
                </button>
                <button
                  type="button"
                  onClick={() => void quitarDoc(doc.id)}
                  className="text-xs text-neutral-600 hover:underline dark:text-gray-300"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.historialPlanilla && d.historialPlanilla.length > 0 ? (
        <section>
          <h2 className="text-heading text-sm font-semibold">Pagos de antes, según la planilla de compromisos</h2>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Mes</th>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                {d.historialPlanilla.map((p, i) => (
                  <tr key={`${p.mes}-${p.fecha}-${i}`}>
                    <td className="px-3 py-2">{p.mes}</td>
                    <td className="px-3 py-2">{formatFecha(p.fecha)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoneyCentavos(p.montoCentavos, moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-heading text-sm font-semibold">Historial de cambios</h2>
        {d.historial.length === 0 ? (
          <p className="text-body-muted mt-2 text-sm">Sin cambios registrados.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {d.historial.map((h, i) => (
              <li
                key={`${h.fecha}-${i}`}
                className="rounded-xl border border-neutral-200 px-3 py-2 dark:border-zinc-800"
              >
                <p className="font-medium">
                  {h.estadoAnterior ? `${h.estadoAnterior} → ${h.estadoNuevo}` : h.estadoNuevo}
                </p>
                <p className="text-body-muted text-xs">
                  {new Date(h.fecha).toLocaleString('es-AR')} · {h.usuarioNombre ?? h.usuario}
                </p>
                {h.nota ? <p className="mt-1">{h.nota}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pagoModo ? (
        <ComoLoPagasModal
          pago={pagoModo}
          guardando={guardandoPago}
          onClose={() => setPagoModo(null)}
          onConfirmar={(resultado) => {
            const pago = pagoModo
            const abrirTransferencia = () => {
              if (!resultado.transferencia) return
              setTransferencia(resultado.transferencia)
              setPagoModo(null)
            }
            if (resultado.partes.length === 0) {
              abrirTransferencia()
              return
            }
            setGuardandoPago(true)
            void pagarHoyCombinado(pago.id, resultado.partes, resultado.comprobantes)
              .then(async (mensaje) => {
                toast.success(mensaje)
                await queryClient.invalidateQueries({ queryKey: ['finanzas', 'inversiones', id] })
                await queryClient.invalidateQueries({ queryKey: ['finanzas', 'hoy'] })
                await queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
                await queryClient.invalidateQueries({ queryKey: ['finanzas', 'cajas'] })
                await queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques'] })
                if (resultado.transferencia) {
                  abrirTransferencia()
                  return
                }
                setPagoModo(null)
                void refetch()
              })
              .catch((err: unknown) => {
                toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
              })
              .finally(() => setGuardandoPago(false))
          }}
        />
      ) : null}

      {transferencia ? (
        <NuevaTransferenciaModal precarga={transferencia} onClose={() => setTransferencia(null)} />
      ) : null}

      {cuotaPesos ? (
        <CuotaEnPesosModal
          inversionId={id}
          numeroCuota={cuotaPesos.numero}
          actual={cuotaPesos.enPesos}
          onClose={() => setCuotaPesos(null)}
          onGuardado={alActualizar}
        />
      ) : null}

      {ingresoAbierto ? (
        <RegistrarIngresoModal
          inversionId={id}
          moneda={moneda}
          montoSugeridoCentavos={faltaIngresar}
          onClose={() => setIngresoAbierto(false)}
          onGuardado={alActualizar}
        />
      ) : null}

      {motivoAccion === 'anular' ? (
        <MotivoModal
          titulo="Anular inversión"
          confirmacion="¿Anular esta inversión? Queda anulada; no se borra."
          enviando={enviandoAccion}
          onClose={() => setMotivoAccion(null)}
          onConfirmar={(motivo) => void correrAccion(() => anularInversion(id, motivo))}
        />
      ) : null}

      {motivoAccion === 'rechazar' ? (
        <MotivoModal
          titulo="Rechazar inversión"
          confirmacion="¿Rechazar esta inversión?"
          enviando={enviandoAccion}
          onClose={() => setMotivoAccion(null)}
          onConfirmar={(motivo) => void correrAccion(() => rechazarInversion(id, motivo))}
        />
      ) : null}

      {fichaInversor ? (
        <FichaInversorModal
          modo="editar"
          inversorId={d.inversorId}
          onClose={() => setFichaInversor(false)}
          onGuardado={() => {
            void refetch()
          }}
        />
      ) : null}
    </div>
  )
}
