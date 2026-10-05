import type { Guia } from '../pasosRecorrido'
import { GUIAS_AGENDA } from './agenda'
import { GUIAS_CAJAS } from './cajas'
import { GUIAS_CHEQUES } from './cheques'
import { GUIAS_EXTRACTOS } from './extractos'
import { GUIAS_HOY } from './hoy'
import { GUIAS_MOVIMIENTOS } from './movimientos'
import { GUIAS_SALDOS } from './saldos'
import { GUIAS_TRANSFERENCIAS } from './transferencias'

export const GUIAS: Guia[] = [
  ...GUIAS_HOY,
  ...GUIAS_SALDOS,
  ...GUIAS_AGENDA,
  ...GUIAS_CAJAS,
  ...GUIAS_TRANSFERENCIAS,
  ...GUIAS_MOVIMIENTOS,
  ...GUIAS_EXTRACTOS,
  ...GUIAS_CHEQUES,
]
