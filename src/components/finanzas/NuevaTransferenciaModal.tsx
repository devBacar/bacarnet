import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { fetchFinanzasCuentas, type FinanzasCuenta } from '../../services/finanzasApi'
import {
  TransferenciaDirectaError,
  confeccionarTransferenciaDirecta,
  fetchDestinatarios,
  type DestinatarioItem,
  type DestinatarioTipo,
  type TipoCuentaDestinatario,
  type TransferenciaDirectaTipo,
} from '../../services/finanzasTransferenciasApi'
import { FinanzasFormField, finanzasInputClass } from './FinanzasFormField'
import {
  AVISO_MOTIVO_TRANSFERENCIA,
  CONCEPTO_TERCEROS_DEFAULT,
  CONCEPTOS_TRANSFERENCIA_TERCEROS,
  conceptoTransferenciaPorCodigo,
} from './conceptosTransferencia'
import { MAX_OBSERVACION_INTERBANKING, soloDigitos, validarCbu, validarCuitOpcional } from './cbuCuit'
import { formatMoneyCentavos } from './formatMoney'
import { parseMontoEsArACentavos } from './montoEsAr'

const TIPOS: Array<{ id: TransferenciaDirectaTipo; label: string }> = [
  { id: 'cuentas_propias', label: 'Entre cuentas propias' },
  { id: 'terceros', label: 'A terceros' },
  { id: 'proveedores', label: 'A proveedores' },
]

const TIPOS_CUENTA: Array<{ id: TipoCuentaDestinatario; label: string }> = [
  { id: 'CC', label: 'Cuenta corriente' },
  { id: 'CA', label: 'Caja de ahorro' },
]

const MENSAJE_TIPO_CUENTA = 'Elegí si la cuenta del destinatario es cuenta corriente o caja de ahorro'

function etiquetaTipoCuenta(tipo: TipoCuentaDestinatario | null): string {
  return TIPOS_CUENTA.find((opcion) => opcion.id === tipo)?.label ?? ''
}

function SelectorTipoCuenta({
  value,
  onChange,
}: {
  value: TipoCuentaDestinatario | null
  onChange: (next: TipoCuentaDestinatario) => void
}) {
  return (
    <div>
      <p className="text-body-muted mb-1 text-sm font-medium">Tipo de cuenta</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de cuenta">
        {TIPOS_CUENTA.map((opcion) => {
          const activo = value === opcion.id
          return (
            <button
              key={opcion.id}
              type="button"
              aria-pressed={activo}
              className={`min-h-14 rounded-xl border px-2 py-3 text-sm font-semibold ${
                activo
                  ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                  : 'border-neutral-200 hover:border-neutral-300 dark:border-zinc-700 dark:hover:border-zinc-500'
              }`}
              onClick={() => onChange(opcion.id)}
            >
              {opcion.label}
            </button>
          )
        })}
      </div>
      <p className="text-body-muted mt-2 text-xs">
        Figura en la factura o en los datos bancarios del proveedor.
      </p>
    </div>
  )
}

function cuentasEnPesos(cuentas: FinanzasCuenta[]): FinanzasCuenta[] {
  return cuentas.filter((cuenta) => cuenta.tipo === 'CC' && cuenta.moneda === 'ARS')
}

function disponibleDe(cuenta: FinanzasCuenta): number {
  return cuenta.saldoActualCentavos + (cuenta.descubiertoCentavos ?? 0)
}

function etiqueta(cuenta: FinanzasCuenta): string {
  return `${cuenta.bancoNombre} CC`
}

function useDebounced(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function NuevaTransferenciaModal({
  onClose,
  cuentaOrigenId,
}: {
  onClose: () => void
  cuentaOrigenId?: string
}) {
  const queryClient = useQueryClient()
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [cuentaDebitoId, setCuentaDebitoId] = useState(cuentaOrigenId ?? '')
  const [tipo, setTipo] = useState<TransferenciaDirectaTipo>('terceros')
  const [cuentaDestinoId, setCuentaDestinoId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [elegido, setElegido] = useState<DestinatarioItem | null>(null)
  const [modoNuevo, setModoNuevo] = useState(false)
  const [cbu, setCbu] = useState('')
  const [nombre, setNombre] = useState('')
  const [cuit, setCuit] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuentaDestinatario | null>(null)
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')
  const [codigoConcepto, setCodigoConcepto] = useState(CONCEPTO_TERCEROS_DEFAULT)
  const [disclaimerAceptado, setDisclaimerAceptado] = useState(false)
  const [referencia, setReferencia] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [avisoFondos, setAvisoFondos] = useState<number | null>(null)
  const enviandoRef = useRef(false)

  const busquedaDebounced = useDebounced(busqueda)
  const { data: cuentasData, isLoading: cargandoCuentas } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
  })
  const cuentas = cuentasEnPesos(cuentasData?.cuentas ?? [])
  const origen = cuentas.find((cuenta) => cuenta.id === cuentaDebitoId) ?? null
  const destinoPropia = cuentas.find((cuenta) => cuenta.id === cuentaDestinoId) ?? null
  const otras = cuentas.filter((cuenta) => cuenta.id !== cuentaDebitoId)

  const { data: agenda = [], isFetching: buscando } = useQuery({
    queryKey: ['finanzas', 'destinatarios', tipo, busquedaDebounced],
    queryFn: () => fetchDestinatarios({ q: busquedaDebounced, tipo: tipo as DestinatarioTipo }),
    enabled: step === 2 && tipo !== 'cuentas_propias',
  })

  const cbuNuevo = validarCbu(cbu)
  const cuitNuevo = validarCuitOpcional(cuit)
  const centavos = parseMontoEsArACentavos(monto)

  const destinoNombre =
    tipo === 'cuentas_propias'
      ? destinoPropia
        ? etiqueta(destinoPropia)
        : ''
      : (elegido?.nombre ?? nombre.trim())
  const destinoCbu =
    tipo === 'cuentas_propias' ? '' : (elegido?.cbu ?? (cbuNuevo.ok ? cbuNuevo.valor : soloDigitos(cbu)))

  function limpiarDestino(next: TransferenciaDirectaTipo) {
    setTipo(next)
    setCuentaDestinoId('')
    setElegido(null)
    setModoNuevo(false)
    setBusqueda('')
    setCbu('')
    setNombre('')
    setCuit('')
    setTipoCuenta(null)
    setCodigoConcepto(CONCEPTO_TERCEROS_DEFAULT)
    setDisclaimerAceptado(false)
    setError('')
  }

  function validarPaso(): boolean {
    if (step === 1) {
      if (!origen) {
        setError('Elegí una cuenta corriente en pesos')
        return false
      }
      return true
    }
    if (step === 2) {
      if (tipo === 'cuentas_propias') {
        if (!destinoPropia) {
          setError('Elegí la cuenta de destino')
          return false
        }
        if (destinoPropia.id === origen?.id) {
          setError('La cuenta de destino no puede ser la misma que la de débito')
          return false
        }
        return true
      }
      if (!elegido) {
        if (!modoNuevo) {
          setError('Elegí un destinatario o cargá uno nuevo')
          return false
        }
        if (!cbuNuevo.ok) {
          setError(cbuNuevo.error)
          return false
        }
        if (!nombre.trim()) {
          setError('El nombre del destinatario es obligatorio')
          return false
        }
        if (!cuitNuevo.ok) {
          setError(cuitNuevo.error)
          return false
        }
      }
      if (tipoCuenta !== 'CC' && tipoCuenta !== 'CA') {
        setError(MENSAJE_TIPO_CUENTA)
        return false
      }
      return true
    }
    if (step === 3) {
      if (centavos == null) {
        setError('Ingresá un monto mayor a cero. Usá coma para los centavos, por ejemplo 1.250,50')
        return false
      }
      const conceptoLimpio = concepto.trim()
      if (!conceptoLimpio) {
        setError('El concepto es obligatorio')
        return false
      }
      if (conceptoLimpio.length > MAX_OBSERVACION_INTERBANKING) {
        setError(`El concepto no puede pasar de ${MAX_OBSERVACION_INTERBANKING} caracteres`)
        return false
      }
      if (referencia.trim().length > MAX_OBSERVACION_INTERBANKING) {
        setError(`La referencia no puede pasar de ${MAX_OBSERVACION_INTERBANKING} caracteres`)
        return false
      }
      if (tipo === 'terceros' && conceptoTransferenciaPorCodigo(codigoConcepto)?.requiereDisclaimer && !disclaimerAceptado) {
        setError('Tenés que aceptar el aviso para este motivo')
        return false
      }
      return true
    }
    return true
  }

  async function enviar(confirmarSinFondos: boolean) {
    if (!origen || centavos == null || enviandoRef.current) return
    enviandoRef.current = true
    setEnviando(true)
    setError('')
    try {
      if (tipo !== 'cuentas_propias' && tipoCuenta !== 'CC' && tipoCuenta !== 'CA') {
        setError(MENSAJE_TIPO_CUENTA)
        return
      }
      const destino =
        tipo === 'cuentas_propias'
          ? { cuentaId: cuentaDestinoId }
          : {
              cbu: elegido?.cbu ?? (cbuNuevo.ok ? cbuNuevo.valor : ''),
              nombre: elegido?.nombre ?? nombre.trim(),
              cuit: elegido ? elegido.cuit : cuitNuevo.ok ? cuitNuevo.valor || null : null,
              tipoCuenta: tipoCuenta === 'CC' || tipoCuenta === 'CA' ? tipoCuenta : undefined,
            }
      await confeccionarTransferenciaDirecta({
        cuentaDebitoId: origen.id,
        tipo,
        destino,
        montoCentavos: centavos,
        concepto: concepto.trim(),
        referencia: referencia.trim() || undefined,
        ...(tipo === 'terceros'
          ? { codigoConcepto, disclaimerAceptado }
          : {}),
        idempotencyKey,
        confirmarSinFondos,
      })
      toast.success('Transferencia confeccionada. Queda pendiente de aprobación en Interbanking.')
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'transferencias'] })
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'destinatarios'] })
      onClose()
    } catch (err) {
      if (err instanceof TransferenciaDirectaError && err.requiereConfirmacion) {
        setAvisoFondos(err.disponibleCentavos ?? 0)
        return
      }
      toast.error(err instanceof Error ? err.message : 'No se pudo confeccionar la transferencia')
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  const cbuResumen = tipo === 'cuentas_propias' ? '' : destinoCbu
  const ultimos4 = cbuResumen.slice(-4)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div
        role="dialog"
        aria-labelledby="nueva-transferencia-titulo"
        className="surface-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 p-4 dark:border-zinc-700 sm:p-6"
      >
        <p className="text-body-muted text-xs">Paso {step} de 4</p>
        <h2 id="nueva-transferencia-titulo" className="text-heading text-lg font-semibold">
          Nueva transferencia
        </h2>

        {step === 1 ? (
          <div className="mt-4 space-y-4">
            <FinanzasFormField label="Cuenta de origen">
              <select
                className={finanzasInputClass}
                value={cuentas.some((cuenta) => cuenta.id === cuentaDebitoId) ? cuentaDebitoId : ''}
                onChange={(event) => {
                  setCuentaDebitoId(event.target.value)
                  setError('')
                }}
                disabled={cargandoCuentas}
              >
                <option value="">Elegí una cuenta</option>
                {cuentas.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {etiqueta(cuenta)}
                  </option>
                ))}
              </select>
            </FinanzasFormField>
            {origen ? (
              <p className="text-sm">
                Saldo {formatMoneyCentavos(origen.saldoActualCentavos, 'ARS')}
                {' · '}
                Disponible {formatMoneyCentavos(disponibleDe(origen), 'ARS')}
                {origen.descubiertoCentavos
                  ? ` (incluye descubierto de ${formatMoneyCentavos(origen.descubiertoCentavos, 'ARS')})`
                  : ''}
              </p>
            ) : null}
            <FinanzasFormField label="Tipo">
              <select
                className={finanzasInputClass}
                value={tipo}
                onChange={(event) => limpiarDestino(event.target.value as TransferenciaDirectaTipo)}
              >
                {TIPOS.map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.label}
                  </option>
                ))}
              </select>
            </FinanzasFormField>
          </div>
        ) : null}

        {step === 2 && tipo === 'cuentas_propias' ? (
          <div className="mt-4">
            <FinanzasFormField label="Cuenta de destino">
              <select
                className={finanzasInputClass}
                value={cuentaDestinoId}
                onChange={(event) => {
                  setCuentaDestinoId(event.target.value)
                  setError('')
                }}
              >
                <option value="">Elegí otra cuenta</option>
                {otras.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {etiqueta(cuenta)} · Disponible {formatMoneyCentavos(disponibleDe(cuenta), 'ARS')}
                  </option>
                ))}
              </select>
            </FinanzasFormField>
            {otras.length === 0 ? (
              <p className="text-body-muted mt-2 text-sm">No hay otra cuenta corriente en pesos.</p>
            ) : null}
          </div>
        ) : null}

        {step === 2 && tipo !== 'cuentas_propias' ? (
          <div className="mt-4 space-y-3">
            {elegido && !modoNuevo ? (
              <div className="rounded-xl border border-neutral-200 p-3 dark:border-zinc-700">
                <p className="font-medium">{elegido.nombre}</p>
                <p className="text-body-muted break-all text-xs">{elegido.cbu}</p>
                {elegido.cuit ? <p className="text-body-muted text-xs">CUIT {elegido.cuit}</p> : null}
                <button
                  type="button"
                  className="mt-2 text-sm underline"
                  onClick={() => {
                    setElegido(null)
                    setTipoCuenta(null)
                  }}
                >
                  Elegir otro
                </button>
              </div>
            ) : (
              <>
                <FinanzasFormField label="Buscar en la agenda" optional>
                  <input
                    className={finanzasInputClass}
                    value={busqueda}
                    placeholder="Nombre, CUIT, CBU o alias"
                    onChange={(event) => {
                      setBusqueda(event.target.value)
                      setModoNuevo(false)
                      setError('')
                    }}
                  />
                </FinanzasFormField>
                {buscando ? <p className="text-body-muted text-xs">Buscando…</p> : null}
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {agenda.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        onClick={() => {
                          setElegido(item)
                          setModoNuevo(false)
                          setTipoCuenta(item.tipoCuenta ?? null)
                          setError('')
                        }}
                      >
                        <span className="font-medium">{item.nombre}</span>
                        {item.sugerido ? (
                          <span className="text-body-muted ml-2 text-xs">Sugerido del historial</span>
                        ) : null}
                        <span className="text-body-muted block break-all text-xs">
                          {item.alias ? `${item.alias} · ` : ''}
                          {item.cbu}
                          {etiquetaTipoCuenta(item.tipoCuenta) ? ` · ${etiquetaTipoCuenta(item.tipoCuenta)}` : ''}
                          {item.cuit ? ` · ${item.cuit}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="text-sm font-medium underline"
                  onClick={() => {
                    setModoNuevo(true)
                    setElegido(null)
                    setTipoCuenta(null)
                    setError('')
                  }}
                >
                  Nuevo destinatario
                </button>
                {modoNuevo ? (
                  <div className="space-y-3">
                    <FinanzasFormField label="CBU">
                      <input
                        className={finanzasInputClass}
                        inputMode="numeric"
                        value={cbu}
                        onChange={(event) => {
                          setCbu(soloDigitos(event.target.value).slice(0, 22))
                          setError('')
                        }}
                      />
                    </FinanzasFormField>
                    {cbu.length > 0 ? (
                      <p className={`text-xs ${cbuNuevo.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {cbuNuevo.ok ? 'CBU válido' : cbuNuevo.error}
                      </p>
                    ) : null}
                    <FinanzasFormField label="Nombre">
                      <input
                        className={finanzasInputClass}
                        value={nombre}
                        onChange={(event) => setNombre(event.target.value)}
                      />
                    </FinanzasFormField>
                    <FinanzasFormField label="CUIT" optional>
                      <input
                        className={finanzasInputClass}
                        value={cuit}
                        onChange={(event) => setCuit(event.target.value)}
                      />
                    </FinanzasFormField>
                    {cuit.trim() && !cuitNuevo.ok ? (
                      <p className="text-xs text-red-700 dark:text-red-300">{cuitNuevo.error}</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
            <SelectorTipoCuenta
              value={tipoCuenta}
              onChange={(next) => {
                setTipoCuenta(next)
                setError('')
              }}
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-4 space-y-4">
            <FinanzasFormField label="Monto">
              <input
                className={finanzasInputClass}
                inputMode="decimal"
                placeholder="0,00"
                value={monto}
                onChange={(event) => {
                  setMonto(event.target.value)
                  setAvisoFondos(null)
                  setError('')
                }}
              />
            </FinanzasFormField>
            {centavos != null ? (
              <p className="text-sm tabular-nums">{formatMoneyCentavos(centavos, 'ARS')}</p>
            ) : null}
            {tipo === 'terceros' ? (
              <div className="space-y-2">
                <FinanzasFormField label="Motivo del pago">
                  <select
                    className={finanzasInputClass}
                    value={codigoConcepto}
                    onChange={(event) => {
                      setCodigoConcepto(event.target.value)
                      setDisclaimerAceptado(false)
                      setError('')
                    }}
                  >
                    {CONCEPTOS_TRANSFERENCIA_TERCEROS.map((opcion) => (
                      <option key={opcion.codigo} value={opcion.codigo}>
                        {opcion.rotulo}
                      </option>
                    ))}
                  </select>
                </FinanzasFormField>
                <p className="text-body-muted text-xs">
                  El banco pide un motivo de esta lista. Varios sirve si ninguno encaja.
                </p>
                {conceptoTransferenciaPorCodigo(codigoConcepto)?.requiereDisclaimer ? (
                  <div className="space-y-2 rounded-xl border border-amber-600 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
                    <p>{AVISO_MOTIVO_TRANSFERENCIA}</p>
                    <label className="flex items-start gap-2 font-medium">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={disclaimerAceptado}
                        onChange={(event) => {
                          setDisclaimerAceptado(event.target.checked)
                          setError('')
                        }}
                      />
                      <span>Acepto este aviso</span>
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
            <FinanzasFormField label="Concepto">
              <input
                className={finanzasInputClass}
                maxLength={MAX_OBSERVACION_INTERBANKING}
                value={concepto}
                onChange={(event) => setConcepto(event.target.value)}
              />
            </FinanzasFormField>
            <p className="text-body-muted text-xs">
              {concepto.trim().length}/{MAX_OBSERVACION_INTERBANKING}
            </p>
            <FinanzasFormField label="Referencia" optional>
              <input
                className={finanzasInputClass}
                maxLength={MAX_OBSERVACION_INTERBANKING}
                value={referencia}
                onChange={(event) => setReferencia(event.target.value)}
              />
            </FinanzasFormField>
          </div>
        ) : null}

        {step === 4 && origen && centavos != null ? (
          <div className="mt-4 space-y-3 text-sm">
            <p>
              {tipo === 'cuentas_propias'
                ? `Vas a confeccionar ${formatMoneyCentavos(centavos, 'ARS')} desde ${etiqueta(origen)} a ${destinoNombre}. Queda pendiente de aprobación en Interbanking.`
                : `Vas a confeccionar ${formatMoneyCentavos(centavos, 'ARS')} desde ${etiqueta(origen)} a ${destinoNombre} · ${etiquetaTipoCuenta(tipoCuenta)} · CBU …${ultimos4}. Queda pendiente de aprobación en Interbanking.`}
            </p>
            <ul className="text-body-muted space-y-1">
              {tipo === 'terceros' ? (
                <li>Motivo: {conceptoTransferenciaPorCodigo(codigoConcepto)?.rotulo ?? codigoConcepto}</li>
              ) : null}
              <li>Concepto: {concepto.trim()}</li>
              {referencia.trim() ? <li>Referencia: {referencia.trim()}</li> : null}
              {tipo !== 'cuentas_propias' && destinoCbu ? (
                <li className="break-all">CBU completo: {destinoCbu}</li>
              ) : null}
            </ul>
            {avisoFondos != null ? (
              <div className="rounded-xl border border-amber-600 bg-amber-50 p-3 text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-medium">
                  El monto supera el disponible de la cuenta ({formatMoneyCentavos(avisoFondos, 'ARS')}).
                </p>
                <p className="mt-1">
                  Podés confeccionarla igual. Queda pendiente de aprobación en Interbanking y el banco puede
                  rechazarla si no alcanza.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-lg px-4 py-2.5 text-sm"
            disabled={enviando}
            onClick={() => {
              setError('')
              if (step === 1) onClose()
              else {
                if (step === 4) setAvisoFondos(null)
                setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev))
              }
            }}
          >
            {step === 1 ? 'Cancelar' : 'Volver'}
          </button>
          {step < 4 ? (
            <button
              type="button"
              className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              onClick={() => {
                setError('')
                if (!validarPaso()) return
                setStep((prev) => (prev < 4 ? ((prev + 1) as 1 | 2 | 3 | 4) : prev))
              }}
            >
              Siguiente
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              disabled={enviando}
              onClick={() => void enviar(avisoFondos != null)}
            >
              {enviando
                ? 'Confeccionando…'
                : avisoFondos != null
                  ? 'Confeccionar igual'
                  : 'Confeccionar transferencia'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
