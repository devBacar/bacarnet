import { Router } from 'express'
import { finanzasCuentasRouter } from './cuentas.routes.js'
import { finanzasAgendaRouter } from '../agenda/routes/agenda.routes.js'
import { finanzasCajasRouter } from '../cajachica/routes/cajas.routes.js'
import { finanzasTransferenciasRouter } from '../transferencias/routes/transferencias.routes.js'

export const finanzasRouter = Router()

finanzasRouter.use('/cuentas', finanzasCuentasRouter)
finanzasRouter.use('/agenda', finanzasAgendaRouter)
finanzasRouter.use('/cajas', finanzasCajasRouter)
finanzasRouter.use('/transferencias', finanzasTransferenciasRouter)
