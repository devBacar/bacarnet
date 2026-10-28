import {
  ArrowDownToLine,
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  Eye,
  FileText,
  Landmark,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  ReceiptText,
  Search,
  Trash2,
  UserRoundPen,
  WalletCards,
  X,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { UserSinglePicker } from '../../components/access/UserSinglePicker'
import {
  FinanzasFormField,
  finanzasInputClass,
} from '../../components/finanzas/FinanzasFormField'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { useAuth } from '../../context'
import {
  aprobarCierreCaja,
  changeCajaResponsable,
  cerrarCajaChica,
  createCaja,
  comprarUsdDesdeCaja,
  deleteCaja,
  fetchCajaResponsables,
  fetchCajas,
  fetchCierresCaja,
  fetchCierresPendientes,
  fetchMovimientosCaja,
  fondearCaja,
  registrarMovimientoCaja,
  renameCaja,
  type CajaCierreItem,
  type CajaItem,
  type CajaMoneda,
  type CajaMovimientoItem,
  type CajaMovimientoTipo,
  type CajaResponsableOption,
  type CajaTipo,
} from '../../services/finanzasCajasApi'
import { isSuperAdmin } from '../../services/userService'

type Vista = 'libro' | 'cierres' | 'administracion'
type Modal =
  | { tipo: 'movimiento'; movimiento: 'ingreso' | 'egreso' }
  | { tipo: 'fondeo' }
  | { tipo: 'crear' }
  | { tipo: 'reasignar'; caja: CajaItem }
  | { tipo: 'renombrar'; caja: CajaItem }
  | null

type FiltroTipoMov = 'todos' | 'ingreso' | 'egreso' | 'fondeo'
type PresetRango = 'mes' | 'anio' | '2anios' | 'personalizado'

function isoHoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoInicioMes(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function isoInicioAnio(): string {
  return `${new Date().getFullYear()}-01-01`
}

function isoHaceAnios(anios: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - anios)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rangoDesdePreset(preset: PresetRango): { desde: string; hasta: string } {
  const hasta = isoHoy()
  if (preset === 'mes') return { desde: isoInicioMes(), hasta }
  if (preset === 'anio') return { desde: isoInicioAnio(), hasta }
  return { desde: isoHaceAnios(2), hasta }
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function claveDia(iso: string | null): string {
  if (!iso) return 'sin-fecha'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function etiquetaDia(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  const d = new Date(iso)
  const hoy = claveDia(new Date().toISOString())
  const key = claveDia(iso)
  const texto = d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  if (key === hoy) return `Hoy · ${texto}`
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function tipoMovimientoLabel(tipo: CajaMovimientoTipo, esViatico: boolean): string {
  if (tipo === 'fondeo_recibido') return 'Fondeo recibido'
  if (tipo === 'fondeo_enviado') return 'Fondeo enviado'
  if (esViatico) return 'Viático'
  if (tipo === 'ingreso') return 'Ingreso'
  return 'Egreso'
}

function pesosToCentavos(value: string): number | null {
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100)
}

function esIngreso(tipo: CajaMovimientoTipo): boolean {
  return tipo === 'ingreso' || tipo === 'fondeo_recibido'
}

function responsableLabel(uid: string, users: CajaResponsableOption[]): string {
  const user = users.find((candidate) => candidate.uid === uid)
  return user?.displayName || user?.email || uid
}

function motivoNoEliminable(caja: CajaItem): string | null {
  if (caja.tipo === 'principal') return 'Las cajas principales son fijas y no se pueden eliminar.'
  if (caja.saldoActualCentavos !== 0) return 'Primero debe quedar con saldo $0.'
  if (caja.bloqueadaPorCierre) return 'Tiene un cierre pendiente de aprobación.'
  return null
}

export function CajasWorkspace() {
  const { userProfile } = useAuth()
  const esLider =
    isSuperAdmin(userProfile) || userProfile?.permissions.manage_finanzas_caja === true
  const [vista, setVista] = useState<Vista>('libro')
  const [cajas, setCajas] = useState<CajaItem[]>([])
  const [cajaId, setCajaId] = useState('')
  const [movimientos, setMovimientos] = useState<CajaMovimientoItem[]>([])
  const [totalSinFiltro, setTotalSinFiltro] = useState(0)
  const [retencionAnios, setRetencionAnios] = useState(2)
  const [presetRango, setPresetRango] = useState<PresetRango>('2anios')
  const [desde, setDesde] = useState(() => isoHaceAnios(2))
  const [hasta, setHasta] = useState(() => isoHoy())
  const [tipoFiltro, setTipoFiltro] = useState<FiltroTipoMov>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [cierres, setCierres] = useState<CajaCierreItem[]>([])
  const [pendientes, setPendientes] = useState<CajaCierreItem[]>([])
  const [users, setUsers] = useState<CajaResponsableOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)

  const caja = useMemo(() => cajas.find((item) => item.id === cajaId) ?? null, [cajaId, cajas])

  const reloadCajas = useCallback(async () => {
    const list = await fetchCajas()
    setCajas(list)
    setCajaId((current) => {
      if (current && list.some((item) => item.id === current)) return current
      return (
        list.find(
          (item) =>
            item.tipo === 'principal' && item.responsableUid === userProfile?.uid,
        )?.id ??
        list.find((item) => item.tipo === 'principal')?.id ??
        list[0]?.id ??
        ''
      )
    })
    setUltimaActualizacion(new Date())
  }, [userProfile?.uid])

  const reloadPendientes = useCallback(async () => {
    if (!esLider) return
    setPendientes(await fetchCierresPendientes())
  }, [esLider])

  const reloadDetalle = useCallback(async (id: string) => {
    if (!id) {
      setMovimientos([])
      setCierres([])
      setTotalSinFiltro(0)
      return
    }
    const [movs, cierresList] = await Promise.all([
      fetchMovimientosCaja(id, {
        desde,
        hasta,
        tipo: tipoFiltro,
        q: busquedaAplicada,
      }),
      fetchCierresCaja(id),
    ])
    setMovimientos(movs.movimientos)
    setTotalSinFiltro(movs.totalSinFiltro)
    setRetencionAnios(movs.retencionAnios)
    setCierres(cierresList)
  }, [busquedaAplicada, desde, hasta, tipoFiltro])

  const reloadTodo = useCallback(async () => {
    try {
      await Promise.all([reloadCajas(), reloadPendientes()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las cajas')
    }
  }, [reloadCajas, reloadPendientes])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        await Promise.all([
          reloadCajas(),
          reloadPendientes(),
          esLider ? fetchCajaResponsables().then(setUsers) : Promise.resolve(),
        ])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las cajas')
      } finally {
        setLoading(false)
      }
    })()
  }, [esLider, reloadCajas, reloadPendientes])

  useEffect(() => {
    void reloadDetalle(cajaId).catch((error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el libro de caja'),
    )
  }, [cajaId, reloadDetalle])

  useEffect(() => {
    const timer = window.setTimeout(() => setBusquedaAplicada(busqueda.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [busqueda])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void Promise.all([reloadCajas(), reloadPendientes(), reloadDetalle(cajaId)]).catch(() => {
        // La actualización manual conserva los errores visibles; el pulso en vivo es silencioso.
      })
    }
    const interval = window.setInterval(refresh, 10_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [cajaId, reloadCajas, reloadDetalle, reloadPendientes])

  const onChanged = async () => {
    await Promise.all([reloadTodo(), reloadDetalle(cajaId)])
  }

  if (loading) {
    return <p className="py-14 text-center text-body-muted">Cargando cajas…</p>
  }

  return (
    <div data-tour="cajas" className="w-full space-y-4">
      <header className="mb-4 flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="text-heading text-2xl font-bold tracking-tight">Cajas</h1>
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <RefreshCw className="h-3.5 w-3.5" />
          En vivo · se actualiza cada 10 segundos
          {ultimaActualizacion
            ? ` · ${ultimaActualizacion.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
            : ''}
        </p>
      </header>

      {cajas.length > 0 ? (
        <SaldosEnVivo
          cajas={cajas}
          cajaId={cajaId}
          onSelect={(id) => {
            setCajaId(id)
            setVista('libro')
          }}
        />
      ) : null}

      {esLider && pendientes.length > 0 ? (
        <button
          type="button"
          onClick={() => setVista('cierres')}
          className="flex w-full items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-left shadow-sm transition hover:border-amber-400 dark:border-amber-700 dark:bg-amber-950/40"
        >
          <span className="flex items-center gap-3">
            <span className="rounded-xl bg-amber-500 p-2 text-white">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold text-amber-950 dark:text-amber-100">
                Cierres pendientes de aprobar
              </span>
              <span className="block text-sm text-amber-800 dark:text-amber-200">
                Hay {pendientes.length} {pendientes.length === 1 ? 'caja bloqueada' : 'cajas bloqueadas'}.
              </span>
            </span>
          </span>
          <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-white">
            {pendientes.length}
          </span>
        </button>
      ) : null}

      <div className="inline-flex flex-wrap rounded-xl border border-neutral-200 p-1 dark:border-zinc-800">
        <Tab active={vista === 'libro'} onClick={() => setVista('libro')}>
          Libro de caja
        </Tab>
        <Tab active={vista === 'cierres'} onClick={() => setVista('cierres')} tour="cajas-pestana-cierres">
          Cierres {pendientes.length > 0 ? `(${pendientes.length})` : ''}
        </Tab>
        {esLider ? (
          <Tab active={vista === 'administracion'} onClick={() => setVista('administracion')}>
            Administración
          </Tab>
        ) : null}
      </div>

      {cajas.length === 0 ? (
        <EmptyState esLider={esLider} onCreate={() => setModal({ tipo: 'crear' })} />
      ) : vista === 'libro' && caja ? (
        <LibroCaja
          caja={caja}
          cajas={cajas}
          movimientos={movimientos}
          totalSinFiltro={totalSinFiltro}
          retencionAnios={retencionAnios}
          presetRango={presetRango}
          desde={desde}
          hasta={hasta}
          tipoFiltro={tipoFiltro}
          busqueda={busqueda}
          onPreset={(preset) => {
            setPresetRango(preset)
            if (preset !== 'personalizado') {
              const rango = rangoDesdePreset(preset)
              setDesde(rango.desde)
              setHasta(rango.hasta)
            }
          }}
          onDesde={(value) => {
            setPresetRango('personalizado')
            setDesde(value)
          }}
          onHasta={(value) => {
            setPresetRango('personalizado')
            setHasta(value)
          }}
          onTipoFiltro={setTipoFiltro}
          onBusqueda={setBusqueda}
          puedeOperarPrincipal={
            esLider || caja.responsableUid === userProfile?.uid
          }
          onIngreso={() => setModal({ tipo: 'movimiento', movimiento: 'ingreso' })}
          onGasto={() => setModal({ tipo: 'movimiento', movimiento: 'egreso' })}
          onFondeo={() => setModal({ tipo: 'fondeo' })}
        />
      ) : vista === 'cierres' ? (
        <CierresView
          caja={caja}
          cierres={cierres}
          pendientes={pendientes}
          esLider={esLider}
          onChanged={onChanged}
        />
      ) : esLider ? (
        <AdministracionView
          cajas={cajas}
          users={users}
          onVer={(id) => {
            setCajaId(id)
            setVista('libro')
          }}
          onCrear={() => setModal({ tipo: 'crear' })}
          onReasignar={(item) => setModal({ tipo: 'reasignar', caja: item })}
          onRenombrar={(item) => setModal({ tipo: 'renombrar', caja: item })}
          onChanged={onChanged}
        />
      ) : null}

      {modal?.tipo === 'movimiento' && caja ? (
        <MovimientoModal
          caja={caja}
          cajas={cajas}
          tipo={modal.movimiento}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await onChanged()
          }}
        />
      ) : null}
      {modal?.tipo === 'fondeo' && caja?.tipo === 'principal' ? (
        <FondeoModal
          principal={caja}
          cajas={cajas}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await onChanged()
          }}
        />
      ) : null}
      {modal?.tipo === 'crear' ? (
        <CrearCajaModal
          cajas={cajas}
          users={users}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await reloadTodo()
          }}
        />
      ) : null}
      {modal?.tipo === 'reasignar' ? (
        <ReasignarModal
          caja={modal.caja}
          users={users}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await onChanged()
          }}
        />
      ) : null}
      {modal?.tipo === 'renombrar' ? (
        <RenombrarModal
          caja={modal.caja}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await onChanged()
          }}
        />
      ) : null}
    </div>
  )
}

function SaldosEnVivo({
  cajas,
  cajaId,
  onSelect,
}: {
  cajas: CajaItem[]
  cajaId: string
  onSelect: (id: string) => void
}) {
  return (
    <section
      aria-label="Saldos actuales de las cajas"
      data-tour="cajas-saldos"
      className="flex flex-col overflow-hidden rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-primary-muted)] bg-brand-primary-light px-4 py-2.5">
        <h2 className="text-brand-primary text-[15px] font-medium">Saldos que debería tener cada caja</h2>
        <span className="text-brand-primary text-xs font-medium">
          {cajas.length} {cajas.length === 1 ? 'caja' : 'cajas'}
        </span>
      </header>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {cajas.map((item) => {
          const active = item.id === cajaId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`group rounded-2xl border p-4 text-left transition ${
                active
                  ? 'border-brand-primary bg-brand-primary/5 shadow-sm ring-1 ring-brand-primary/20'
                  : 'border-neutral-200 bg-white hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`rounded-xl p-2 ${item.tipo === 'principal' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'}`}>
                  {item.tipo === 'principal' ? <Landmark className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}
                </span>
                <span className={`h-2.5 w-2.5 rounded-full ${item.bloqueadaPorCierre ? 'bg-amber-500' : 'bg-emerald-500'}`} title={item.bloqueadaPorCierre ? 'Cerrada, esperando aprobación' : 'Abierta'} />
              </div>
              <p className="mt-3 truncate text-sm font-semibold text-heading">{item.nombre}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-heading">
                {formatMoneyCentavos(item.saldoActualCentavos, item.moneda)}
              </p>
              <p className="mt-1 text-xs text-body-muted">
                {item.tipo === 'principal' ? 'Principal' : 'Caja chica'} · {item.bloqueadaPorCierre ? 'Esperando aprobación' : 'Abierta'}
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function Tab({
  active,
  onClick,
  tour,
  children,
}: {
  active: boolean
  onClick: () => void
  tour?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-tour={tour}
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        active ? 'bg-brand-primary text-white' : 'text-body-muted hover:text-heading'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState({ esLider, onCreate }: { esLider: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-zinc-700">
      <WalletCards className="mx-auto h-10 w-10 text-neutral-400" />
      <h2 className="mt-4 text-xl font-semibold text-heading">Todavía no hay cajas</h2>
      {esLider ? (
        <button type="button" className="bg-brand-primary text-white hover:opacity-90 mt-5 rounded-xl px-5 py-3" onClick={onCreate}>
          Crear la primera caja
        </button>
      ) : (
        <p className="mt-2 text-body-muted">Finanzas todavía no te asignó una caja.</p>
      )}
    </div>
  )
}

function LibroCaja({
  caja,
  cajas,
  movimientos,
  totalSinFiltro,
  retencionAnios,
  presetRango,
  desde,
  hasta,
  tipoFiltro,
  busqueda,
  onPreset,
  onDesde,
  onHasta,
  onTipoFiltro,
  onBusqueda,
  puedeOperarPrincipal,
  onIngreso,
  onGasto,
  onFondeo,
}: {
  caja: CajaItem
  cajas: CajaItem[]
  movimientos: CajaMovimientoItem[]
  totalSinFiltro: number
  retencionAnios: number
  presetRango: PresetRango
  desde: string
  hasta: string
  tipoFiltro: FiltroTipoMov
  busqueda: string
  onPreset: (preset: PresetRango) => void
  onDesde: (value: string) => void
  onHasta: (value: string) => void
  onTipoFiltro: (value: FiltroTipoMov) => void
  onBusqueda: (value: string) => void
  puedeOperarPrincipal: boolean
  onIngreso: () => void
  onGasto: () => void
  onFondeo: () => void
}) {
  const bloqueada = Boolean(caja.bloqueadaPorCierre)
  const rows = useMemo(() => {
    const ordered = [...movimientos].sort(
      (a, b) => new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime(),
    )
    let saldo = caja.saldoActualCentavos
    return ordered.map((movimiento) => {
      const saldoPosterior = movimiento.saldoPosteriorCentavos ?? saldo
      if (movimiento.saldoPosteriorCentavos == null) {
        saldo -= esIngreso(movimiento.tipo)
          ? movimiento.montoCentavos
          : -movimiento.montoCentavos
      }
      return { movimiento, saldoPosterior }
    })
  }, [caja.saldoActualCentavos, movimientos])
  const grupos = useMemo(() => {
    const map = new Map<string, typeof rows>()
    for (const row of rows) {
      const key = claveDia(row.movimiento.fecha)
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [rows])
  const totales = useMemo(() => {
    let ingresos = 0
    let egresos = 0
    for (const { movimiento } of rows) {
      if (esIngreso(movimiento.tipo)) ingresos += movimiento.montoCentavos
      else egresos += movimiento.montoCentavos
    }
    return { ingresos, egresos }
  }, [rows])
  const chicasDisponibles = cajas.some(
    (item) => item.tipo === 'chica' && item.cajaPadreId === caja.id,
  )
  const presets: Array<{ id: PresetRango; label: string }> = [
    { id: 'mes', label: 'Este mes' },
    { id: 'anio', label: 'Este año' },
    { id: '2anios', label: 'Últimos 2 años' },
    { id: 'personalizado', label: 'Personalizado' },
  ]

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-primary-muted)] bg-brand-primary-light px-4 py-2.5">
        <div className="text-brand-primary flex items-center gap-2 text-[15px] font-medium">
          {caja.tipo === 'principal' ? <Landmark className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}
          <span>
            {caja.nombre} ({caja.tipo === 'principal' ? 'Caja principal' : 'Caja chica'} · {caja.moneda})
          </span>
        </div>
      </header>
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 p-5 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-body-muted">
              {caja.tipo === 'principal' ? <Landmark className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}
              {caja.tipo === 'principal' ? 'Caja principal' : 'Caja chica'} · {caja.moneda}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-heading">{caja.nombre}</h2>
            <p className="mt-2 text-4xl font-bold tracking-tight text-heading">
              {formatMoneyCentavos(caja.saldoActualCentavos, caja.moneda)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {caja.tipo === 'chica' ? (
              <button
                type="button"
                data-tour="cajas-registrar-gasto"
                disabled={bloqueada}
                onClick={onGasto}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-neutral-300 sm:flex-none"
              >
                {bloqueada ? <LockKeyhole className="h-5 w-5" /> : <ArrowDownToLine className="h-5 w-5" />}
                {bloqueada ? 'Esperando aprobación' : 'Anotar un gasto'}
              </button>
            ) : puedeOperarPrincipal ? (
              <>
                <button
                  type="button"
                  onClick={onIngreso}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-emerald-700 sm:flex-none"
                >
                  <Plus className="h-5 w-5" />
                  Registrar ingreso
                </button>
                <button
                  type="button"
                  data-tour="cajas-registrar-gasto"
                  onClick={onGasto}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-red-700 sm:flex-none"
                >
                  <ReceiptText className="h-5 w-5" />
                  Registrar pago
                </button>
                <button
                  type="button"
                  data-tour="cajas-fondear"
                  disabled={!chicasDisponibles}
                  onClick={onFondeo}
                  title={!chicasDisponibles ? 'No hay cajas chicas vinculadas a esta principal' : undefined}
                  className="bg-brand-primary text-white hover:opacity-90 inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  <ArrowRightLeft className="h-5 w-5" />
                  Fondear una caja
                </button>
              </>
            ) : null}
          </div>
        </div>
        {bloqueada ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Esta caja está cerrada. No se pueden registrar movimientos hasta que Finanzas apruebe el cierre.
          </p>
        ) : null}
        <div className="mt-5 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPreset(preset.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  presetRango === preset.id
                    ? 'bg-brand-primary text-white'
                    : 'bg-white text-body-muted hover:text-heading dark:bg-zinc-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FinanzasFormField label="Desde" htmlFor="libro-desde">
              <input id="libro-desde" type="date" className={finanzasInputClass} value={desde} onChange={(event) => onDesde(event.target.value)} />
            </FinanzasFormField>
            <FinanzasFormField label="Hasta" htmlFor="libro-hasta">
              <input id="libro-hasta" type="date" className={finanzasInputClass} value={hasta} onChange={(event) => onHasta(event.target.value)} />
            </FinanzasFormField>
            <FinanzasFormField label="Tipo" htmlFor="libro-tipo">
              <select id="libro-tipo" className={finanzasInputClass} value={tipoFiltro} onChange={(event) => onTipoFiltro(event.target.value as FiltroTipoMov)}>
                <option value="todos">Todos</option>
                <option value="ingreso">Ingresos</option>
                <option value="egreso">Egresos</option>
                <option value="fondeo">Fondeos</option>
              </select>
            </FinanzasFormField>
            <FinanzasFormField label="Buscar concepto" htmlFor="libro-q">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input id="libro-q" className={`${finanzasInputClass} pl-9`} placeholder="Ej. café, fondeo, USD" value={busqueda} onChange={(event) => onBusqueda(event.target.value)} />
              </div>
            </FinanzasFormField>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-body-muted">
            <p>
              {rows.length} {rows.length === 1 ? 'movimiento' : 'movimientos'} en el período
              {totalSinFiltro > rows.length ? ` · ${totalSinFiltro} en el historial completo` : ''}
              {' · '}
              ingresos {formatMoneyCentavos(totales.ingresos, caja.moneda)} · egresos {formatMoneyCentavos(totales.egresos, caja.moneda)}
            </p>
            <p>Registro auditable. Se conserva al menos {retencionAnios} años y no se borra.</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-body-muted dark:bg-zinc-800/70">
            <tr>
              <th className="px-5 py-3 font-semibold">Fecha</th>
              <th className="px-5 py-3 font-semibold">Concepto</th>
              <th className="px-5 py-3 text-right font-semibold">Ingreso</th>
              <th className="px-5 py-3 text-right font-semibold">Egreso</th>
              <th className="px-5 py-3 text-right font-semibold">Saldo</th>
              <th className="px-5 py-3 text-center font-semibold">Comprobante</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-14 text-center text-body-muted">
                  No hay movimientos en este período. Probá ampliar el rango o limpiar los filtros.
                </td>
              </tr>
            ) : (
              grupos.map(([dia, items]) => (
                <Fragment key={dia}>
                  <tr className="bg-neutral-50/90 dark:bg-zinc-800/50">
                    <td colSpan={6} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-body-muted">
                      {etiquetaDia(items[0]?.movimiento.fecha ?? null)} · {items.length} {items.length === 1 ? 'asiento' : 'asientos'}
                    </td>
                  </tr>
                  {items.map(({ movimiento, saldoPosterior }) => {
                    const ingreso = esIngreso(movimiento.tipo)
                    return (
                      <tr key={movimiento.id} className="hover:bg-neutral-50/80 dark:hover:bg-zinc-800/40">
                        <td className="whitespace-nowrap px-5 py-4 text-body-muted">
                          <p className="font-medium text-heading">{formatFecha(movimiento.fecha)}</p>
                          <p className="text-xs">{formatHora(movimiento.fecha)}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-heading">{movimiento.concepto}</p>
                          <p className="mt-0.5 text-xs text-body-muted">
                            {tipoMovimientoLabel(movimiento.tipo, movimiento.esViatico)}
                            {movimiento.esViatico && movimiento.beneficiarioEmpleado
                              ? ` · ${movimiento.beneficiarioEmpleado}`
                              : movimiento.categoria && movimiento.categoria !== 'viatico'
                                ? ` · ${movimiento.categoria}`
                                : ''}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {ingreso ? formatMoneyCentavos(movimiento.montoCentavos, caja.moneda) : ''}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-red-700 dark:text-red-400">
                          {!ingreso ? formatMoneyCentavos(movimiento.montoCentavos, caja.moneda) : ''}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-bold tabular-nums text-heading">
                          {formatMoneyCentavos(saldoPosterior, caja.moneda)}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {movimiento.comprobanteUrl ? (
                            <a
                              href={movimiento.comprobanteUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir comprobante"
                              className="inline-flex rounded-lg p-2 text-brand-primary hover:bg-brand-primary/10"
                            >
                              <FileText className="h-5 w-5" />
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CierresView({
  caja,
  cierres,
  pendientes,
  esLider,
  onChanged,
}: {
  caja: CajaItem | null
  cierres: CajaCierreItem[]
  pendientes: CajaCierreItem[]
  esLider: boolean
  onChanged: () => Promise<void>
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {esLider ? <BandejaPendientes pendientes={pendientes} onChanged={onChanged} /> : null}
      {caja?.tipo === 'chica' ? (
        <CerrarCajaCard caja={caja} cierres={cierres} onChanged={onChanged} />
      ) : (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-heading">Historial de cierres</h2>
          <p className="mt-2 text-sm text-body-muted">
            Seleccioná una caja chica para ver su historial o realizar un cierre.
          </p>
        </section>
      )}
    </div>
  )
}

function BandejaPendientes({
  pendientes,
  onChanged,
}: {
  pendientes: CajaCierreItem[]
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const aprobar = async (cierre: CajaCierreItem) => {
    setBusy(cierre.id)
    try {
      await aprobarCierreCaja(cierre.cajaId, cierre.id)
      toast.success('Cierre aprobado. La caja quedó desbloqueada.')
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo aprobar el cierre')
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-700 dark:bg-amber-950/30" data-tour="cajas-pendientes">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-amber-500 p-2 text-white"><LockKeyhole className="h-5 w-5" /></span>
        <div>
          <h2 className="text-lg font-semibold text-heading">Cierres pendientes de aprobar</h2>
          <p className="text-sm text-body-muted">Al aprobar, la caja se desbloquea.</p>
        </div>
      </div>
      {pendientes.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 rounded-xl bg-white/70 p-4 text-sm text-emerald-700 dark:bg-zinc-900/50 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" /> No hay cierres esperando aprobación.
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {pendientes.map((cierre, indice) => (
            <li key={cierre.id} className="rounded-xl border border-amber-200 bg-white p-4 dark:border-amber-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-heading">{cierre.cajaNombre ?? 'Caja chica'}</p>
                  <p className="mt-1 text-sm text-body-muted">
                    {formatFecha(cierre.periodoHasta)} · Saldo teórico{' '}
                    {formatMoneyCentavos(cierre.saldoTeorico, cierre.cajaMoneda ?? 'ARS')}
                  </p>
                  {cierre.diferencia !== null && cierre.diferencia !== 0 ? (
                    <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-200">
                      Diferencia: {formatMoneyCentavos(cierre.diferencia, cierre.cajaMoneda ?? 'ARS')}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  data-tour={indice === 0 ? 'cajas-aprobar' : undefined}
                  disabled={busy === cierre.id}
                  onClick={() => void aprobar(cierre)}
                  className="bg-brand-primary text-white hover:opacity-90 rounded-xl px-5 py-2.5 font-semibold disabled:opacity-50"
                >
                  {busy === cierre.id ? 'Aprobando…' : 'Aprobar cierre'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CerrarCajaCard({
  caja,
  cierres,
  onChanged,
}: {
  caja: CajaItem
  cierres: CajaCierreItem[]
  onChanged: () => Promise<void>
}) {
  const [efectivo, setEfectivo] = useState('')
  const [busy, setBusy] = useState(false)
  const ultimo = cierres[0]
  const bloqueada = Boolean(caja.bloqueadaPorCierre)
  const cerrar = async () => {
    const monto = pesosToCentavos(efectivo)
    if (monto === null) return toast.error('Indicá cuánto efectivo contaste')
    const hasta = new Date()
    const desde = new Date(hasta.getFullYear(), hasta.getMonth(), 1)
    setBusy(true)
    try {
      await cerrarCajaChica(caja.id, {
        periodoDesde: desde.toISOString(),
        periodoHasta: hasta.toISOString(),
        efectivoContado: monto,
        cerrar: true,
      })
      toast.success('Caja cerrada y enviada a aprobación')
      setEfectivo('')
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cerrar la caja')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900" data-tour="cajas-cerrar-tarjeta">
      <h2 className="text-lg font-semibold text-heading">Cerrar {caja.nombre}</h2>
      {bloqueada ? (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm dark:bg-amber-950/40">
          <p className="font-semibold text-amber-900 dark:text-amber-100">Esperando aprobación</p>
          {ultimo ? <p className="mt-1 text-body-muted">Cierre del {formatFecha(ultimo.periodoHasta)}</p> : null}
        </div>
      ) : (
        <div className="mt-4">
          <FinanzasFormField label="Efectivo que conté" htmlFor="cierre-efectivo" tour="cajas-cerrar-efectivo">
            <input id="cierre-efectivo" inputMode="decimal" className={finanzasInputClass} value={efectivo} onChange={(event) => setEfectivo(event.target.value)} />
          </FinanzasFormField>
          <button type="button" data-tour="cajas-cerrar-boton" disabled={busy} onClick={() => void cerrar()} className="bg-brand-primary text-white hover:opacity-90 mt-4 w-full rounded-xl py-3 font-semibold disabled:opacity-50">
            {busy ? 'Cerrando…' : 'Cerrar caja'}
          </button>
        </div>
      )}
    </section>
  )
}

function AdministracionView({
  cajas,
  users,
  onVer,
  onCrear,
  onReasignar,
  onRenombrar,
  onChanged,
}: {
  cajas: CajaItem[]
  users: CajaResponsableOption[]
  onVer: (id: string) => void
  onCrear: () => void
  onReasignar: (caja: CajaItem) => void
  onRenombrar: (caja: CajaItem) => void
  onChanged: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const eliminar = async (caja: CajaItem) => {
    if (!window.confirm(`¿Dar de baja "${caja.nombre}"? El historial no se borrará.`)) return
    setDeleting(caja.id)
    try {
      await deleteCaja(caja.id)
      toast.success('Caja dada de baja')
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la caja')
    } finally {
      setDeleting(null)
    }
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 border-b border-neutral-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700">
        <div>
          <h2 className="text-xl font-semibold text-heading">Todas las cajas</h2>
          <p className="mt-1 text-sm text-body-muted">Abrí, editá, reasigná o eliminá cada caja desde su fila.</p>
        </div>
        <button type="button" onClick={onCrear} className="bg-brand-primary text-white hover:opacity-90 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold">
          <Plus className="h-4 w-4" /> Nueva caja
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-body-muted dark:bg-zinc-800/70">
            <tr>
              <th className="px-5 py-3">Nombre</th><th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Moneda</th><th className="px-5 py-3 text-right">Saldo</th>
              <th className="px-5 py-3">Responsable</th><th className="px-5 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
            {cajas.map((caja) => {
              const motivo = motivoNoEliminable(caja)
              return (
                <tr key={caja.id} className="hover:bg-neutral-50/80 dark:hover:bg-zinc-800/40">
                  <td className="px-5 py-4 font-semibold text-heading">{caja.nombre}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium dark:bg-zinc-800">{caja.tipo === 'principal' ? 'Principal' : 'Chica'}</span></td>
                  <td className="px-5 py-4">{caja.moneda}</td>
                  <td className="px-5 py-4 text-right font-bold tabular-nums">{formatMoneyCentavos(caja.saldoActualCentavos, caja.moneda)}</td>
                  <td className="max-w-[220px] truncate px-5 py-4" title={responsableLabel(caja.responsableUid, users)}>{responsableLabel(caja.responsableUid, users)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => onVer(caja.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 dark:border-zinc-600 dark:hover:bg-zinc-800"><Eye className="h-4 w-4" /> Ver</button>
                      <button type="button" onClick={() => onRenombrar(caja)} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 dark:border-zinc-600 dark:hover:bg-zinc-800"><Pencil className="h-4 w-4" /> Editar nombre</button>
                      <button type="button" onClick={() => onReasignar(caja)} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50 dark:border-zinc-600 dark:hover:bg-zinc-800"><UserRoundPen className="h-4 w-4" /> Reasignar</button>
                      <span title={motivo ?? 'Dar de baja esta caja'}>
                        <button type="button" disabled={Boolean(motivo) || deleting === caja.id} onClick={() => void eliminar(caja)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-red-800 dark:text-red-300 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"><Trash2 className="h-4 w-4" /> {deleting === caja.id ? 'Eliminando…' : 'Eliminar'}</button>
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ModalShell({ title, onClose, tour, children }: { title: string; onClose: () => void; tour?: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="Cerrar" />
      <section data-tour={tour} className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-heading">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-body-muted hover:bg-neutral-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

function MovimientoModal({ caja, cajas, tipo, onClose, onSaved }: { caja: CajaItem; cajas: CajaItem[]; tipo: 'ingreso' | 'egreso'; onClose: () => void; onSaved: () => Promise<void> }) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [modoEgreso, setModoEgreso] = useState<'pago' | 'compra_usd'>('pago')
  const [cotizacion, setCotizacion] = useState('')
  const [dolares, setDolares] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const puedeComprarUsd =
    caja.tipo === 'principal' &&
    caja.moneda === 'ARS' &&
    cajas.some((item) => item.tipo === 'principal' && item.moneda === 'USD')
  const cotizacionCentavos = pesosToCentavos(cotizacion)
  const dolaresCentavos = pesosToCentavos(dolares)
  const totalPesosCentavos =
    cotizacionCentavos !== null && dolaresCentavos !== null
      ? Math.round((cotizacionCentavos * dolaresCentavos) / 100)
      : null
  const guardar = async (event: React.FormEvent) => {
    event.preventDefault()
    if (tipo === 'egreso' && modoEgreso === 'compra_usd') {
      if (
        cotizacionCentavos === null ||
        dolaresCentavos === null ||
        totalPesosCentavos === null
      ) {
        return toast.error('Completá la cotización y la cantidad de dólares')
      }
      if (totalPesosCentavos > caja.saldoActualCentavos) {
        return toast.error('El saldo en pesos no alcanza para esta compra')
      }
      setBusy(true)
      try {
        await comprarUsdDesdeCaja(caja.id, {
          cotizacionCentavosPorUsd: cotizacionCentavos,
          montoUsdCentavos: dolaresCentavos,
          comprobanteFile: foto,
        })
        toast.success('Compra registrada: se descontaron los pesos y se acreditaron los USD')
        await onSaved()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo registrar la compra')
      } finally {
        setBusy(false)
      }
      return
    }
    const montoCentavos = pesosToCentavos(monto)
    if (!concepto.trim() || montoCentavos === null) return toast.error('Completá concepto y monto')
    setBusy(true)
    try {
      await registrarMovimientoCaja(caja.id, { tipo, concepto: concepto.trim(), montoCentavos, comprobanteFile: foto })
      toast.success(tipo === 'ingreso' ? 'Ingreso registrado' : caja.tipo === 'principal' ? 'Pago registrado' : 'Gasto registrado')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }
  return (
    <ModalShell title={tipo === 'ingreso' ? 'Registrar ingreso' : caja.tipo === 'principal' ? 'Registrar pago' : 'Anotar un gasto'} onClose={onClose} tour="cajas-movimiento-ventana">
      <form onSubmit={(event) => void guardar(event)} className="mt-5 space-y-4">
        {tipo === 'egreso' && caja.tipo === 'principal' ? (
          <div>
            <p className="mb-2 text-sm font-medium text-body-muted">Motivo</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setModoEgreso('pago')} className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${modoEgreso === 'pago' ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-neutral-200 hover:border-neutral-300 dark:border-zinc-700'}`}>Pago general</button>
              <button type="button" disabled={!puedeComprarUsd} title={!puedeComprarUsd ? 'Primero debe existir una caja principal USD' : undefined} onClick={() => setModoEgreso('compra_usd')} className={`rounded-xl border px-3 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${modoEgreso === 'compra_usd' ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-neutral-200 hover:border-neutral-300 dark:border-zinc-700'}`}>Compra USD</button>
            </div>
          </div>
        ) : null}
        {modoEgreso === 'compra_usd' && tipo === 'egreso' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <FinanzasFormField label="Cotización por USD" htmlFor="mov-cotizacion"><input id="mov-cotizacion" autoFocus inputMode="decimal" placeholder="Ej. 1500" className={finanzasInputClass} value={cotizacion} onChange={(event) => setCotizacion(event.target.value)} /></FinanzasFormField>
              <FinanzasFormField label="Cantidad de USD" htmlFor="mov-dolares"><input id="mov-dolares" inputMode="decimal" placeholder="Ej. 1000" className={finanzasInputClass} value={dolares} onChange={(event) => setDolares(event.target.value)} /></FinanzasFormField>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Resumen de la operación</p>
              <div className="mt-2 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-body-muted">Se debitan de {caja.nombre}</p>
                  <p className="text-xl font-bold text-heading">{totalPesosCentavos === null ? '—' : formatMoneyCentavos(totalPesosCentavos, 'ARS')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-body-muted">Se acreditan en Principal USD</p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{dolaresCentavos === null ? '—' : formatMoneyCentavos(dolaresCentavos, 'USD')}</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <FinanzasFormField label="Concepto" htmlFor="mov-concepto" tour="cajas-movimiento-concepto"><input id="mov-concepto" autoFocus className={finanzasInputClass} value={concepto} onChange={(event) => setConcepto(event.target.value)} /></FinanzasFormField>
            <FinanzasFormField label={`Monto (${caja.moneda})`} htmlFor="mov-monto" tour="cajas-movimiento-monto"><input id="mov-monto" inputMode="decimal" className={finanzasInputClass} value={monto} onChange={(event) => setMonto(event.target.value)} /></FinanzasFormField>
          </>
        )}
        {tipo === 'egreso' ? (
          <div>
            <input ref={cameraRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(event) => setFoto(event.target.files?.[0] ?? null)} />
            <button type="button" data-tour="cajas-movimiento-comprobante" onClick={() => cameraRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 py-3 font-medium dark:border-zinc-600"><Camera className="h-5 w-5" /> {foto ? foto.name : 'Adjuntar comprobante'}</button>
          </div>
        ) : null}
        <button type="submit" data-tour="cajas-movimiento-guardar" disabled={busy} className="bg-brand-primary text-white hover:opacity-90 w-full rounded-xl py-3 font-semibold disabled:opacity-50">{busy ? 'Guardando…' : modoEgreso === 'compra_usd' && tipo === 'egreso' ? 'Confirmar compra de USD' : 'Guardar'}</button>
      </form>
    </ModalShell>
  )
}

function FondeoModal({ principal, cajas, onClose, onSaved }: { principal: CajaItem; cajas: CajaItem[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const chicas = cajas.filter((item) => item.tipo === 'chica' && item.cajaPadreId === principal.id)
  const [chicaId, setChicaId] = useState(chicas[0]?.id ?? '')
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('Fondeo de caja chica')
  const [busy, setBusy] = useState(false)
  const guardar = async (event: React.FormEvent) => {
    event.preventDefault()
    const montoCentavos = pesosToCentavos(monto)
    if (!chicaId || montoCentavos === null) return toast.error('Elegí la caja y el monto')
    setBusy(true)
    try {
      await fondearCaja(principal.id, { cajaChicaId: chicaId, montoCentavos, concepto: concepto.trim() || undefined })
      toast.success('Fondeo registrado')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo fondear')
    } finally {
      setBusy(false)
    }
  }
  return (
    <ModalShell title="Fondear una caja" onClose={onClose} tour="cajas-fondeo-ventana">
      <form onSubmit={(event) => void guardar(event)} className="mt-5 space-y-4">
        <FinanzasFormField label="Caja chica destino" htmlFor="fondeo-caja" tour="cajas-fondeo-caja"><select id="fondeo-caja" className={finanzasInputClass} value={chicaId} onChange={(event) => setChicaId(event.target.value)}>{chicas.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></FinanzasFormField>
        <FinanzasFormField label={`Monto (${principal.moneda})`} htmlFor="fondeo-monto" tour="cajas-fondeo-monto"><input id="fondeo-monto" inputMode="decimal" className={finanzasInputClass} value={monto} onChange={(event) => setMonto(event.target.value)} /></FinanzasFormField>
        <FinanzasFormField label="Concepto" htmlFor="fondeo-concepto"><input id="fondeo-concepto" className={finanzasInputClass} value={concepto} onChange={(event) => setConcepto(event.target.value)} /></FinanzasFormField>
        <button type="submit" data-tour="cajas-fondeo-confirmar" disabled={busy} className="bg-brand-primary text-white hover:opacity-90 w-full rounded-xl py-3 font-semibold disabled:opacity-50">{busy ? 'Fondeando…' : 'Confirmar fondeo'}</button>
      </form>
    </ModalShell>
  )
}

function CrearCajaModal({ cajas, users, onClose, onSaved }: { cajas: CajaItem[]; users: CajaResponsableOption[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<CajaTipo>('chica')
  const [moneda, setMoneda] = useState<CajaMoneda>('ARS')
  const principales = cajas.filter((item) => item.tipo === 'principal' && item.moneda === moneda)
  const [padre, setPadre] = useState('')
  const [uid, setUid] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setPadre(principales[0]?.id ?? '')
  }, [moneda, principales[0]?.id, tipo])
  const guardar = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!nombre.trim() || !uid || (tipo === 'chica' && !padre)) return toast.error('Completá todos los datos')
    setBusy(true)
    try {
      await createCaja({ nombre: nombre.trim(), tipo, moneda, responsableUid: uid, cajaPadreId: tipo === 'chica' ? padre : null })
      toast.success('Caja creada con saldo $0')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear')
    } finally {
      setBusy(false)
    }
  }
  return (
    <ModalShell title="Nueva caja" onClose={onClose}>
      <form onSubmit={(event) => void guardar(event)} className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FinanzasFormField label="Tipo" htmlFor="crear-tipo"><select id="crear-tipo" className={finanzasInputClass} value={tipo} onChange={(event) => setTipo(event.target.value as CajaTipo)}><option value="chica">Chica</option><option value="principal">Principal</option></select></FinanzasFormField>
          <FinanzasFormField label="Moneda" htmlFor="crear-moneda"><select id="crear-moneda" className={finanzasInputClass} value={moneda} onChange={(event) => setMoneda(event.target.value as CajaMoneda)}><option value="ARS">ARS</option><option value="USD">USD</option></select></FinanzasFormField>
        </div>
        {tipo === 'chica' ? <FinanzasFormField label="Caja principal" htmlFor="crear-padre"><select id="crear-padre" className={finanzasInputClass} value={padre} onChange={(event) => setPadre(event.target.value)}>{principales.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></FinanzasFormField> : null}
        <FinanzasFormField label="Nombre" htmlFor="crear-nombre"><input id="crear-nombre" className={finanzasInputClass} value={nombre} onChange={(event) => setNombre(event.target.value)} /></FinanzasFormField>
        <FinanzasFormField label="Responsable" htmlFor="crear-responsable"><UserSinglePicker inputId="crear-responsable" allUsers={users} selectedUid={uid} onSelectedUidChange={setUid} query={query} onQueryChange={setQuery} /></FinanzasFormField>
        <p className="rounded-lg bg-neutral-50 p-3 text-xs text-body-muted dark:bg-zinc-800">Toda caja nace con saldo $0.</p>
        <button type="submit" disabled={busy} className="bg-brand-primary text-white hover:opacity-90 w-full rounded-xl py-3 font-semibold disabled:opacity-50">{busy ? 'Creando…' : 'Crear caja'}</button>
      </form>
    </ModalShell>
  )
}

function ReasignarModal({ caja, users, onClose, onSaved }: { caja: CajaItem; users: CajaResponsableOption[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [uid, setUid] = useState('')
  const [query, setQuery] = useState('')
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const guardar = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!uid) return toast.error('Elegí el nuevo responsable')
    setBusy(true)
    try {
      await changeCajaResponsable(caja.id, { responsableUid: uid, motivo: motivo.trim() || undefined })
      toast.success('Responsable actualizado')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo reasignar')
    } finally {
      setBusy(false)
    }
  }
  return (
    <ModalShell title={`Reasignar · ${caja.nombre}`} onClose={onClose}>
      <form onSubmit={(event) => void guardar(event)} className="mt-5 space-y-4">
        <FinanzasFormField label="Nuevo responsable" htmlFor="reasignar-responsable"><UserSinglePicker inputId="reasignar-responsable" allUsers={users} selectedUid={uid} onSelectedUidChange={setUid} query={query} onQueryChange={setQuery} /></FinanzasFormField>
        <FinanzasFormField label="Motivo (opcional)" htmlFor="reasignar-motivo"><input id="reasignar-motivo" className={finanzasInputClass} value={motivo} onChange={(event) => setMotivo(event.target.value)} /></FinanzasFormField>
        <button type="submit" disabled={busy} className="bg-brand-primary text-white hover:opacity-90 w-full rounded-xl py-3 font-semibold disabled:opacity-50">{busy ? 'Guardando…' : 'Cambiar responsable'}</button>
      </form>
    </ModalShell>
  )
}

function RenombrarModal({ caja, onClose, onSaved }: { caja: CajaItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const [nombre, setNombre] = useState(caja.nombre)
  const [busy, setBusy] = useState(false)
  const guardar = async (event: React.FormEvent) => {
    event.preventDefault()
    const limpio = nombre.trim()
    if (limpio.length < 3) return toast.error('El nombre debe tener al menos 3 caracteres')
    if (limpio === caja.nombre) return onClose()
    setBusy(true)
    try {
      await renameCaja(caja.id, limpio)
      toast.success('Nombre actualizado')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo editar la caja')
    } finally {
      setBusy(false)
    }
  }
  return (
    <ModalShell title="Editar nombre de caja" onClose={onClose}>
      <form onSubmit={(event) => void guardar(event)} className="mt-5 space-y-4">
        <FinanzasFormField label="Nombre" htmlFor="renombrar-caja">
          <input id="renombrar-caja" autoFocus maxLength={80} className={finanzasInputClass} value={nombre} onChange={(event) => setNombre(event.target.value)} />
        </FinanzasFormField>
        <p className="text-xs text-body-muted">El historial y los movimientos conservan la misma caja; solo cambia el nombre visible.</p>
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand-primary py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Guardando…' : 'Guardar nombre'}
        </button>
      </form>
    </ModalShell>
  )
}
