import { Router } from 'express'
import { finanzasCuentasRouter } from './cuentas.routes.js'
import { finanzasAgendaRouter } from '../agenda/routes/agenda.routes.js'
import { finanzasCajasRouter } from '../cajachica/routes/cajas.routes.js'
import { finanzasTransferenciasRouter } from '../transferencias/routes/transferencias.routes.js'
import { finanzasDestinatariosRouter } from '../transferencias/routes/destinatarios.routes.js'
import { finanzasCategoriasMovimientosRouter } from '../movimientos/routes/categorias-movimientos.routes.js'
import { finanzasMovimientosRouter } from '../movimientos/routes/movimientos.routes.js'
import { finanzasCashflowRouter } from '../cashflow/routes/cashflow.routes.js'
import { finanzasReglasCategorizacionRouter } from '../movimientos/routes/reglas-categorizacion.routes.js'
import { finanzasExtractosRouter } from '../extractos/routes/extractos.routes.js'
import { finanzasChequesRouter } from '../cheques/routes/cheques.routes.js'

export const finanzasRouter = Router()

finanzasRouter.use('/cuentas', finanzasCuentasRouter)
finanzasRouter.use('/cashflow', finanzasCashflowRouter)
finanzasRouter.use('/agenda', finanzasAgendaRouter)
finanzasRouter.use('/cajas', finanzasCajasRouter)
finanzasRouter.use('/transferencias', finanzasTransferenciasRouter)
finanzasRouter.use('/destinatarios', finanzasDestinatariosRouter)
finanzasRouter.use('/categorias-movimientos', finanzasCategoriasMovimientosRouter)
finanzasRouter.use('/reglas-categorizacion', finanzasReglasCategorizacionRouter)
finanzasRouter.use('/movimientos', finanzasMovimientosRouter)
finanzasRouter.use('/extractos', finanzasExtractosRouter)
finanzasRouter.use('/cheques', finanzasChequesRouter)
