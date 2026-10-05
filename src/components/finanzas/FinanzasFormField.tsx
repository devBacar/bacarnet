import type { ReactNode } from 'react'

const inputClass = 'input-surface w-full rounded-lg border px-3 py-2'

type FinanzasFormFieldProps = {
  label: string
  htmlFor?: string
  optional?: boolean
  /** Marca data-tour para las guías de Ayuda. */
  tour?: string
  children: ReactNode
}

/**
 * Campo de formulario del módulo Finanzas: etiqueta siempre visible (ver FINANZAS_MODULE.md).
 */
export function FinanzasFormField({ label, htmlFor, optional, tour, children }: FinanzasFormFieldProps) {
  return (
    <div className="block text-sm" data-tour={tour}>
      <label htmlFor={htmlFor} className="text-body-muted mb-1 block font-medium">
        {label}
        {optional ? ' (opcional)' : null}
      </label>
      {children}
    </div>
  )
}

export { inputClass as finanzasInputClass }
