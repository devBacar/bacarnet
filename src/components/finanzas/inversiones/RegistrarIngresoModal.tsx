import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { fetchFinanzasCuentas } from '../../../services/finanzasApi'
import { fetchCajas } from '../../../services/finanzasCajasApi'
import {
  registrarIngreso,
  type IngresoInput,
  type InversionDetalle,
  type MedioIngreso,
} from '../../../services/finanzasInversionesApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { parseMontoEsArACentavos } from '../montoEsAr'

function hoyLocal(): string {
  const f = new Date()
  const m = String(f.getMonth() + 1).padStart(2, '0')
  const d = String(f.getDate()).padStart(2, '0')
  return `${f.getFullYear()}-${m}-${d}`
}

function sleep(ms: number) {
  return new Promise((r) => window.setTimeout(r, ms))
}

/** 409 EnCurso: el mensaje del backend incluye esta frase. */
function esConflictoEnCurso(err: unknown): boolean {
  return err instanceof Error && err.message.includes('ya se está registrando')
}

async function registrarConReintento(
  inversionId: string,
  input: IngresoInput,
): Promise<InversionDetalle> {
  let ultimo: unknown
  for (let intento = 0; intento < 4; intento++) {
    try {
      return await registrarIngreso(inversionId, input)
    } catch (e) {
      ultimo = e
      if (!esConflictoEnCurso(e) || intento === 3) throw e
      await sleep(2000)
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error('No pude registrar el ingreso')
}

type Props = {
  inversionId: string
  moneda: 'ARS' | 'USD'
  /** Sugerencia: lo que falta ingresar. */
  montoSugeridoCentavos?: number
  onClose: () => void
  onGuardado: (detalle: InversionDetalle) => void
}

export function RegistrarIngresoModal({
  inversionId,
  moneda,
  montoSugeridoCentavos,
  onClose,
  onGuardado,
}: Props) {
  const claveRef = useRef(crypto.randomUUID())
  const [medio, setMedio] = useState<MedioIngreso>('transferencia')
  const [fecha, setFecha] = useState(hoyLocal())
  const [monto, setMonto] = useState(
    montoSugeridoCentavos && montoSugeridoCentavos > 0
      ? (montoSugeridoCentavos / 100).toLocaleString('es-AR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '',
  )
  const [cuentaId, setCuentaId] = useState('')
  const [cajaId, setCajaId] = useState('')
  const [chequeTipo, setChequeTipo] = useState<'echeq' | 'fisico'>('echeq')
  const [chequeNumero, setChequeNumero] = useState('')
  const [chequeBanco, setChequeBanco] = useState('')
  const [chequeFechaPago, setChequeFechaPago] = useState(hoyLocal())
  const [chequeEmisor, setChequeEmisor] = useState('')
  const [chequeCuit, setChequeCuit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cuentasQ = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: medio === 'transferencia',
  })
  const cajasQ = useQuery({
    queryKey: ['finanzas', 'cajas'],
    queryFn: fetchCajas,
    enabled: medio === 'efectivo',
  })

  const cuentas = (cuentasQ.data?.cuentas ?? []).filter((c) => c.moneda === moneda)
  const cajas = (cajasQ.data ?? []).filter(
    (c) => c.moneda === moneda && c.estado !== 'inactiva' && c.tipo !== 'chica',
  )

  const guardar = async () => {
    setError(null)
    const montoCentavos = parseMontoEsArACentavos(monto)
    if (montoCentavos == null) {
      setError('Poné el monto que entró.')
      return
    }

    const input: IngresoInput = {
      clave: claveRef.current,
      medio,
      fecha,
      montoCentavos,
    }

    if (medio === 'transferencia') {
      if (!cuentaId) {
        setError('Elegí la cuenta donde entró la transferencia.')
        return
      }
      input.cuentaId = cuentaId
    } else if (medio === 'efectivo') {
      if (!cajaId) {
        setError('Elegí la caja donde entra el efectivo.')
        return
      }
      input.cajaId = cajaId
    } else {
      if (!chequeNumero.trim() || !chequeEmisor.trim() || !chequeFechaPago) {
        setError('Completá los datos del cheque.')
        return
      }
      input.cheque = {
        tipo: chequeTipo,
        numero: chequeNumero.trim(),
        bancoEmisor: chequeBanco.trim() || null,
        fechaPago: chequeFechaPago,
        emisor: chequeEmisor.trim(),
        emisorCuit: chequeCuit.trim() || null,
      }
    }

    setGuardando(true)
    try {
      const detalle = await registrarConReintento(inversionId, input)
      onGuardado(detalle)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude registrar el ingreso')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reg-ingreso-titulo"
        className="surface-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700 sm:p-6"
      >
        <h2 id="reg-ingreso-titulo" className="text-heading text-lg font-semibold">
          Registrar ingreso
        </h2>
        <p className="text-body-muted mt-2 text-sm">
          Anotá la plata del capital que ya entró (transferencia, efectivo o cheque).
        </p>

        <div className="mt-4 space-y-3">
          <FinanzasFormField label="Medio" htmlFor="ri-medio">
            <select
              id="ri-medio"
              value={medio}
              onChange={(e) => setMedio(e.target.value as MedioIngreso)}
              className={finanzasInputClass}
            >
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
            </select>
          </FinanzasFormField>

          {medio !== 'cheque' ? (
            <FinanzasFormField label="Fecha" htmlFor="ri-fecha">
              <input
                id="ri-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={finanzasInputClass}
              />
            </FinanzasFormField>
          ) : null}

          <FinanzasFormField
            label={moneda === 'USD' ? 'Monto (dólares)' : 'Monto (pesos)'}
            htmlFor="ri-monto"
          >
            <input
              id="ri-monto"
              type="text"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Ej.: 10.000,00"
              className={finanzasInputClass}
            />
          </FinanzasFormField>

          {medio === 'transferencia' ? (
            <FinanzasFormField label="Cuenta" htmlFor="ri-cuenta">
              <select
                id="ri-cuenta"
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className={finanzasInputClass}
              >
                <option value="">Elegí la cuenta</option>
                {cuentas.length === 0 ? (
                  <option value="" disabled>
                    No hay cuentas en esta moneda
                  </option>
                ) : (
                  cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.bancoNombre} · {c.tipoLabel}
                    </option>
                  ))
                )}
              </select>
            </FinanzasFormField>
          ) : null}

          {medio === 'efectivo' ? (
            <FinanzasFormField label="Caja" htmlFor="ri-caja">
              <select
                id="ri-caja"
                value={cajaId}
                onChange={(e) => setCajaId(e.target.value)}
                className={finanzasInputClass}
              >
                <option value="">Elegí la caja</option>
                {cajas.length === 0 ? (
                  <option value="" disabled>
                    No hay cajas principales en esta moneda
                  </option>
                ) : (
                  cajas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))
                )}
              </select>
            </FinanzasFormField>
          ) : null}

          {medio === 'cheque' ? (
            <>
              <FinanzasFormField label="Tipo de cheque" htmlFor="ri-ch-tipo">
                <select
                  id="ri-ch-tipo"
                  value={chequeTipo}
                  onChange={(e) => setChequeTipo(e.target.value as 'echeq' | 'fisico')}
                  className={finanzasInputClass}
                >
                  <option value="echeq">Echeq</option>
                  <option value="fisico">Físico</option>
                </select>
              </FinanzasFormField>
              <FinanzasFormField label="Número" htmlFor="ri-ch-num">
                <input
                  id="ri-ch-num"
                  type="text"
                  value={chequeNumero}
                  onChange={(e) => setChequeNumero(e.target.value)}
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <FinanzasFormField label="Emisor" htmlFor="ri-ch-emisor">
                <input
                  id="ri-ch-emisor"
                  type="text"
                  value={chequeEmisor}
                  onChange={(e) => setChequeEmisor(e.target.value)}
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <FinanzasFormField label="Fecha de pago" htmlFor="ri-ch-fecha">
                <input
                  id="ri-ch-fecha"
                  type="date"
                  value={chequeFechaPago}
                  onChange={(e) => setChequeFechaPago(e.target.value)}
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <FinanzasFormField label="Banco emisor" htmlFor="ri-ch-banco" optional>
                <input
                  id="ri-ch-banco"
                  type="text"
                  value={chequeBanco}
                  onChange={(e) => setChequeBanco(e.target.value)}
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <FinanzasFormField label="CUIT del emisor" htmlFor="ri-ch-cuit" optional>
                <input
                  id="ri-ch-cuit"
                  type="text"
                  value={chequeCuit}
                  onChange={(e) => setChequeCuit(e.target.value)}
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
            </>
          ) : null}
        </div>

        {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando}
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
