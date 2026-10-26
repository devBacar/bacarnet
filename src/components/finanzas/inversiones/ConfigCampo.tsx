import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { finanzasInputClass } from '../FinanzasFormField'

type ConfigCampoProps = {
  label: string
  htmlFor: string
  ayuda?: string
  optional?: boolean
  children: ReactNode
}

/** Etiqueta arriba, campo, ayuda corta abajo. */
export function ConfigCampo({ label, htmlFor, ayuda, optional, children }: ConfigCampoProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="text-body-muted mb-1 block text-sm font-medium">
        {label}
        {optional ? ' (opcional)' : null}
      </label>
      {children}
      {ayuda ? <p className="text-body-muted mt-1 text-xs leading-relaxed">{ayuda}</p> : null}
    </div>
  )
}

type Sufijo = '%' | '$' | 'días' | 'meses'

const PAD_SUFIJO: Record<Sufijo, string> = {
  '%': 'pr-9',
  $: 'pr-9',
  días: 'pr-12',
  meses: 'pr-14',
}

type ConfigInputSufijoProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  sufijo: Sufijo
}

/** Input con unidad visible como sufijo dentro del campo. */
export function ConfigInputSufijo({ sufijo, disabled, ...rest }: ConfigInputSufijoProps) {
  return (
    <div className="relative">
      <input
        {...rest}
        disabled={disabled}
        className={`${finanzasInputClass} ${PAD_SUFIJO[sufijo]} tabular-nums`}
      />
      <span
        className="text-body-muted pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium"
        aria-hidden
      >
        {sufijo}
      </span>
    </div>
  )
}

type ConfigSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>

export function ConfigSelect(props: ConfigSelectProps) {
  return <select {...props} className={finanzasInputClass} />
}

type ConfigGrillaProps = {
  children: ReactNode
}

/** 2 columnas en escritorio, 1 en celular. */
export function ConfigGrilla({ children }: ConfigGrillaProps) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
}
