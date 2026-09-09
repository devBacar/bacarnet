import { todayInTimeZone } from '../assistant-actions/calendarDateTime.js'
import { callVertexGemini, type GeminiFunctionDeclaration } from './vertexGemini.js'
import type { AssistantUsageMeter } from './assistantUsageMeter.js'
import { validateActionPlan, ActionPlanValidationError, type ValidatedActionPlanResult } from './validateActionPlan.js'
import type { ActionContext, ActionPlan } from './actionPlanTypes.js'
import type { RagConversationTurn } from './runRagAssistant.js'

const SUBMIT_ACTION_PLAN_TOOL: GeminiFunctionDeclaration = {
  name: 'submit_action_plan',
  description:
    'Devuelve el plan estructurado de acciones (correos y eventos) que el usuario pidió. ' +
    'Una entrada por cada correo o evento distinto.',
  parameters: {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        description: 'Lista ordenada de acciones a preparar.',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              description: 'email, calendar_event o calendar_cancel',
            },
            eventId: {
              type: 'string',
              description: 'ID de Google Calendar (solo calendar_cancel)',
            },
            ref: {
              type: 'string',
              description: 'Identificador estable, ej. email-1, event-2',
            },
            to: {
              type: 'array',
              items: { type: 'string' },
              description: 'Destinatarios del correo (@bacarsa.com.ar)',
            },
            cc: {
              type: 'array',
              items: { type: 'string' },
            },
            subject: { type: 'string' },
            bodySource: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: 'summaries | previous_assistant | literal',
                },
                text: { type: 'string' },
              },
            },
            title: { type: 'string' },
            startDateTime: {
              type: 'string',
              description: 'ISO 8601, ej. 2026-09-09T10:00:00',
            },
            endDateTime: { type: 'string' },
            attendees: {
              type: 'array',
              items: { type: 'string' },
            },
            location: { type: 'string' },
            addGoogleMeet: { type: 'boolean' },
            description: { type: 'string' },
          },
          required: ['kind', 'ref'],
        },
      },
      assumptions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Supuestos o ambigüedades resueltos',
      },
    },
    required: ['actions'],
  },
}

function buildPlanSystemInstruction(context: ActionContext): string {
  return [
    'Sos el planificador de acciones del asistente BacarNet.',
    'Analizá el pedido del usuario y devolvé SIEMPRE submit_action_plan con todas las acciones pedidas.',
    `Fecha de referencia (Argentina): ${context.referenceDate}. Interpretá hoy, mañana y días relativos con esa fecha.`,
    'Reglas:',
    '- Una acción por cada correo distinto (destinatario/asunto/cuerpo distintos).',
    '- Una acción por cada evento de calendario distinto (horario, modalidad o invitados distintos).',
    '- Una acción calendar_cancel por cada evento a eliminar. Nunca agrupes varios eventos en una sola acción.',
    '- Para calendar_cancel usá eventId, title, startDateTime, endDateTime y attendees del catálogo de eventos provisto.',
    '- Si el usuario pide cancelar "todas las reuniones a las X", incluí una calendar_cancel por cada evento que coincida.',
    '- Si dice "cancelá todo" / "eliminar todos" tras ver su agenda, incluí calendar_cancel para CADA evento del catálogo (una acción por evento).',
    '- Si ningún evento del catálogo coincide, devolvé actions vacío y explicá en assumptions.',
    '- Si piden dos eventos a la misma hora (presencial y Meet), son DOS calendar_event separados con el mismo startDateTime.',
    '- Destinatarios de correo: solo emails @bacarsa.com.ar.',
    '- Invitados de calendario: cualquier email válido (internos o externos).',
    '- addGoogleMeet=true solo si pidieron Meet/videollamada para ESE evento.',
    '- Evento presencial: addGoogleMeet=false y location si la mencionaron.',
    '- Fechas en ISO 8601 sin offset (hora local Argentina). Duración default 30 min si no indican fin.',
    '- bodySource.type=summaries cuando el cuerpo del mail son resúmenes de documentos.',
    '- bodySource.type=previous_assistant cuando piden reenviar la respuesta anterior.',
    '- bodySource.type=literal solo si el usuario dictó el cuerpo explícitamente.',
    '- No inventes acciones que el usuario no pidió.',
    '- Máximo 10 acciones.',
  ].join('\n')
}

function buildPlanUserPrompt(input: {
  question: string
  history: RagConversationTurn[]
  context: ActionContext
}): string {
  const recentHistory = input.history
    .slice(-4)
    .map((turn) => `${turn.role === 'user' ? 'Usuario' : 'Asistente'}: ${turn.content}`)
    .join('\n\n')

  const contextLines = [
    `Pedido actual:\n${input.question}`,
  ]
  if (recentHistory) {
    contextLines.unshift(`Historial reciente:\n${recentHistory}`)
  }
  if (input.context.summariesText) {
    contextLines.push(
      'Resúmenes disponibles para usar como cuerpo de correos (bodySource.type=summaries):\n' +
        input.context.summariesText.slice(0, 6000),
    )
  }
  if (input.context.previousAssistantText) {
    contextLines.push(
      'Última respuesta del asistente disponible (bodySource.type=previous_assistant):\n' +
        input.context.previousAssistantText.slice(0, 4000),
    )
  }
  if (
    input.context.calendarEventsCatalog &&
    input.context.calendarEventsCatalog.length > 0
  ) {
    if (/\b(?:todo|todos|todas)\b/i.test(input.question)) {
      contextLines.push(
        'El usuario pidió cancelar TODO lo listado: generá calendar_cancel para cada evento del catálogo.',
      )
    }
    const catalogLines = input.context.calendarEventsCatalog.map((event) => {
      const attendees =
        event.attendees.length > 0 ? ` | invitados: ${event.attendees.join(', ')}` : ''
      const timeLabel = event.allDay
        ? 'todo el día'
        : `${event.start}${event.end ? ` – ${event.end}` : ''}`
      return `- eventId=${event.eventId} | "${event.title}" | ${timeLabel}${attendees}`
    })
    contextLines.push(
      'Eventos actuales en el calendario (usá estos datos para calendar_cancel):\n' +
        catalogLines.join('\n'),
    )
  }

  return contextLines.join('\n\n---\n\n')
}

export async function extractActionPlan(input: {
  question: string
  history: RagConversationTurn[]
  context: ActionContext
  usageMeter?: AssistantUsageMeter
}): Promise<ValidatedActionPlanResult> {
  const referenceDate = input.context.referenceDate || todayInTimeZone()
  const context = { ...input.context, referenceDate }

  const result = await callVertexGemini({
    usageMeter: input.usageMeter,
    systemInstruction: buildPlanSystemInstruction(context),
    contents: [
      {
        role: 'user',
        parts: [{ text: buildPlanUserPrompt({ ...input, context }) }],
      },
    ],
    tools: [SUBMIT_ACTION_PLAN_TOOL],
    temperature: 0.1,
    maxOutputTokens: 4096,
  })

  const planCall = result.functionCalls.find((call) => call.name === 'submit_action_plan')
  if (!planCall) {
    throw new ActionPlanValidationError(
      'No se pudo extraer un plan de acciones estructurado del pedido.',
    )
  }

  return validateActionPlan(planCall.args, {
    calendarEventsCatalog: context.calendarEventsCatalog,
  })
}

export { ActionPlanValidationError }
