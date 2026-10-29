import type { CopsSnapshot } from '../../../services/copsApi'
import { entero } from './formato'
import { KpiCops, SeccionCops } from './ui'

export function SeccionEstructura({ data }: { data: CopsSnapshot }) {
  return (
    <SeccionCops titulo="Estructura comercial" subtitulo="Clientes, objetivos, contratos SLA y personal activo.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCops
          etiqueta="Clientes activos"
          valor={entero(data.clientes.activos)}
          nota={`de ${entero(data.clientes.total)} en total`}
        />
        <KpiCops etiqueta="Objetivos" valor={entero(data.objetivos)} nota="Objetivos totales" />
        <KpiCops etiqueta="Contratos SLA" valor={entero(data.sla.contratos)} nota="Contratos activos" />
        <KpiCops etiqueta="Empleados activos" valor={entero(data.empleados.activos)} />
      </div>
    </SeccionCops>
  )
}
