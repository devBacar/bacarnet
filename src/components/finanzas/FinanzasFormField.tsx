import type { ReactNode } from 'react'

const inputClass = 'input-surface w-full rounded-lg border px-3 py-2'

type FinanzasFormFieldProps = {
  label: string
  htmlFor?: string
  optional?: boolean
  children: ReactNode
}

/**
 * Campo de formulario del módulo Finanzas: etiqueta siempre visible (ver FINANZAS_MODULE.md).
 */
export function FinanzasFormField({ label, htmlFor, optional, children }: FinanzasFormFieldProps) {
  return (
    <div className="block text-sm">
      <label htmlFor={htmlFor} className="text-body-muted mb-1 block font-medium">
        {label}
        {optional ? ' (opcional)' : null}
      </label>
      {children}
    </div>
  )
}

export { inputClass as finanzasInputClass }
