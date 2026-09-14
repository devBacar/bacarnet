import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireWorkspaceUser } from '../auth/middleware.js'
import { createSolicitudHandler } from './createSolicitud.js'
import { createTicketReunionHandler } from './createTicketReunion.js'
import { getCampanaAuditoriaHandler } from './getCampanaAuditoria.js'
import { getCampanaEnlacesHandler } from './getCampanaEnlaces.js'
import { postCampanaGenerarEnlaceHandler } from './postCampanaGenerarEnlace.js'
import { getDisponibilidadInicialHandler } from './getDisponibilidadInicial.js'
import { getDisponibilidadTeamMemberHandler } from './getDisponibilidadTeamMember.js'
import { getTeamHandler } from './getTeam.js'
import { getTicketDetailHandler } from './getTicketDetail.js'
import { listMisTicketsHandler } from './listMisTickets.js'
import { listTicketsHandler } from './listTickets.js'
import { requireHelpdeskTeamMember } from './middleware.js'
import { requireHelpdeskN8nApiKey } from './n8nAuthMiddleware.js'
import { patchTicketAsignadoHandler } from './patchTicketAsignado.js'
import { patchTicketEstadoHandler } from './patchTicketEstado.js'
import { patchReunionMinutaHandler } from './patchReunionMinuta.js'
import { postTicketNotaHandler } from './postTicketNota.js'
import { postWebhookCorreoEnviadoHandler } from './postWebhookCorreoEnviado.js'
import { syncReunionEstadoHandler } from './syncReunionEstado.js'
import { patchTicketCancelacionHandler } from './patchTicketCancelacion.js'
import { postTicketAnalisisHandler } from './postTicketAnalisis.js'
import { getAnalisisPendientesHandler } from './getAnalisisPendientes.js'
import { patchAnalisisDecisionHandler } from './patchAnalisisDecision.js'
import { getTicketBitacoraHandler } from './getTicketBitacora.js'
import { postTicketBitacoraHandler } from './postTicketBitacora.js'
import { deleteTicketHandler } from './deleteTicket.js'

export const helpdeskRouter = Router()

const helpdeskRateLimitMessage = {
  error: 'Demasiadas solicitudes desde esta IP. Intentá más tarde.',
} as const

/** Endpoints públicos / con link (solicitudes, disponibilidad, webhooks n8n puntuales). */
const helpdeskPublicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: helpdeskRateLimitMessage,
})

/** Campaña n8n: una llamada por jefe desde la misma IP del runner (~40 jefes + reintentos). */
const helpdeskCampanaGenerarEnlaceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: helpdeskRateLimitMessage,
})

/** Disponibilidad conjunta del equipo de primera reunión (token reutilizable hasta enviar solicitud). */
helpdeskRouter.get('/disponibilidad-inicial', helpdeskPublicWriteLimiter, getDisponibilidadInicialHandler)

/** Creación pública de solicitud con token de un solo uso al confirmar (sin sesión Firebase). */
helpdeskRouter.post('/solicitudes', helpdeskPublicWriteLimiter, createSolicitudHandler)

/** Enlaces personalizados por jefe de área para campaña n8n (API key, sin Firebase Auth). */
helpdeskRouter.get(
  '/campana/enlaces',
  helpdeskPublicWriteLimiter,
  requireHelpdeskN8nApiKey,
  getCampanaEnlacesHandler,
)

/** Enlace individual para campaña n8n (body: email, nombre, areaNombre). */
helpdeskRouter.post(
  '/campana/generar-enlace',
  helpdeskCampanaGenerarEnlaceLimiter,
  requireHelpdeskN8nApiKey,
  postCampanaGenerarEnlaceHandler,
)

helpdeskRouter.post(
  '/webhooks/correo-enviado',
  helpdeskPublicWriteLimiter,
  requireHelpdeskN8nApiKey,
  postWebhookCorreoEnviadoHandler,
)

const helpdeskTeamPanel = [requireWorkspaceUser, requireHelpdeskTeamMember]

helpdeskRouter.get('/tickets/mias', requireWorkspaceUser, listMisTicketsHandler)
helpdeskRouter.get('/tickets/:ticketId/bitacora', requireWorkspaceUser, getTicketBitacoraHandler)
helpdeskRouter.post('/tickets/:ticketId/bitacora', requireWorkspaceUser, postTicketBitacoraHandler)
helpdeskRouter.get('/analisis-pendientes', requireWorkspaceUser, getAnalisisPendientesHandler)
helpdeskRouter.patch(
  '/tickets/:ticketId/analisis/:analisisId/decision',
  requireWorkspaceUser,
  patchAnalisisDecisionHandler,
)
helpdeskRouter.get('/campana/auditoria', ...helpdeskTeamPanel, getCampanaAuditoriaHandler)
helpdeskRouter.get('/team', ...helpdeskTeamPanel, getTeamHandler)
helpdeskRouter.get(
  '/disponibilidad/:teamMemberId',
  ...helpdeskTeamPanel,
  getDisponibilidadTeamMemberHandler,
)
helpdeskRouter.get('/tickets', ...helpdeskTeamPanel, listTicketsHandler)
helpdeskRouter.get('/tickets/:ticketId', ...helpdeskTeamPanel, getTicketDetailHandler)
helpdeskRouter.delete('/tickets/:ticketId', ...helpdeskTeamPanel, deleteTicketHandler)

helpdeskRouter.patch('/tickets/:ticketId/estado', ...helpdeskTeamPanel, patchTicketEstadoHandler)
helpdeskRouter.patch(
  '/tickets/:ticketId/cancelacion',
  ...helpdeskTeamPanel,
  patchTicketCancelacionHandler,
)
helpdeskRouter.post(
  '/tickets/:ticketId/analisis',
  ...helpdeskTeamPanel,
  postTicketAnalisisHandler,
)
helpdeskRouter.patch(
  '/tickets/:ticketId/asignado',
  ...helpdeskTeamPanel,
  patchTicketAsignadoHandler,
)
helpdeskRouter.post('/tickets/:ticketId/notas', ...helpdeskTeamPanel, postTicketNotaHandler)

helpdeskRouter.post(
  '/tickets/:ticketId/reuniones',
  ...helpdeskTeamPanel,
  createTicketReunionHandler,
)

helpdeskRouter.patch(
  '/tickets/:ticketId/reuniones/:reunionId/minuta',
  ...helpdeskTeamPanel,
  patchReunionMinutaHandler,
)

helpdeskRouter.get(
  '/tickets/:ticketId/reuniones/:reunionId/sincronizar-estado',
  ...helpdeskTeamPanel,
  syncReunionEstadoHandler,
)
