/** Tableros React fijos de BacarNet (no son carpetas de Drive): el acceso lo controla la API de cada uno. */
export interface TableroInterno {
  id: string
  nombre: string
  descripcion: string
  to: string
}

export const TABLEROS_INTERNOS: TableroInterno[] = [
  { id: 'negocio', nombre: 'Negocio', descripcion: 'Ventas, gastos y resultado del negocio.', to: '/tableros/negocio' },
  { id: 'finanzas', nombre: 'Finanzas', descripcion: 'Posición de caja y cuentas.', to: '/tableros/finanzas' },
  { id: 'rrhh', nombre: 'RRHH', descripcion: 'Horas extra y novedades de nómina.', to: '/tableros/rrhh' },
  { id: 'cosp', nombre: 'COSP', descripcion: 'Indicadores operativos de seguridad privada.', to: '/tableros/cops' },
]
