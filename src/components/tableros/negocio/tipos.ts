import type { ModeloNegocio } from './domain/modelo'

export type SeccionId = 'resumen' | 'ventas' | 'tarifas' | 'negocios' | 'gastos' | 'proveedores' | 'financiero' | 'plan' | 'evolucion'

export interface PropsSeccion {
  modelo: ModeloNegocio
  /** Meses del período elegido. */
  ms: string[]
}
