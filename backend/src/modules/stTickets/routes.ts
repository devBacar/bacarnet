import { Router } from 'express'
import { requireWorkspaceUser } from '../auth/middleware.js'
import {
  createStTicketHandler,
  getStCatalogHandler,
  getStCommentsHandler,
  getStTicketDetailHandler,
  listMyStTicketsHandler,
  postStAttachmentsHandler,
  postStCommentHandler,
  putStStatusHandler,
  stStatusWebhookHandler,
} from './handlers.js'

export const stTicketsRouter = Router()

// ST llama sin sesión Firebase; se autentica con la API key compartida.
stTicketsRouter.post('/webhooks/estado', stStatusWebhookHandler)

stTicketsRouter.use(requireWorkspaceUser)
stTicketsRouter.get('/catalogo', getStCatalogHandler)
stTicketsRouter.post('/solicitudes', createStTicketHandler)
stTicketsRouter.get('/mias', listMyStTicketsHandler)
stTicketsRouter.get('/:stTicketId', getStTicketDetailHandler)
stTicketsRouter.get('/:stTicketId/comentarios', getStCommentsHandler)
stTicketsRouter.post('/:stTicketId/comentarios', postStCommentHandler)
stTicketsRouter.post('/:stTicketId/adjuntos', postStAttachmentsHandler)
stTicketsRouter.put('/:stTicketId/estado', putStStatusHandler)
