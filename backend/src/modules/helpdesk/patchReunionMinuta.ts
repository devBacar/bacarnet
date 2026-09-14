import type { Request, Response } from 'express'

import { logError } from '../../lib/log.js'

import {

  HELPDESK_REUNION_TIPO_INICIAL,

  isValidHelpdeskMinutaDiagnostico,

  normalizeHelpdeskMinutaDiagnostico,

} from './minutaDiagnostico.js'

import {

  getHelpdeskReunionById,

  getHelpdeskTicketById,

  updateHelpdeskReunionMinuta,

} from './repository.js'



const MAX_MINUTA_LENGTH = 20_000



export async function patchReunionMinutaHandler(req: Request, res: Response): Promise<void> {

  const ticketId = String(req.params.ticketId ?? '').trim()

  const reunionId = String(req.params.reunionId ?? '').trim()

  if (!ticketId || !reunionId) {

    res.status(400).json({ error: 'ticketId y reunionId son obligatorios' })

    return

  }



  const body = req.body as Record<string, unknown> | null

  if (!body || typeof body !== 'object' || Array.isArray(body)) {

    res.status(400).json({ error: 'Body inválido' })

    return

  }



  const autor = req.authedUser

  if (!autor) {

    res.status(401).json({ error: 'No autenticado' })

    return

  }



  const autorNombre = autor.displayName.trim() || autor.email



  try {

    const [ticket, reunion] = await Promise.all([

      getHelpdeskTicketById(ticketId),

      getHelpdeskReunionById(ticketId, reunionId),

    ])

    if (!ticket) {

      res.status(404).json({ error: 'Ticket no encontrado' })

      return

    }

    if (!reunion) {

      res.status(404).json({ error: 'Reunión no encontrada' })

      return

    }



    const isReunionInicial = reunion.tipo.trim() === HELPDESK_REUNION_TIPO_INICIAL



    if (isReunionInicial) {

      if (!('minutaDiagnostico' in body)) {

        res.status(400).json({ error: 'minutaDiagnostico es obligatorio para Reunión inicial' })

        return

      }

      if (body.minutaDiagnostico === null) {

        await updateHelpdeskReunionMinuta({

          ticketId,

          reunionId,

          autorNombre,

          minutaDiagnostico: null,

        })

        res.status(200).json({ ticketId, reunionId })

        return

      }

      if (!isValidHelpdeskMinutaDiagnostico(body.minutaDiagnostico)) {

        res.status(400).json({ error: 'minutaDiagnostico inválida' })

        return

      }

      const normalized = normalizeHelpdeskMinutaDiagnostico(body.minutaDiagnostico)

      await updateHelpdeskReunionMinuta({

        ticketId,

        reunionId,

        autorNombre,

        minutaDiagnostico: { ...normalized, generadoPorIA: false },

      })

      res.status(200).json({ ticketId, reunionId })

      return

    }



    if (typeof body.texto !== 'string') {

      res.status(400).json({ error: 'texto es obligatorio' })

      return

    }

    const texto = body.texto.trim()

    if (texto.length > MAX_MINUTA_LENGTH) {

      res.status(400).json({ error: 'La minuta no puede superar los 20000 caracteres' })

      return

    }



    await updateHelpdeskReunionMinuta({

      ticketId,

      reunionId,

      autorNombre,

      texto,

    })

    res.status(200).json({ ticketId, reunionId })

  } catch (err) {

    logError('patchReunionMinuta falló', err)

    res.status(500).json({ error: 'No se pudo guardar la minuta' })

  }

}


