import type { CopsSnapshot } from '../../../services/copsApi'
import { entero } from './formato'
import { nivelAusentes, nivelNovedades, nivelVacantes } from './umbrales'
import { KpiCops, SeccionCops } from './ui'

export function SeccionOperacionHoy({ data }: { data: CopsSnapshot }) {
  const op = data.operacionHoy
  return (
    <SeccionCops titulo="Operación hoy" subtitulo="Cómo está el servicio en este momento.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCops etiqueta="En servicio" valor={entero(op.enServicio)} />
        <KpiCops etiqueta="De franco" valor={entero(op.deFranco)} />
        <KpiCops etiqueta="Ausentes" valor={entero(op.ausentes)} nivel={nivelAusentes(op.ausentes)} />
        <KpiCops etiqueta="Vacantes" valor={entero(op.vacantes)} nivel={nivelVacantes(op.vacantes)} />
        <KpiCops etiqueta="Novedades" valor={entero(op.novedades)} nivel={nivelNovedades(op.novedades)} />
      </div>
    </SeccionCops>
  )
}
