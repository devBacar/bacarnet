import { Router } from 'express'
import { finanzasCuentasRouter } from './cuentas.routes.js'
import { finanzasChequesRouter } from '../cheques/routes/cheques.routes.js'
import { finanzasAgendaRouter } from '../agenda/routes/agenda.routes.js'

export const finanzasRouter = Router()

finanzasRouter.use('/cuentas', finanzasCuentasRouter)
finanzasRouter.use('/cheques', finanzasChequesRouter)
finanzasRouter.use('/agenda', finanzasAgendaRouter)
