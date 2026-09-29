import { useEffect, useState } from 'react'

import type { FinanzasCuenta } from '../../services/finanzasApi'
import { formatUsdInputFromCentavos, parseUsdInputToCentavos } from './ManualSaldoModal'

interface DescubiertoModalProps {
  cuenta: FinanzasCuenta | null
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (body: { descubiertoCentavos: number | null; vigenteDesde: string | null }) => void
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(iso),
  )
}

/** Carga manual del acuerdo de descubierto de una CC: Interbanking no informa el límite. */
export function DescubiertoModal({ cuenta, open, saving, onClose, onSave }: DescubiertoModalProps) {
  const [monto, setMonto] = useState('')
  const [vigenteDesde, setVigenteDesde] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && cuenta) {
      setMonto(
        cuenta.descubiertoCentavos != null ? formatUsdInputFromCentavos(cuenta.descubiertoCentavos) : '',
      )
      setVigenteDesde(isoToDateInput(cuenta.descubiertoVigenteDesde))
      setError(null)
    }
  }, [open, cuenta])

  if (!open || !cuenta) return null

  const hoy = isoToDateInput(new Date().toISOString())

  const handleSave = () => {
    if (!monto.trim()) {
      onSave({ descubiertoCentavos: null, vigenteDesde: null })
      return
    }
    const centavos = parseUsdInputToCentavos(monto)
    if (centavos === null || centavos < 0) {
      setError('Ingresá el límite acordado como monto positivo (ej. 50.000.000,00)')
      return
    }
    onSave({ descubiertoCentavos: centavos, vigenteDesde: vigenteDesde || null })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="descubierto-title"
    >
      <div className="surface-card w-full max-w-md rounded-2xl border border-neutral-200 p-6 shadow-xl dark:border-zinc-700">
        <h2 id="descubierto-title" className="text-heading text-lg font-semibold">
          Descubierto — {cuenta.bancoNombre} CC
        </h2>
        <p className="text-body-muted mt-2 text-sm">
          Interbanking no informa el acuerdo de descubierto: cargá el límite que otorgó el banco. El
          semáforo lo compara con el saldo real de cada sincronización. Dejalo vacío si la cuenta no
          tiene acuerdo.
        </p>
        <label className="mt-4 block text-sm font-medium text-neutral-800 dark:text-gray-200">
          Límite acordado (ARS)
          <input
            type="text"
            inputMode="decimal"
            placeholder="Sin acuerdo"
            className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
            value={monto}
            onChange={(e) => {
              setMonto(e.target.value)
              setError(null)
            }}
            disabled={saving}
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-neutral-800 dark:text-gray-200">
          Vigente desde (opcional)
          <input
            type="date"
            max={hoy}
            className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={vigenteDesde}
            onChange={(e) => setVigenteDesde(e.target.value)}
            disabled={saving}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
