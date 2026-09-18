/** @deprecated Importar desde `finanzas/agenda/services/agenda.repository.js`. Reexport por compat Fase 2. */
export {
  COMPROMISOS_COLLECTION,
  COBROS_COLLECTION,
  createCompromisoWithHistorial as createCompromisoPago,
  createCobroWithHistorial as createCobroEsperado,
  getCompromisoResumen,
  getCobroResumen,
  linkChequeToCompromiso,
  linkChequeToCobro,
  listCompromisosPendientes,
  listCobrosEsperadosSelect as listCobrosEsperados,
  parseDateInput,
  timestampFromDate,
} from '../../agenda/services/agenda.repository.js'

export type {
  CompromisoPagoDocument,
  CobroEsperadoDocument,
} from '../../agenda/domain/agenda.types.js'
