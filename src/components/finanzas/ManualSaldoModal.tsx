import { useEffect, useState } from 'react'

import type { FinanzasCuenta } from '../../services/finanzasApi'

interface ManualSaldoModalProps {
  cuenta: FinanzasCuenta | null
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (saldoUsdInput: string) => void
}

/** Convierte entrada en pesos/dólares decimales a centavos (USD). */
export function parseUsdInputToCentavos(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (!normalized) return null
  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

export function formatUsdInputFromCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function ManualSaldoModal({ cuenta, open, saving, onClose, onSave }: ManualSaldoModalProps) {
  const [input, setInput] = useState('')

  useEffect(() => {
    if (open && cuenta) {
      setInput(formatUsdInputFromCentavos(cuenta.saldoActualCentavos))
    }
  }, [open, cuenta])

  if (!open || !cuenta) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-saldo-title"
    >
      <div className="surface-card w-full max-w-md rounded-2xl border border-neutral-200 p-6 shadow-xl dark:border-zinc-700">
        <h2 id="manual-saldo-title" className="text-heading text-lg font-semibold">
          Saldo manual — {cuenta.bancoNombre} USD
        </h2>
        <p className="text-body-muted mt-2 text-sm">
          Interbanking no expone esta cuenta hoy. Ingresá el saldo en dólares (USD).
        </p>
        <label className="mt-4 block text-sm font-medium text-neutral-800 dark:text-gray-200">
          Saldo actual (USD)
          <input
            type="text"
            inputMode="decimal"
            className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={saving}
          />
        </label>
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
            onClick={() => onSave(input)}
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
