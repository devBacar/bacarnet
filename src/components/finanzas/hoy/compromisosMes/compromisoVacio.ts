import type { CompromisoMesInput } from '../../../../services/finanzasCompromisosMesApi'

/** Valores de un compromiso nuevo; cada pantalla completa el grupo y la fecha. */
export const COMPROMISO_VACIO: CompromisoMesInput = {
  concepto: '',
  proveedorONombre: '',
  grupo: 'Otros egresos',
  moneda: 'ARS',
  montoCentavos: 0,
  fechaVencimiento: '',
  deudaTotalCentavos: null,
  cuotaNumero: null,
  cuotaTotal: null,
  observacion: null,
  medioPago: 'transferencia',
}
