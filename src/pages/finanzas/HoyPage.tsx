import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { AccountsDetailModal } from '../../components/finanzas/AccountsDetailModal'
import { DescubiertoModal } from '../../components/finanzas/DescubiertoModal'
import {
  ComoLoPagasModal,
  EfectivoModal,
  ReclamarModal,
  ReprogramarModal,
  YaLoPagueModal,
} from '../../components/finanzas/hoy/ModalesHoy'
import {
  EncabezadoHoy,
  FranjaDemo,
  TarjetaAtrasados,
  TarjetaCheques,
  TarjetaCobros,
  TarjetaDia,
  TarjetaFirmas,
  TarjetaPagos,
  TarjetaSemana,
} from '../../components/finanzas/hoy/TarjetasHoy'
import { NuevaTransferenciaModal, type PrecargaTransferenciaHoy } from '../../components/finanzas/NuevaTransferenciaModal'
import { useAuth } from '../../context'
import { fetchFinanzasCuentas, patchFinanzasDescubierto, type FinanzasCuenta } from '../../services/finanzasApi'
import {
  borrarDatosDemoHoy,
  cobrarHoyEnEfectivo,
  confirmarCobroHoy,
  fetchHoy,
  pagarHoyConCheque,
  pagarHoyEnEfectivo,
  reprogramarCobroHoy,
  reprogramarPagoHoy,
  yaPagueHoy,
  type CobroAtrasadoHoy,
  type IngresoHoy,
  type PagoHoy,
} from '../../services/finanzasHoyApi'
import { isSuperAdmin } from '../../services/userService'

type Reclamo = Pick<IngresoHoy, 'cliente' | 'textoReclamo' | 'email' | 'concepto'>

export function FinanzasHoyPage() {
  const { user, userProfile } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['finanzas', 'hoy'],
    queryFn: fetchHoy,
    enabled: Boolean(user),
  })
  const cuentasQuery = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: Boolean(user),
  })
  const cuentas = cuentasQuery.data?.cuentas ?? []
  /** Líder de Finanzas (permiso manage_finanzas_caja) o super admin; el backend valida lo mismo. */
  const canEditDescubierto =
    isSuperAdmin(userProfile) || userProfile?.permissions.manage_finanzas_caja === true

  const [pagoModo, setPagoModo] = useState<PagoHoy | null>(null)
  const [pagoEfectivo, setPagoEfectivo] = useState<PagoHoy | null>(null)
  const [yaPague, setYaPague] = useState<PagoHoy | null>(null)
  const [reprogramarPago, setReprogramarPago] = useState<PagoHoy | null>(null)
  const [transferencia, setTransferencia] = useState<PrecargaTransferenciaHoy | null>(null)
  const [ingresoEfectivo, setIngresoEfectivo] = useState<IngresoHoy | null>(null)
  const [reprogramarIngreso, setReprogramarIngreso] = useState<IngresoHoy | null>(null)
  const [reclamo, setReclamo] = useState<Reclamo | null>(null)
  const [detalleBanco, setDetalleBanco] = useState<string | null>(null)
  const [descubiertoCuenta, setDescubiertoCuenta] = useState<FinanzasCuenta | null>(null)
  const [savingDescubierto, setSavingDescubierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [borrandoDemo, setBorrandoDemo] = useState(false)

  async function recargar(mensaje: string) {
    toast.success(mensaje)
    await queryClient.invalidateQueries({ queryKey: ['finanzas', 'hoy'] })
    await queryClient.invalidateQueries({ queryKey: ['finanzas', 'cajas'] })
    await queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
    await queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques'] })
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

  async function borrarDemo() {
    if (!window.confirm('¿Borramos los datos de ejemplo? Solo se borran los marcados como DEMO.')) return
    setBorrandoDemo(true)
    try {
      const mensaje = await borrarDatosDemoHoy()
      await recargar(mensaje)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron borrar los datos de ejemplo')
    } finally {
      setBorrandoDemo(false)
    }
  }

  async function guardarDescubierto(body: { descubiertoCentavos: number | null; vigenteDesde: string | null }) {
    if (!descubiertoCuenta) return
    setSavingDescubierto(true)
    try {
      await patchFinanzasDescubierto(descubiertoCuenta.id, body)
      setDescubiertoCuenta(null)
      await recargar(body.descubiertoCentavos == null ? 'Descubierto quitado' : 'Descubierto guardado')
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'cuentas'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el descubierto')
    } finally {
      setSavingDescubierto(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      {isLoading ? <p className="text-body-muted text-sm">Armando el día…</p> : null}
      {isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {error instanceof Error ? error.message : 'No se pudo cargar el día.'}
          </p>
          <button
            type="button"
            className="mt-2 rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-800 transition hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/40"
            onClick={() => void refetch()}
          >
            Probar de nuevo
          </button>
        </div>
      ) : null}
      {data ? (
        <>
          {data.hayDatosDemo ? <FranjaDemo borrando={borrandoDemo} onBorrar={() => void borrarDemo()} /> : null}
          <EncabezadoHoy data={data} />
          {data.vacio ? (
            <>
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                Hoy no hay nada pendiente.
              </p>
              {data.dia.bancos.length > 0 ? (
                <TarjetaDia dia={data.dia} onAbrirBanco={cuentas.length > 0 ? setDetalleBanco : undefined} />
              ) : null}
            </>
          ) : (
            <>
              <TarjetaPagos
                pagos={data.pagos}
                onPagar={setPagoModo}
                onYaPague={setYaPague}
                onReprogramar={setReprogramarPago}
              />
              <TarjetaCobros
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
              <TarjetaDia dia={data.dia} onAbrirBanco={cuentas.length > 0 ? setDetalleBanco : undefined} />
              <TarjetaCheques cheques={data.prevision.chequesADebitar} />
              <TarjetaSemana prevision={data.prevision} />
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <TarjetaAtrasados
                  cobros={data.prevision.cobrosAtrasados}
                  onReclamar={(cobro: CobroAtrasadoHoy) => setReclamo(cobro)}
                />
                <TarjetaFirmas firmas={data.prevision.firmas} />
              </div>
            </>
          )}
        </>
      ) : null}

      {pagoModo ? (
        <ComoLoPagasModal
          pago={pagoModo}
          guardando={guardando}
          onClose={() => setPagoModo(null)}
          onCheque={(chequeId) => {
            const pago = pagoModo
            void correr(() => pagarHoyConCheque(pago.id, chequeId), () => setPagoModo(null))
          }}
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
          titulo="Cambiar la fecha del pago"
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
          titulo="Cambiar la fecha del cobro"
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

      <AccountsDetailModal
        open={detalleBanco != null}
        cuentas={cuentas}
        moneda="ARS"
        bancoNombre={detalleBanco}
        canEditManual={false}
        canEditDescubierto={canEditDescubierto}
        onClose={() => setDetalleBanco(null)}
        onEditManual={() => undefined}
        onEditDescubierto={(cuenta) => {
          setDetalleBanco(null)
          setDescubiertoCuenta(cuenta)
        }}
      />
      <DescubiertoModal
        cuenta={descubiertoCuenta}
        open={descubiertoCuenta != null}
        saving={savingDescubierto}
        onClose={() => setDescubiertoCuenta(null)}
        onSave={(body) => void guardarDescubierto(body)}
      />
    </div>
  )
}
