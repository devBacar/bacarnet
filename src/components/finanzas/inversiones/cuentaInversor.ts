/**
 * Cuenta del inversor (KPIs + calendario).
 * La lógica pura y el test viven en el dominio del backend (vitest del módulo Finanzas).
 */
export {
  cuentaInversor,
  estadoCalendario,
  type CuentaInversor,
  type CuotaCalendario,
  type CuotaParaCuenta,
  type EstadoCuotaCalendario,
  type EstadoCuotaEntrada,
  type InversionParaCuenta,
  type KpisMoneda,
  type MesCalendario,
  type MonedaCuenta,
} from '@intranet/cuenta-inversor'
