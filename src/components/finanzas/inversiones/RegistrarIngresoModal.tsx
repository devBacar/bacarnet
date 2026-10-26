import { useRef, useState } from 'react'
import {
  registrarIngreso,
  type IngresoInput,
  type InversionDetalle,
} from '../../../services/finanzasInversionesApi'
import {
  armarIngresoInput,
  CamposIngresoCapital,
  claveIngresoNueva,
  estadoIngresoInicial,
  type CamposIngresoState,
} from './CamposIngresoCapital'

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
  const claveRef = useRef(claveIngresoNueva())
  const [campos, setCampos] = useState<CamposIngresoState>(() => estadoIngresoInicial(montoSugeridoCentavos))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setError(null)
    const armado = armarIngresoInput(claveRef.current, campos)
    if (!armado.ok) {
      setError(armado.error)
      return
    }

    setGuardando(true)
    try {
      const detalle = await registrarConReintento(inversionId, armado.input)
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

        <div className="mt-4">
          <CamposIngresoCapital moneda={moneda} value={campos} onChange={setCampos} idPrefix="ri" />
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
