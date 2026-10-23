import { useState } from 'react'
import {
  cuotaEnPesos,
  type FuenteTipoCambio,
  type InversionDetalle,
  type TipoCambioPactado,
} from '../../../services/finanzasInversionesApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { parseMontoEsArACentavos } from '../montoEsAr'

function hoyLocal(): string {
  const f = new Date()
  const m = String(f.getMonth() + 1).padStart(2, '0')
  const d = String(f.getDate()).padStart(2, '0')
  return `${f.getFullYear()}-${m}-${d}`
}

type Props = {
  inversionId: string
  numeroCuota: number
  /** Si la cuota ya se paga en pesos, para precargar. */
  actual: TipoCambioPactado | null | undefined
  onClose: () => void
  onGuardado: (detalle: InversionDetalle) => void
}

export function CuotaEnPesosModal({ inversionId, numeroCuota, actual, onClose, onGuardado }: Props) {
  const [tc, setTc] = useState(
    actual
      ? (actual.centavosPorUsd / 100).toLocaleString('es-AR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '',
  )
  const [fuente, setFuente] = useState<FuenteTipoCambio>(actual?.fuente ?? 'pactado')
  const [fecha, setFecha] = useState(actual?.fecha ?? hoyLocal())
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardarPesos = async () => {
    setError(null)
    const centavosPorUsd = parseMontoEsArACentavos(tc)
    if (centavosPorUsd == null) {
      setError('Poné el tipo de cambio (pesos por dólar).')
      return
    }
    if (!fecha) {
      setError('Poné la fecha del tipo de cambio.')
      return
    }
    setGuardando(true)
    try {
      const detalle = await cuotaEnPesos(inversionId, numeroCuota, {
        centavosPorUsd,
        fuente,
        fecha,
      })
      onGuardado(detalle)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude cambiar la moneda de la cuota')
    } finally {
      setGuardando(false)
    }
  }

  const volverDolares = async () => {
    if (!window.confirm('¿Volver a pagar esta cuota en dólares?')) return
    setError(null)
    setGuardando(true)
    try {
      const detalle = await cuotaEnPesos(inversionId, numeroCuota, null)
      onGuardado(detalle)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude cambiar la moneda de la cuota')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cuota-pesos-titulo"
        className="surface-card max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700 sm:p-6"
      >
        <h2 id="cuota-pesos-titulo" className="text-heading text-lg font-semibold">
          Pagar cuota {numeroCuota} en pesos
        </h2>
        <p className="text-body-muted mt-2 text-sm">
          Indicá el tipo de cambio. La cuota queda marcada para pagarse en pesos.
        </p>

        <div className="mt-4 space-y-3">
          <FinanzasFormField label="Tipo de cambio (pesos por dólar)" htmlFor="cep-tc">
            <input
              id="cep-tc"
              type="text"
              inputMode="decimal"
              value={tc}
              onChange={(e) => setTc(e.target.value)}
              placeholder="Ej.: 1.050,25"
              className={finanzasInputClass}
            />
          </FinanzasFormField>
          <FinanzasFormField label="Fuente" htmlFor="cep-fuente">
            <select
              id="cep-fuente"
              value={fuente}
              onChange={(e) => setFuente(e.target.value as FuenteTipoCambio)}
              className={finanzasInputClass}
            >
              <option value="pactado">Pactado</option>
              <option value="bna_vendedor">BNA vendedor</option>
              <option value="mep">MEP</option>
            </select>
          </FinanzasFormField>
          <FinanzasFormField label="Fecha del tipo de cambio" htmlFor="cep-fecha">
            <input
              id="cep-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        </div>

        {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {actual ? (
            <button
              type="button"
              onClick={() => void volverDolares()}
              disabled={guardando}
              className="mr-auto rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Volver a dólares
            </button>
          ) : null}
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
            onClick={() => void guardarPesos()}
            disabled={guardando}
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
