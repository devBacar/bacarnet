import type { SeveridadRrhh } from '../../services/rrhhApi'
import { ETIQUETA_SEVERIDAD, PILDORA_SEVERIDAD } from './severidad'

export function PildoraSeveridad({ severidad }: { severidad: SeveridadRrhh }) {
  const estilo = PILDORA_SEVERIDAD[severidad]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ${estilo.fondo}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${estilo.punto}`} aria-hidden />
      {ETIQUETA_SEVERIDAD[severidad]}
    </span>
  )
}
