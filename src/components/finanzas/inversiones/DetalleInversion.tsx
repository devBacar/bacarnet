import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
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
  type AprobarInversionInput,
  type AprobarInversionResultado,
  type CuotaDetalle,
  type DocumentoInversion,
  type InversionDetalle,
} from '../../../services/finanzasInversionesApi'
import { pagarHoyCombinado, type PagoHoy } from '../../../services/finanzasHoyApi'
import {
  armarIngresoInput,
  CamposIngresoCapital,
  claveIngresoNueva,
  estadoIngresoInicial,
  type CamposIngresoState,
} from './CamposIngresoCapital'
import { FormInversion } from './FormInversion'
import { CuotaEnPesosModal } from './CuotaEnPesosModal'
import { RegistrarIngresoModal } from './RegistrarIngresoModal'
import { FichaInversorModal } from './FichaInversorModal'
import { DetalleCuotas } from './DetalleCuotas'
import { DetalleDocumentos } from './DetalleDocumentos'
import { DetalleHistorial } from './DetalleHistorial'
import { DetalleResumen } from './DetalleResumen'
import { TONO_CHIP, tonoEstadoInversion } from './detalleShared'
import { TEXTOS_APROBAR, textoEstado } from './textosInversiones'

type PestanaDetalle = 'resumen' | 'cuotas' | 'documentos' | 'historial'

const PESTANAS: ReadonlyArray<{ id: PestanaDetalle; texto: string }> = [
  { id: 'resumen', texto: 'Resumen' },
  { id: 'cuotas', texto: 'Cuotas' },
  { id: 'documentos', texto: 'Documentos' },
  { id: 'historial', texto: 'Historial' },
]

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

function AprobarModal({
  moneda,
  montoSugeridoCentavos,
  enviando,
  onClose,
  onConfirmar,
}: {
  moneda: 'ARS' | 'USD'
  montoSugeridoCentavos: number
  enviando: boolean
  onClose: () => void
  onConfirmar: (input: AprobarInversionInput) => void
}) {
  const claveRef = useRef(claveIngresoNueva())
  const [nota, setNota] = useState('')
  const [conIngreso, setConIngreso] = useState(false)
  const [campos, setCampos] = useState<CamposIngresoState>(() => estadoIngresoInicial(montoSugeridoCentavos))
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aprobar-inv-titulo"
        className="surface-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700 sm:p-6"
      >
        <h2 id="aprobar-inv-titulo" className="text-heading text-lg font-semibold">
          {TEXTOS_APROBAR.titulo}
        </h2>
        <p className="text-body-muted mt-2 text-sm">{TEXTOS_APROBAR.ayuda}</p>

        <div className="mt-4 space-y-3">
          <FinanzasFormField label={TEXTOS_APROBAR.nota} htmlFor="ap-nota" optional>
            <textarea
              id="ap-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              className={finanzasInputClass}
            />
          </FinanzasFormField>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-heading">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={conIngreso}
              onChange={(e) => setConIngreso(e.target.checked)}
            />
            <span>{TEXTOS_APROBAR.capitalYaIngreso}</span>
          </label>

          {conIngreso ? (
            <CamposIngresoCapital moneda={moneda} value={campos} onChange={setCampos} idPrefix="ap" />
          ) : null}
        </div>

        {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
          >
            {TEXTOS_APROBAR.cancelar}
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => {
              setError(null)
              if (!conIngreso) {
                onConfirmar({ nota: nota.trim() || null })
                return
              }
              const armado = armarIngresoInput(claveRef.current, campos)
              if (!armado.ok) {
                setError(armado.error)
                return
              }
              onConfirmar({ nota: nota.trim() || null, ingreso: armado.input })
            }}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {enviando ? TEXTOS_APROBAR.enviando : TEXTOS_APROBAR.confirmar}
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

  const [pestana, setPestana] = useState<PestanaDetalle>('resumen')
  const [editando, setEditando] = useState(false)
  const [fichaInversor, setFichaInversor] = useState(false)
  const [pagoModo, setPagoModo] = useState<PagoHoy | null>(null)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [transferencia, setTransferencia] = useState<PrecargaTransferenciaHoy | null>(null)
  const [cuotaPesos, setCuotaPesos] = useState<CuotaDetalle | null>(null)
  const [ingresoAbierto, setIngresoAbierto] = useState(false)
  const [aprobarAbierto, setAprobarAbierto] = useState(false)
  const [motivoAccion, setMotivoAccion] = useState<'anular' | 'rechazar' | null>(null)
  const [enviandoAccion, setEnviandoAccion] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [subiendoDoc, setSubiendoDoc] = useState(false)

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
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="min-h-0 flex-1 p-1">
        <button
          type="button"
          onClick={() => navigate('/finanzas/inversiones')}
          className="text-sm font-medium text-brand-primary hover:underline"
        >
          ← Cerrar
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
  const tono = tonoEstadoInversion(d.estado)
  const hayAcciones =
    d.permisos.editar ||
    d.permisos.enviar ||
    (d.permisos.aprobar && aprobarInversiones) ||
    d.permisos.anular ||
    d.permisos.registrarIngreso

  const correrAccion = async (tarea: () => Promise<InversionDetalle | AprobarInversionResultado>) => {
    setErrorAccion(null)
    setEnviandoAccion(true)
    try {
      const detalle = await tarea()
      alActualizar(detalle)
      setMotivoAccion(null)
      setAprobarAbierto(false)
      if ('ingresoError' in detalle && detalle.ingresoError) {
        toast.error(TEXTOS_APROBAR.ingresoError(detalle.ingresoError), { duration: 8000 })
      } else {
        toast.success('Listo')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo completar'
      setErrorAccion(msg)
      if (aprobarAbierto) toast.error(msg)
    } finally {
      setEnviandoAccion(false)
    }
  }

  const abrirDoc = async (docId: string) => {
    try {
      // La pestaña se abre antes del await: si se abre después, el navegador la bloquea como popup.
      const pestanaWin = window.open('', '_blank')
      try {
        const { url } = await enlaceDocumentoInversion(id, docId)
        if (pestanaWin) {
          pestanaWin.opener = null
          pestanaWin.location.href = url
        } else {
          window.open(url, '_blank', 'noopener,noreferrer')
        }
      } catch (e) {
        pestanaWin?.close()
        throw e
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude abrir el documento')
    }
  }

  const subirDoc = async (archivo: File, tipo: DocumentoInversion['tipo']) => {
    setSubiendoDoc(true)
    try {
      const detalle = await subirDocumentoInversion(id, archivo, tipo)
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
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-neutral-200 pr-8 pb-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-heading truncate text-xl font-bold tracking-tight sm:text-2xl">{d.numero}</h1>
            <button
              type="button"
              onClick={() => setFichaInversor(true)}
              className="mt-1 max-w-full truncate text-sm font-medium text-brand-primary hover:underline"
            >
              {d.inversorNombre}
            </button>
            <p className="text-body-muted mt-1 text-sm tabular-nums">
              {moneda === 'USD' ? 'Dólares' : 'Pesos'} ·{' '}
              <span className="text-heading font-semibold">
                {formatMoneyCentavos(d.condiciones.capitalCentavos, moneda)}
              </span>
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONO_CHIP[tono]}`}
          >
            {textoEstado(d.estado)}
          </span>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Secciones del detalle"
        className="-mx-1 flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden px-1 py-3 [scrollbar-width:thin]"
      >
        {PESTANAS.map((p) => {
          const activa = pestana === p.id
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestana(p.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
                activa
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-body-muted hover:bg-neutral-100 dark:hover:bg-zinc-800'
              }`}
            >
              {p.texto}
            </button>
          )
        })}
      </div>

      {errorAccion ? <p className="text-danger shrink-0 pb-2 text-sm">{errorAccion}</p> : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-2">
        {pestana === 'resumen' ? <DetalleResumen d={d} /> : null}
        {pestana === 'cuotas' ? (
          <DetalleCuotas
            d={d}
            onPagar={(c) => setPagoModo(pagoDesdeCuota(d, c))}
            onCuotaPesos={setCuotaPesos}
          />
        ) : null}
        {pestana === 'documentos' ? (
          <DetalleDocumentos
            d={d}
            subiendo={subiendoDoc}
            onSubir={(archivo, tipo) => void subirDoc(archivo, tipo)}
            onAbrir={(docId) => void abrirDoc(docId)}
            onQuitar={(docId) => void quitarDoc(docId)}
          />
        ) : null}
        {pestana === 'historial' ? <DetalleHistorial d={d} /> : null}
      </div>

      {hayAcciones ? (
        <footer className="shrink-0 border-t border-neutral-200 pt-3 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            {d.permisos.aprobar && aprobarInversiones ? (
              <>
                <button
                  type="button"
                  disabled={enviandoAccion}
                  onClick={() => setAprobarAbierto(true)}
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
            {d.permisos.registrarIngreso ? (
              <button
                type="button"
                onClick={() => setIngresoAbierto(true)}
                className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Registrar ingreso
              </button>
            ) : null}
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
          </div>
        </footer>
      ) : null}

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

      {aprobarAbierto ? (
        <AprobarModal
          moneda={moneda}
          montoSugeridoCentavos={faltaIngresar > 0 ? faltaIngresar : d.ingresoEsperadoCentavos}
          enviando={enviandoAccion}
          onClose={() => setAprobarAbierto(false)}
          onConfirmar={(input) => void correrAccion(() => aprobarInversion(id, input))}
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
