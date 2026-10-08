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
import { finanzasHoyRouter } from '../hoy/routes/hoy.routes.js'
import { finanzasCajaDiaRouter } from '../hoy/routes/caja-dia.routes.js'
import { finanzasCompromisosMesRouter } from '../hoy/routes/compromisos-mes.routes.js'
import { finanzasExtractosRouter } from '../extractos/routes/extractos.routes.js'
import { finanzasChequesRouter } from '../cheques/routes/cheques.routes.js'
import { finanzasTableroRouter } from '../tablero/routes/tablero.routes.js'

export const finanzasRouter = Router()

finanzasRouter.use('/hoy', finanzasHoyRouter)
finanzasRouter.use('/caja-dia', finanzasCajaDiaRouter)
finanzasRouter.use('/compromisos-mes', finanzasCompromisosMesRouter)
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
finanzasRouter.use('/tablero', finanzasTableroRouter)
