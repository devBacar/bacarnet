import { Camera, PlusCircle, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
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
  fetchCajas,
  fetchCierresCaja,
  fetchMovimientosCaja,
  fondearCaja,
  registrarMovimientoCaja,
  type CajaCierreItem,
  type CajaItem,
  type CajaMoneda,
  type CajaMovimientoItem,
  type CajaMovimientoTipo,
  type CajaTipo,
} from '../../services/finanzasCajasApi'
import { hasFinanzasAccess } from '../../services/userService'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function pesosToCentavos(pesos: string): number | null {
  const n = Number(pesos.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

function movimientoEsIngreso(tipo: CajaMovimientoTipo): boolean {
  return tipo === 'ingreso' || tipo === 'fondeo_recibido'
}

function labelTipoMovimiento(tipo: CajaMovimientoTipo): string | null {
  if (tipo === 'fondeo_recibido') return 'Fondeo recibido'
  if (tipo === 'fondeo_enviado') return 'Fondeo enviado'
  return null
}

export function FinanzasCajasPage() {
  const { userProfile } = useAuth()
  const esLider =
    hasFinanzasAccess(userProfile) || userProfile?.permissions.manage_finanzas_caja === true

  const [cajas, setCajas] = useState<CajaItem[]>([])
  const [cajaId, setCajaId] = useState<string>('')
  const [movimientos, setMovimientos] = useState<CajaMovimientoItem[]>([])
  const [cierres, setCierres] = useState<CajaCierreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'ingreso' | 'egreso' | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)

  const caja = useMemo(() => cajas.find((c) => c.id === cajaId) ?? null, [cajas, cajaId])
  const esChicaOperativa = caja?.tipo === 'chica'

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchCajas()
      setCajas(list)
      setCajaId((prev) => (prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? '')))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadDetalle = useCallback(async (id: string) => {
    if (!id) return
    try {
      const [movs, cierresList] = await Promise.all([
        fetchMovimientosCaja(id),
        fetchCierresCaja(id),
      ])
      setMovimientos(movs)
      setCierres(cierresList)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar movimientos')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (cajaId) void reloadDetalle(cajaId)
  }, [cajaId, reloadDetalle])

  if (loading) {
    return <p className="text-body-muted text-center py-12">Cargando cajas...</p>
  }

  if (cajas.length === 0) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <p className="text-lg">Todavía no hay cajas configuradas.</p>
        {esLider ? (
          <>
            <p className="text-body-muted mt-2 text-sm">
              Creá primero las dos cajas principales (ARS y USD) y después las cajas chicas.
            </p>
            <button
              type="button"
              className="btn-brand-primary mt-6 rounded-xl px-6 py-3 text-base font-semibold"
              onClick={() => setAdminOpen(true)}
            >
              Configurar cajas
            </button>
          </>
        ) : (
          <p className="text-body-muted mt-4 text-sm">Pedile al área de Finanzas que te asignen una caja.</p>
        )}
        {adminOpen ? (
          <AdminCajaPanel
            esLider
            cajas={cajas}
            onClose={() => setAdminOpen(false)}
            onChanged={() => void reload()}
          />
        ) : null}
      </div>
    )
  }

  const moneda: CajaMoneda = caja?.moneda ?? 'ARS'

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {(esLider && cajas.length > 1) || esLider ? (
        <FinanzasFormField label="Caja" htmlFor="caja-select">
          <select
            id="caja-select"
            className={`${finanzasInputClass} text-base`}
            value={cajaId}
            onChange={(e) => setCajaId(e.target.value)}
          >
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tipo === 'principal' ? '★ ' : ''}
                {c.nombre} ({c.moneda})
              </option>
            ))}
          </select>
        </FinanzasFormField>
      ) : (
        <h1 className="text-heading text-2xl font-semibold">{caja?.nombre ?? 'Cajas'}</h1>
      )}

      <div className="rounded-2xl border-2 border-brand-primary/30 bg-brand-primary/5 p-6 text-center dark:border-brand-primary/40">
        <p className="text-body-muted text-sm font-medium">¿Cuánto tengo ahora?</p>
        <p className="mt-2 text-4xl font-bold tabular-nums">
          {formatMoneyCentavos(caja?.saldoActualCentavos ?? 0, moneda)}
        </p>
        {caja?.tipo === 'principal' ? (
          <p className="text-body-muted mt-2 text-xs">Caja principal — los gastos del día a día van en una caja chica.</p>
        ) : null}
      </div>

      {esChicaOperativa ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="flex min-h-[4.5rem] items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-4 text-lg font-semibold text-white shadow-sm hover:bg-red-700"
            onClick={() => setModal('egreso')}
          >
            <Wallet className="h-6 w-6" aria-hidden />
            Anotar un gasto
          </button>
          <button
            type="button"
            className="flex min-h-[4.5rem] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-semibold text-white shadow-sm hover:bg-emerald-700"
            onClick={() => setModal('ingreso')}
          >
            <PlusCircle className="h-6 w-6" aria-hidden />
            Anotar un ingreso
          </button>
        </div>
      ) : null}

      {esLider && caja?.tipo === 'principal' ? (
        <FondeoPanel principal={caja} cajas={cajas} onDone={() => void reload()} />
      ) : null}

      <section>
        <h2 className="text-heading mb-3 text-lg font-semibold">Últimos movimientos</h2>
        {movimientos.length === 0 ? (
          <p className="text-body-muted rounded-xl border border-dashed p-6 text-center">
            Todavía no hay movimientos en este período.
          </p>
        ) : (
          <ul className="space-y-3">
            {movimientos.map((mov) => {
              const ingreso = movimientoEsIngreso(mov.tipo)
              const extra = labelTipoMovimiento(mov.tipo)
              return (
                <li
                  key={mov.id}
                  className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-medium">{mov.concepto}</p>
                      <p className="text-body-muted text-sm">
                        {formatFecha(mov.fecha)}
                        {extra ? ` · ${extra}` : ''}
                      </p>
                      {mov.esViatico && mov.beneficiarioEmpleado ? (
                        <p className="text-body-muted mt-1 text-sm">Viático: {mov.beneficiarioEmpleado}</p>
                      ) : null}
                    </div>
                    <p
                      className={`text-lg font-bold tabular-nums ${
                        ingreso ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {ingreso ? '+' : '−'}
                      {formatMoneyCentavos(mov.montoCentavos, moneda)}
                    </p>
                  </div>
                  {mov.comprobanteUrl ? (
                    <a
                      href={mov.comprobanteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-primary mt-2 inline-block text-sm font-medium"
                    >
                      Ver comprobante
                    </a>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {esChicaOperativa ? (
        <CerrarCajaSection cajaId={cajaId} moneda={moneda} cierres={cierres} onDone={() => void reloadDetalle(cajaId)} />
      ) : null}

      {esLider ? (
        <div className="border-t pt-6">
          <button
            type="button"
            className="text-brand-primary text-sm font-medium underline"
            onClick={() => setAdminOpen(true)}
          >
            Administración de cajas (Finanzas)
          </button>
        </div>
      ) : null}

      {modal && cajaId && esChicaOperativa ? (
        <MovimientoModal
          tipo={modal}
          cajaId={cajaId}
          moneda={moneda}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            void reload()
            void reloadDetalle(cajaId)
          }}
        />
      ) : null}

      {adminOpen && esLider ? (
        <AdminCajaPanel
          esLider
          cajas={cajas}
          cajaId={cajaId}
          cierres={cierres}
          onClose={() => setAdminOpen(false)}
          onChanged={() => {
            void reload()
            void reloadDetalle(cajaId)
          }}
        />
      ) : null}
    </div>
  )
}

/** @deprecated alias de ruta anterior */
export const FinanzasCajaChicaPage = FinanzasCajasPage

function FondeoPanel({
  principal,
  cajas,
  onDone,
}: {
  principal: CajaItem
  cajas: CajaItem[]
  onDone: () => void
}) {
  const chicas = cajas.filter((c) => c.tipo === 'chica' && c.cajaPadreId === principal.id)
  const [chicaId, setChicaId] = useState(chicas[0]?.id ?? '')
  const [montoPesos, setMontoPesos] = useState('')
  const [concepto, setConcepto] = useState('Fondeo a caja chica')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (chicas.length && !chicas.some((c) => c.id === chicaId)) {
      setChicaId(chicas[0]!.id)
    }
  }, [chicas, chicaId])

  if (chicas.length === 0) {
    return (
      <p className="text-body-muted rounded-xl border border-dashed p-4 text-sm">
        No hay cajas chicas vinculadas a esta principal ({principal.moneda}). Creá una desde administración.
      </p>
    )
  }

  const enviar = async () => {
    const montoCentavos = pesosToCentavos(montoPesos)
    if (!chicaId || montoCentavos === null) {
      toast.error('Elegí la caja chica y el monto')
      return
    }
    setBusy(true)
    try {
      await fondearCaja(principal.id, {
        cajaChicaId: chicaId,
        montoCentavos,
        concepto: concepto.trim() || undefined,
      })
      toast.success('Fondeo registrado')
      setMontoPesos('')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo fondear')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-brand-primary/20 bg-neutral-50 p-5 dark:bg-zinc-800/50">
      <h2 className="text-heading text-lg font-semibold">Fondear caja chica</h2>
      <p className="text-body-muted mt-1 text-sm">Transfiere efectivo desde esta principal a una chica (misma moneda).</p>
      <div className="mt-4 space-y-3">
        <FinanzasFormField label="Caja chica destino" htmlFor="fondeo-chica">
          <select
            id="fondeo-chica"
            className={finanzasInputClass}
            value={chicaId}
            onChange={(e) => setChicaId(e.target.value)}
          >
            {chicas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </FinanzasFormField>
        <FinanzasFormField label="Monto" htmlFor="fondeo-monto">
          <input
            id="fondeo-monto"
            inputMode="decimal"
            className={finanzasInputClass}
            value={montoPesos}
            onChange={(e) => setMontoPesos(e.target.value)}
          />
        </FinanzasFormField>
        <FinanzasFormField label="Concepto (opcional)" htmlFor="fondeo-concepto">
          <input
            id="fondeo-concepto"
            className={finanzasInputClass}
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          />
        </FinanzasFormField>
        <button
          type="button"
          disabled={busy}
          className="btn-brand-primary w-full rounded-xl py-3 font-semibold disabled:opacity-60"
          onClick={() => void enviar()}
        >
          {busy ? 'Enviando…' : 'Fondear'}
        </button>
      </div>
    </section>
  )
}

function MovimientoModal({
  tipo,
  cajaId,
  moneda,
  onClose,
  onSaved,
}: {
  tipo: 'ingreso' | 'egreso'
  cajaId: string
  moneda: CajaMoneda
  onClose: () => void
  onSaved: () => void
}) {
  const [concepto, setConcepto] = useState('')
  const [montoPesos, setMontoPesos] = useState('')
  const [esViatico, setEsViatico] = useState(false)
  const [beneficiario, setBeneficiario] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const montoLabel = moneda === 'USD' ? 'Monto (dólares)' : 'Monto (pesos)'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const montoCentavos = pesosToCentavos(montoPesos)
    if (!concepto.trim() || montoCentavos === null) {
      toast.error('Completá concepto y monto')
      return
    }
    if (esViatico && !beneficiario.trim()) {
      toast.error('Indicá para quién es el viático')
      return
    }
    setSaving(true)
    try {
      await registrarMovimientoCaja(cajaId, {
        tipo,
        concepto: concepto.trim(),
        montoCentavos,
        esViatico: tipo === 'egreso' && esViatico,
        beneficiarioEmpleado: esViatico ? beneficiario.trim() : null,
        comprobanteFile: foto,
      })
      toast.success('Guardado')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Cerrar" />
      <form
        onSubmit={(e) => void submit(e)}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl dark:bg-zinc-900"
      >
        <h2 className="text-heading text-xl font-semibold">
          {tipo === 'egreso' ? 'Anotar un gasto' : 'Anotar un ingreso'}
        </h2>
        <div className="mt-4 space-y-4">
          <FinanzasFormField label="En qué fue" htmlFor="mov-concepto">
            <input
              id="mov-concepto"
              required
              className={`${finanzasInputClass} text-base py-3`}
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            />
          </FinanzasFormField>
          <FinanzasFormField label={montoLabel} htmlFor="mov-monto">
            <input
              id="mov-monto"
              required
              inputMode="decimal"
              className={`${finanzasInputClass} text-base py-3`}
              value={montoPesos}
              onChange={(e) => setMontoPesos(e.target.value)}
            />
          </FinanzasFormField>
          {tipo === 'egreso' ? (
            <>
              <label className="flex items-center gap-3 text-base">
                <input
                  type="checkbox"
                  checked={esViatico}
                  onChange={(e) => setEsViatico(e.target.checked)}
                  className="h-5 w-5"
                />
                Es un viático (viaje / movilidad)
              </label>
              {esViatico ? (
                <FinanzasFormField label="Persona que viaja" htmlFor="mov-benef">
                  <input
                    id="mov-benef"
                    required
                    className={`${finanzasInputClass} text-base py-3`}
                    value={beneficiario}
                    onChange={(e) => setBeneficiario(e.target.value)}
                  />
                </FinanzasFormField>
              ) : null}
              <div className="space-y-2">
                <p className="text-sm font-medium">Comprobante (opcional)</p>
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 py-4 text-base font-semibold dark:border-zinc-600"
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="h-6 w-6" aria-hidden />
                  Sacar foto
                </button>
                {foto ? <p className="text-body-muted text-sm">Archivo: {foto.name}</p> : null}
              </div>
            </>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="btn-brand-primary mt-6 w-full rounded-xl py-4 text-lg font-semibold disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}

function CerrarCajaSection({
  cajaId,
  moneda,
  cierres,
  onDone,
}: {
  cajaId: string
  moneda: CajaMoneda
  cierres: CajaCierreItem[]
  onDone: () => void
}) {
  const [efectivoPesos, setEfectivoPesos] = useState('')
  const [busy, setBusy] = useState(false)
  const ultima = cierres[0]

  const cerrar = async () => {
    const centavos = pesosToCentavos(efectivoPesos)
    if (centavos === null) {
      toast.error('Indicá cuánto contaste en efectivo')
      return
    }
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    setBusy(true)
    try {
      const cierre = await cerrarCajaChica(cajaId, {
        periodoDesde: desde.toISOString(),
        periodoHasta: hoy.toISOString(),
        efectivoContado: centavos,
        cerrar: true,
      })
      if (cierre.diferencia !== null && cierre.diferencia !== 0) {
        toast('Hay diferencia entre lo contado y lo calculado — revisá con Finanzas.', {
          icon: '⚠️',
        })
      } else {
        toast.success('Caja cerrada')
      }
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cerrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 p-5 dark:border-zinc-700">
      <h2 className="text-heading text-lg font-semibold">Cerrar caja</h2>
      <p className="text-body-muted mt-1 text-sm">
        Contá el efectivo que tenés y comparalo con lo que muestra el sistema.
      </p>
      {ultima?.estado === 'cerrada' || ultima?.estado === 'aprobada' ? (
        <div className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm dark:bg-zinc-800">
          <p>
            Último cierre: {formatFecha(ultima.periodoHasta)} —{' '}
            {ultima.estado === 'aprobada' ? 'aprobado por Finanzas' : 'pendiente de aprobación'}
          </p>
          {ultima.saldoTeorico != null ? (
            <p className="text-body-muted mt-1">Según el sistema: {formatMoneyCentavos(ultima.saldoTeorico, moneda)}</p>
          ) : null}
          {ultima.diferencia !== null && ultima.diferencia !== 0 ? (
            <p className="mt-2 font-medium text-amber-800 dark:text-amber-200">
              Diferencia: {formatMoneyCentavos(ultima.diferencia, moneda)}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <FinanzasFormField label="Efectivo que conté" htmlFor="cerrar-monto">
            <input
              id="cerrar-monto"
              inputMode="decimal"
              className={`${finanzasInputClass} text-base py-3`}
              value={efectivoPesos}
              onChange={(e) => setEfectivoPesos(e.target.value)}
            />
          </FinanzasFormField>
          <button
            type="button"
            disabled={busy}
            className="btn-brand-primary mt-4 w-full rounded-xl py-3 text-base font-semibold disabled:opacity-60"
            onClick={() => void cerrar()}
          >
            {busy ? 'Cerrando…' : 'Cerrar caja'}
          </button>
        </>
      )}
    </section>
  )
}

function AdminCajaPanel({
  esLider,
  cajas,
  cajaId,
  cierres = [],
  onClose,
  onChanged,
}: {
  esLider: boolean
  cajas: CajaItem[]
  cajaId?: string
  cierres?: CajaCierreItem[]
  onClose: () => void
  onChanged: () => void
}) {
  const [nombre, setNombre] = useState('Caja Chica Recepción')
  const [tipo, setTipo] = useState<CajaTipo>('chica')
  const [moneda, setMoneda] = useState<CajaMoneda>('ARS')
  const [cajaPadreId, setCajaPadreId] = useState('')
  const [responsableUid, setResponsableUid] = useState('')
  const [saldoPesos, setSaldoPesos] = useState('0')
  const [motivo, setMotivo] = useState('')
  const [nuevoResponsable, setNuevoResponsable] = useState('')

  const principales = cajas.filter((c) => c.tipo === 'principal')
  const principalMoneda = principales.find((p) => p.moneda === moneda)
  const monedaCajaSeleccionada = cajas.find((c) => c.id === cajaId)?.moneda ?? 'ARS'

  useEffect(() => {
    if (tipo === 'chica' && principalMoneda) {
      setCajaPadreId(principalMoneda.id)
    }
    if (tipo === 'principal') setCajaPadreId('')
  }, [tipo, moneda, principalMoneda?.id])

  if (!esLider) return null

  const crear = async () => {
    const saldo = pesosToCentavos(saldoPesos) ?? 0
    if (!responsableUid.trim()) {
      toast.error('UID del responsable requerido')
      return
    }
    if (tipo === 'chica' && !cajaPadreId) {
      toast.error('Elegí la caja principal (misma moneda)')
      return
    }
    try {
      await createCaja({
        nombre: nombre.trim(),
        tipo,
        moneda,
        responsableUid: responsableUid.trim(),
        saldoInicialCentavos: saldo,
        cajaPadreId: tipo === 'chica' ? cajaPadreId : null,
      })
      toast.success('Caja creada')
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  const reasignar = async () => {
    if (!cajaId || !nuevoResponsable.trim()) return
    try {
      await changeCajaResponsable(cajaId, {
        responsableUid: nuevoResponsable.trim(),
        motivo: motivo.trim() || undefined,
      })
      toast.success('Responsable actualizado')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  const aprobar = async (cierreId: string) => {
    if (!cajaId) return
    try {
      await aprobarCierreCaja(cajaId, cierreId)
      toast.success('Cierre aprobado')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Cerrar" />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 dark:bg-zinc-900">
        <h2 className="text-heading text-lg font-semibold">Administración — Cajas</h2>
        <div className="mt-4 space-y-3 border-b pb-4">
          <h3 className="font-medium">Nueva caja</h3>
          <FinanzasFormField label="Tipo" htmlFor="adm-tipo">
            <select id="adm-tipo" className={finanzasInputClass} value={tipo} onChange={(e) => setTipo(e.target.value as CajaTipo)}>
              <option value="principal">Principal</option>
              <option value="chica">Chica</option>
            </select>
          </FinanzasFormField>
          <FinanzasFormField label="Moneda" htmlFor="adm-moneda">
            <select id="adm-moneda" className={finanzasInputClass} value={moneda} onChange={(e) => setMoneda(e.target.value as CajaMoneda)}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </FinanzasFormField>
          {tipo === 'chica' ? (
            <FinanzasFormField label="Caja principal" htmlFor="adm-padre">
              <select
                id="adm-padre"
                className={finanzasInputClass}
                value={cajaPadreId}
                onChange={(e) => setCajaPadreId(e.target.value)}
              >
                {principales
                  .filter((p) => p.moneda === moneda)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
              </select>
            </FinanzasFormField>
          ) : null}
          <FinanzasFormField label="Nombre" htmlFor="adm-nombre">
            <input id="adm-nombre" className={finanzasInputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="UID responsable (Firebase)" htmlFor="adm-resp">
            <input id="adm-resp" className={finanzasInputClass} value={responsableUid} onChange={(e) => setResponsableUid(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Saldo inicial" htmlFor="adm-saldo">
            <input id="adm-saldo" className={finanzasInputClass} value={saldoPesos} onChange={(e) => setSaldoPesos(e.target.value)} />
          </FinanzasFormField>
          <button type="button" className="btn-brand-primary w-full rounded-lg py-2" onClick={() => void crear()}>
            Crear caja
          </button>
        </div>
        {cajas.length > 0 && cajaId ? (
          <div className="mt-4 space-y-4">
            <FinanzasFormField label="Nuevo responsable (UID)" htmlFor="adm-nuevo">
              <input id="adm-nuevo" className={finanzasInputClass} value={nuevoResponsable} onChange={(e) => setNuevoResponsable(e.target.value)} />
            </FinanzasFormField>
            <FinanzasFormField label="Motivo (opcional)" htmlFor="adm-motivo">
              <input id="adm-motivo" className={finanzasInputClass} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </FinanzasFormField>
            <button type="button" className="btn-brand-secondary w-full rounded-lg py-2" onClick={() => void reasignar()}>
              Cambiar responsable (caja seleccionada)
            </button>
            <div>
              <h3 className="font-medium">Cierres pendientes de aprobación</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {cierres
                  .filter((r) => r.estado === 'cerrada')
                  .map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded border p-2">
                      <span>
                        {formatFecha(r.periodoHasta)}
                        {r.diferencia ? ` · dif. ${formatMoneyCentavos(r.diferencia, monedaCajaSeleccionada)}` : ''}
                      </span>
                      <button type="button" className="text-brand-primary font-medium" onClick={() => void aprobar(r.id)}>
                        Aprobar
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        ) : null}
        <button type="button" className="mt-6 w-full text-sm text-neutral-500" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  )
}
