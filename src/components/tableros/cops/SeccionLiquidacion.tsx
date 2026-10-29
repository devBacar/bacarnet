import type { CopsSnapshot } from '../../../services/copsApi'
import { entero, fechaCorta } from './formato'
import { nivelFtCiclo } from './umbrales'
import { KpiCops, SeccionCops } from './ui'

export function SeccionLiquidacion({ liquidacion }: { liquidacion: NonNullable<CopsSnapshot['liquidacion']> }) {
  return (
    <SeccionCops titulo="Liquidación (período actual)" subtitulo={liquidacion.periodoActual}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCops
          etiqueta="Ciclo"
          valor={`${fechaCorta(liquidacion.cicloStart)} – ${fechaCorta(liquidacion.cicloEnd)}`}
          nota="Inicio y fin del ciclo"
        />
        <KpiCops
          etiqueta="Franco trabajado (ciclo)"
          valor={entero(liquidacion.ftCiclo)}
          nivel={nivelFtCiclo(liquidacion.ftCiclo)}
          nota="0 ok · 1–3 atención · más de 3 crítico"
        />
      </div>
    </SeccionCops>
  )
}
