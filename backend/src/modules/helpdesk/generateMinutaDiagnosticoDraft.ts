import { FieldValue } from 'firebase-admin/firestore'

import { logError } from '../../lib/log.js'
import { callVertexGemini } from '../rag/vertexGemini.js'

import type { HelpdeskMinutaDiagnostico, HelpdeskUrgencia } from './types.js'
import { updateHelpdeskReunion } from './repository.js'

export type MinutaDiagnosticoAiPayload = {
  objetivoSesion: string
  alcance: string
  procesosEvaluados: Array<{
    procesoEvaluado: string
    descripcionBreve: string
  }>
}

const MAX_PROBLEMATICA_CHARS = 8_000
const MAX_FIELD_CHARS = 8_000
const MAX_PROCESO_NAME_CHARS = 500

function trimField(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export function parseJsonObjectFromGeminiText(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed)
  const candidate = (fenced?.[1] ?? trimmed).trim()

  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1))
    }
    throw new Error('Respuesta de Gemini no es JSON válido')
  }
}

export function parseMinutaDiagnosticoAiPayload(value: unknown): MinutaDiagnosticoAiPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>

  const objetivoSesion = trimField(body.objetivoSesion, MAX_FIELD_CHARS)
  const alcance = trimField(body.alcance, MAX_FIELD_CHARS)
  if (!objetivoSesion || !alcance) return null

  if (!Array.isArray(body.procesosEvaluados) || body.procesosEvaluados.length === 0) {
    return null
  }

  const procesosEvaluados: MinutaDiagnosticoAiPayload['procesosEvaluados'] = []
  for (const item of body.procesosEvaluados) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    const procesoEvaluado = trimField(row.procesoEvaluado, MAX_PROCESO_NAME_CHARS)
    const descripcionBreve = trimField(row.descripcionBreve, MAX_FIELD_CHARS)
    if (!procesoEvaluado || !descripcionBreve) return null
    procesosEvaluados.push({ procesoEvaluado, descripcionBreve })
  }

  return { objetivoSesion, alcance, procesosEvaluados }
}

export function buildMinutaDiagnosticoFromAiPayload(
  ai: MinutaDiagnosticoAiPayload,
): HelpdeskMinutaDiagnostico {
  return {
    fecha: '',
    facilitador: '',
    participantes: '',
    objetivoSesion: ai.objetivoSesion,
    alcance: ai.alcance,
    procesosEvaluados: ai.procesosEvaluados.map((p) => ({
      procesoEvaluado: p.procesoEvaluado,
      descripcionBreve: p.descripcionBreve,
      problemasIdentificados: '',
      metricasActuales: '',
    })),
    iniciativasPropuestas: [],
    proyectosAprobados: '',
    responsables: '',
    accionesInmediatas: '',
    generadoPorIA: true,
  }
}

function buildGeminiPrompt(input: {
  problematica: string
  areaNombre: string
  urgencia: HelpdeskUrgencia
}): string {
  return [
    'Sos analista de procesos en una empresa. A partir de la problemática del jefe de área,',
    'generá un borrador inicial para la minuta de la reunión de diagnóstico (antes de la reunión real).',
    '',
    `Área: ${input.areaNombre}`,
    `Urgencia declarada: ${input.urgencia}`,
    '',
    'Problemática:',
    input.problematica,
    '',
    'Respondé ÚNICAMENTE con un objeto JSON válido (sin markdown), con exactamente esta forma:',
    '{',
    '  "objetivoSesion": "string",',
    '  "alcance": "string",',
    '  "procesosEvaluados": [',
    '    { "procesoEvaluado": "string", "descripcionBreve": "string" }',
    '  ]',
    '}',
    '',
    'Reglas:',
    '- objetivoSesion: qué se busca lograr en la reunión inicial, inferido de la problemática.',
    '- alcance: primera estimación razonable del alcance del diagnóstico.',
    '- procesosEvaluados: al menos 1 ítem; nombres concretos de procesos/ámbitos mencionados o inferidos.',
    '- descripcionBreve: 1–3 oraciones por proceso.',
    '- Español rioplatense, tono profesional, sin inventar datos numéricos ni métricas.',
  ].join('\n')
}

export async function generateMinutaDiagnosticoDraftFromProblematica(input: {
  problematica: string
  areaNombre: string
  urgencia: HelpdeskUrgencia
}): Promise<HelpdeskMinutaDiagnostico | null> {
  if (process.env.HELPDESK_MINUTA_AI_MOCK_FAIL === '1') {
    throw new Error('HELPDESK_MINUTA_AI_MOCK_FAIL')
  }

  const problematica = input.problematica.trim().slice(0, MAX_PROBLEMATICA_CHARS)
  const areaNombre = input.areaNombre.trim()
  if (!problematica || !areaNombre) return null

  const result = await callVertexGemini({
    systemInstruction:
      'Devolvé solo JSON parseable. No uses bloques markdown ni texto fuera del JSON.',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: buildGeminiPrompt({
              problematica,
              areaNombre,
              urgencia: input.urgencia,
            }),
          },
        ],
      },
    ],
    temperature: 0.25,
    maxOutputTokens: 2048,
  })

  const parsed = parseJsonObjectFromGeminiText(result.text)
  const aiPayload = parseMinutaDiagnosticoAiPayload(parsed)
  if (!aiPayload) {
    throw new Error('Gemini devolvió JSON con forma inválida para minuta de diagnóstico')
  }

  return buildMinutaDiagnosticoFromAiPayload(aiPayload)
}

/** Una sola generación al crear el ticket; errores no propagan. */
export async function attachMinutaDiagnosticoDraftOnTicketCreate(input: {
  ticketId: string
  reunionId: string
  problematica: string
  areaNombre: string
  urgencia: HelpdeskUrgencia
}): Promise<boolean> {
  try {
    const draft = await generateMinutaDiagnosticoDraftFromProblematica({
      problematica: input.problematica,
      areaNombre: input.areaNombre,
      urgencia: input.urgencia,
    })
    if (!draft) return false

    await updateHelpdeskReunion(input.ticketId, input.reunionId, {
      minutaDiagnostico: {
        ...draft,
        updatedAt: FieldValue.serverTimestamp(),
      } as HelpdeskMinutaDiagnostico,
    })
    return true
  } catch (err) {
    logError('attachMinutaDiagnosticoDraftOnTicketCreate: falló generación IA', err)
    return false
  }
}
