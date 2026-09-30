import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  ComoLoPagasModal,
  EfectivoModal,
  ReclamarModal,
  ReprogramarModal,
  YaLoPagueModal,
} from '../../components/finanzas/hoy/ModalesHoy'
import {
  TarjetaDia,
  TarjetaIngresos,
  TarjetaPagos,
  TarjetaPrevision,
} from '../../components/finanzas/hoy/TarjetasHoy'
import { NuevaTransferenciaModal, type PrecargaTransferenciaHoy } from '../../components/finanzas/NuevaTransferenciaModal'
import { useAuth } from '../../context'
import {
  cobrarHoyEnEfectivo,
  confirmarCobroHoy,
  fetchHoy,
  pagarHoyEnEfectivo,
  reprogramarCobroHoy,
  reprogramarPagoHoy,
  yaPagueHoy,
  type CobroAtrasadoHoy,
  type IngresoHoy,
  type PagoHoy,
} from '../../services/finanzasHoyApi'

type Reclamo = Pick<IngresoHoy, 'cliente' | 'textoReclamo' | 'email' | 'concepto'>

export function FinanzasHoyPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['finanzas', 'hoy'],
    queryFn: fetchHoy,
    enabled: Boolean(user),
  })
  const [pagoModo, setPagoModo] = useState<PagoHoy | null>(null)
  const [pagoEfectivo, setPagoEfectivo] = useState<PagoHoy | null>(null)
  const [yaPague, setYaPague] = useState<PagoHoy | null>(null)
  const [reprogramarPago, setReprogramarPago] = useState<PagoHoy | null>(null)
  const [transferencia, setTransferencia] = useState<PrecargaTransferenciaHoy | null>(null)
  const [ingresoEfectivo, setIngresoEfectivo] = useState<IngresoHoy | null>(null)
  const [reprogramarIngreso, setReprogramarIngreso] = useState<IngresoHoy | null>(null)
  const [reclamo, setReclamo] = useState<Reclamo | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  async function recargar(mensaje: string) {
    toast.success(mensaje)
    await queryClient.invalidateQueries({ queryKey: ['finanzas', 'hoy'] })
    await queryClient.invalidateQueries({ queryKey: ['finanzas', 'cajas'] })
    await queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
  }

  async function correr(tarea: () => Promise<string>, cerrar: () => void) {
    setGuardando(true)
    try {
      const mensaje = await tarea()
      cerrar()
      await recargar(mensaje)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      {isLoading ? <p className="text-lg">Estoy armando el día…</p> : null}
      {isError ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-lg text-red-800 dark:text-red-100">
            {error instanceof Error ? error.message : 'No pude cargar el día.'}
          </p>
          <button
            type="button"
            className="mt-3 min-h-12 rounded-xl bg-brand-primary px-4 font-semibold text-white"
            onClick={() => void refetch()}
          >
            Probar de nuevo
          </button>
        </div>
      ) : null}
      {data ? (
        <>
          <p className="text-heading text-2xl font-semibold leading-snug sm:text-3xl">{data.saludo}</p>
          {data.vacio ? (
            <p className="text-heading text-2xl font-semibold">Hoy no hay nada pendiente. ¡Buen día!</p>
          ) : (
            <>
              <TarjetaPagos
                pagos={data.pagos}
                onPagar={setPagoModo}
                onYaPague={setYaPague}
                onReprogramar={setReprogramarPago}
              />
              <TarjetaIngresos
                ingresos={data.ingresos.filas}
                confirmandoId={confirmandoId}
                onConfirmar={(ingreso) => {
                  if (!ingreso.movimientoId) return
                  setConfirmandoId(ingreso.id)
                  void confirmarCobroHoy(ingreso.id, ingreso.movimientoId)
                    .then((mensaje) => recargar(mensaje))
                    .catch((err: unknown) => {
                      toast.error(err instanceof Error ? err.message : 'No se pudo confirmar')
                    })
                    .finally(() => setConfirmandoId(null))
                }}
                onEfectivo={setIngresoEfectivo}
                onReprogramar={setReprogramarIngreso}
                onReclamar={setReclamo}
              />
              <TarjetaDia dia={data.dia} />
              <TarjetaPrevision
                prevision={data.prevision}
                onReclamar={(cobro: CobroAtrasadoHoy) => setReclamo(cobro)}
              />
            </>
          )}
        </>
      ) : null}

      {pagoModo ? (
        <ComoLoPagasModal
          pago={pagoModo}
          onClose={() => setPagoModo(null)}
          onBanco={() => {
            setTransferencia({
              compromisoPagoId: pagoModo.id,
              montoCentavos: pagoModo.montoCentavos,
              concepto: pagoModo.concepto,
              destinatarioNombre: pagoModo.proveedorONombre,
              destinatarioCuit: null,
            })
            setPagoModo(null)
          }}
          onEfectivo={() => {
            setPagoEfectivo(pagoModo)
            setPagoModo(null)
          }}
        />
      ) : null}
      {transferencia ? (
        <NuevaTransferenciaModal precarga={transferencia} onClose={() => setTransferencia(null)} />
      ) : null}
      {pagoEfectivo ? (
        <EfectivoModal
          titulo="Pagar en efectivo"
          detalle={`${pagoEfectivo.aQuien} · ${pagoEfectivo.concepto}`}
          montoCentavos={pagoEfectivo.montoCentavos}
          esIngreso={false}
          guardando={guardando}
          onClose={() => setPagoEfectivo(null)}
          onConfirmar={(cajaId, comprobante) => {
            const pago = pagoEfectivo
            void correr(
              () => pagarHoyEnEfectivo(pago.id, { cajaId, comprobante }),
              () => setPagoEfectivo(null),
            )
          }}
        />
      ) : null}
      {yaPague ? (
        <YaLoPagueModal
          pago={yaPague}
          guardando={guardando}
          onClose={() => setYaPague(null)}
          onConfirmar={(body) => {
            const pago = yaPague
            void correr(() => yaPagueHoy(pago.id, body), () => setYaPague(null))
          }}
        />
      ) : null}
      {reprogramarPago ? (
        <ReprogramarModal
          titulo="Pasarlo para otro día"
          detalle={`${reprogramarPago.aQuien} · ${reprogramarPago.concepto}`}
          guardando={guardando}
          onClose={() => setReprogramarPago(null)}
          onConfirmar={(fecha) => {
            const pago = reprogramarPago
            void correr(() => reprogramarPagoHoy(pago.id, fecha), () => setReprogramarPago(null))
          }}
        />
      ) : null}
      {ingresoEfectivo ? (
        <EfectivoModal
          titulo="Llegó en efectivo"
          detalle={`${ingresoEfectivo.cliente} · ${ingresoEfectivo.concepto}`}
          montoCentavos={ingresoEfectivo.montoCentavos}
          esIngreso
          guardando={guardando}
          onClose={() => setIngresoEfectivo(null)}
          onConfirmar={(cajaId, comprobante) => {
            const ingreso = ingresoEfectivo
            void correr(
              () => cobrarHoyEnEfectivo(ingreso.id, { cajaId, comprobante }),
              () => setIngresoEfectivo(null),
            )
          }}
        />
      ) : null}
      {reprogramarIngreso ? (
        <ReprogramarModal
          titulo="Cambiar la fecha"
          detalle={`${reprogramarIngreso.cliente} · ${reprogramarIngreso.concepto}`}
          guardando={guardando}
          onClose={() => setReprogramarIngreso(null)}
          onConfirmar={(fecha) => {
            const ingreso = reprogramarIngreso
            void correr(() => reprogramarCobroHoy(ingreso.id, fecha), () => setReprogramarIngreso(null))
          }}
        />
      ) : null}
      {reclamo ? <ReclamarModal ingreso={reclamo} onClose={() => setReclamo(null)} /> : null}
    </div>
  )
}
