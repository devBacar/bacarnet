import { Router } from 'express'
import { getEnv } from '../../config/env.js'
import { logError } from '../../lib/log.js'
import { requireWorkspaceUser } from '../auth/middleware.js'
import {
  fetchWidgetCalendarEventDetail,
  fetchWidgetCalendarEvents,
} from './calendarService.js'
import { GOOGLE_RECONNECT_REQUIRED, GoogleReconnectRequiredError } from './errors.js'
import { fetchWidgetGmailMessageDetail, fetchWidgetGmailMessages } from './gmailService.js'
import {
  buildAuthorizationUrl,
  createOAuthStateToken,
  exchangeAuthorizationCode,
  getUserOAuth2Client,
  revokeAndDeleteIntegration,
  verifyOAuthStateToken,
} from './oauthFlow.js'
import { hasGooglePersonalIntegration } from './store.js'
import {
  isWidgetsOAuthConfigured,
  WIDGETS_NOT_CONFIGURED_CODE,
} from './widgetsConfig.js'

export const googlePersonalRouter = Router()

function respondWidgetsNotConfigured(res: import('express').Response): void {
  res.status(503).json({
    error: 'Widgets de Gmail y Calendar aún no están configurados en el servidor.',
    code: WIDGETS_NOT_CONFIGURED_CODE,
  })
}

googlePersonalRouter.use((req, res, next) => {
  if (isWidgetsOAuthConfigured()) {
    next()
    return
  }
  if (req.path === '/google/oauth/callback' && req.method === 'GET') {
    const appBase = getEnv().publicAppUrl.replace(/\/+$/, '')
    const params = new URLSearchParams({ googleConnectError: 'widgets_not_configured' })
    res.redirect(302, `${appBase}/intranet?${params.toString()}`)
    return
  }
  respondWidgetsNotConfigured(res)
})

function sendReconnectRequired(res: import('express').Response, message?: string): void {
  res.status(401).json({
    error: message ?? 'Hay que volver a conectar Google',
    code: GOOGLE_RECONNECT_REQUIRED,
  })
}

googlePersonalRouter.post('/google/oauth/start', requireWorkspaceUser, (req, res) => {
  try {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const body = req.body as { returnTo?: unknown } | undefined
    const returnTo =
      typeof body?.returnTo === 'string' && body.returnTo.startsWith('/')
        ? body.returnTo
        : '/intranet'

    const state = createOAuthStateToken(user.uid, returnTo)
    const authorizeUrl = buildAuthorizationUrl(state)
    res.json({ authorizeUrl })
  } catch (err) {
    logError('Fallo al iniciar OAuth Google personal', err)
    res.status(500).json({ error: 'No se pudo iniciar la conexión con Google' })
  }
})

googlePersonalRouter.get('/google/oauth/callback', async (req, res) => {
  const appBase = getEnv().publicAppUrl.replace(/\/+$/, '')
  const failRedirect = (reason: string) => {
    const params = new URLSearchParams({ googleConnectError: reason })
    res.redirect(302, `${appBase}/intranet?${params.toString()}`)
  }

  try {
    const errorParam = typeof req.query.error === 'string' ? req.query.error : ''
    if (errorParam) {
      failRedirect(errorParam)
      return
    }

    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    if (!code || !state) {
      failRedirect('missing_code')
      return
    }

    const { uid, returnPath } = verifyOAuthStateToken(state)
    await exchangeAuthorizationCode({ uid, code })

    const params = new URLSearchParams({ googleConnected: '1' })
    res.redirect(302, `${appBase}${returnPath}?${params.toString()}`)
  } catch (err) {
    logError('Callback OAuth Google personal', err)
    failRedirect('callback_failed')
  }
})

googlePersonalRouter.get('/google/status', requireWorkspaceUser, async (req, res) => {
  try {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }
    const connected = await hasGooglePersonalIntegration(user.uid)
    res.json({ connected })
  } catch (err) {
    logError('Estado integración Google personal', err)
    res.status(500).json({ error: 'No se pudo leer el estado de conexión' })
  }
})

googlePersonalRouter.delete('/google/connection', requireWorkspaceUser, async (req, res) => {
  try {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }
    await revokeAndDeleteIntegration(user.uid)
    res.json({ disconnected: true })
  } catch (err) {
    logError('Desconexión Google personal', err)
    res.status(500).json({ error: 'No se pudo desconectar Google' })
  }
})

googlePersonalRouter.get('/gmail/messages/:messageId', requireWorkspaceUser, async (req, res) => {
  try {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const messageId = String(req.params.messageId ?? '').trim()
    if (!messageId) {
      res.status(400).json({ error: 'Mensaje inválido' })
      return
    }

    const auth = await getUserOAuth2Client(user.uid)
    const message = await fetchWidgetGmailMessageDetail(user.uid, auth, messageId)
    if (!message) {
      res.status(404).json({ error: 'Correo no encontrado' })
      return
    }
    res.json({ message })
  } catch (err) {
    if (err instanceof GoogleReconnectRequiredError) {
      sendReconnectRequired(res, err.message)
      return
    }
    logError('Gmail widget detalle', err)
    res.status(502).json({ error: 'No se pudo cargar el correo' })
  }
})

googlePersonalRouter.get('/gmail/messages', requireWorkspaceUser, async (req, res) => {
  try {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const auth = await getUserOAuth2Client(user.uid)
    const messages = await fetchWidgetGmailMessages(user.uid, auth)
    res.json({ messages })
  } catch (err) {
    if (err instanceof GoogleReconnectRequiredError) {
      sendReconnectRequired(res, err.message)
      return
    }
    logError('Gmail widget API', err)
    res.status(502).json({ error: 'No se pudo cargar la bandeja de Gmail' })
  }
})

googlePersonalRouter.get('/calendar/eventos/:eventId', requireWorkspaceUser, async (req, res) => {
  try {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const eventId = String(req.params.eventId ?? '').trim()
    if (!eventId) {
      res.status(400).json({ error: 'Evento inválido' })
      return
    }

    const auth = await getUserOAuth2Client(user.uid)
    const event = await fetchWidgetCalendarEventDetail(user.uid, auth, eventId)
    if (!event) {
      res.status(404).json({ error: 'Evento no encontrado' })
      return
    }
    res.json({ event })
  } catch (err) {
    if (err instanceof GoogleReconnectRequiredError) {
      sendReconnectRequired(res, err.message)
      return
    }
    logError('Calendar widget detalle', err)
    res.status(502).json({ error: 'No se pudo cargar el evento' })
  }
})

googlePersonalRouter.get('/calendar/eventos', requireWorkspaceUser, async (req, res) => {
  try {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const auth = await getUserOAuth2Client(user.uid)
    const events = await fetchWidgetCalendarEvents(user.uid, auth)
    res.json({ events })
  } catch (err) {
    if (err instanceof GoogleReconnectRequiredError) {
      sendReconnectRequired(res, err.message)
      return
    }
    logError('Calendar widget API', err)
    res.status(502).json({ error: 'No se pudieron cargar los eventos de Calendar' })
  }
})
