import type { CopsSnapshot } from '../../../services/copsApi'
import { entero } from './formato'
import { KpiCops, SeccionCops } from './ui'

const TURNOS: Array<{ key: keyof NonNullable<CopsSnapshot['rrhh']>['personalHoy']; label: string }> = [
  { key: 'M', label: 'Mañana' },
  { key: 'T', label: 'Tarde' },
  { key: 'N', label: 'Noche' },
  { key: 'D12', label: 'Día 12 h' },
  { key: 'N12', label: 'Noche 12 h' },
  { key: 'RET', label: 'Retén' },
  { key: 'otros', label: 'Otros' },
]

export function SeccionRrhh({ rrhh }: { rrhh: NonNullable<CopsSnapshot['rrhh']> }) {
  return (
    <SeccionCops titulo="RRHH (hoy)" subtitulo="Personal por turno, licencias y ausencias del mes.">
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        {TURNOS.map(({ key, label }) => (
          <KpiCops key={key} etiqueta={label} valor={entero(rrhh.personalHoy[key])} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCops etiqueta="Licencias hoy" valor={entero(rrhh.licenciasHoy)} />
        <KpiCops etiqueta="Ausencias del mes" valor={entero(rrhh.ausenciasMes)} />
      </div>
    </SeccionCops>
  )
}
