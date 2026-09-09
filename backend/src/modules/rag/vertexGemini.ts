import { google } from 'googleapis'
import { getEnv } from '../../config/env.js'
import { initFirebaseAdmin } from '../../lib/firebase/admin.js'
import { getApps } from 'firebase-admin/app'
import { logError } from '../../lib/log.js'
import type { AssistantUsageMeter } from './assistantUsageMeter.js'
import { RAG_GENERATION_MODEL } from './constants.js'

const IAM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

export type GeminiContentPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

export type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiContentPart[]
}

export type GeminiFunctionDeclaration = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export type GeminiUsageMetadata = {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
}

export type GeminiGenerateResult = {
  text: string
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>
  usage?: GeminiUsageMetadata
}

async function resolveGcpProjectId(): Promise<string> {
  const fromEnv = getEnv().gcpProjectId
  if (fromEnv) return fromEnv

  initFirebaseAdmin()
  const app = getApps()[0]
  const projectId = app?.options?.projectId
  if (typeof projectId === 'string' && projectId.length > 0) {
    return projectId
  }

  throw new Error('No se pudo resolver GCP project id para Gemini')
}

async function getVertexAccessToken(): Promise<string> {
  const env = getEnv()
  if (env.driveServiceAccountKeyPath) {
    const jwt = new google.auth.JWT({
      keyFile: env.driveServiceAccountKeyPath,
      scopes: [IAM_SCOPE],
    })
    const { token } = await jwt.getAccessToken()
    if (!token) throw new Error('JWT no devolvió token para Vertex')
    return token
  }

  const googleAuth = new google.auth.GoogleAuth({ scopes: [IAM_SCOPE] })
  const client = await googleAuth.getClient()
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('ADC no devolvió access token para Vertex')
  return token
}

function buildGenerateUrl(projectId: string, location: string): string {
  return (
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${RAG_GENERATION_MODEL}:generateContent`
  )
}

export async function callVertexGemini(input: {
  systemInstruction?: string
  contents: GeminiContent[]
  tools?: GeminiFunctionDeclaration[]
  temperature?: number
  maxOutputTokens?: number
  usageMeter?: AssistantUsageMeter
}): Promise<GeminiGenerateResult> {
  const projectId = await resolveGcpProjectId()
  const location = getEnv().ragEmbeddingLocation
  const token = await getVertexAccessToken()
  const url = buildGenerateUrl(projectId, location)

  const payload: Record<string, unknown> = {
    contents: input.contents,
    generationConfig: {
      temperature: input.temperature ?? 0.2,
      maxOutputTokens: input.maxOutputTokens ?? 1024,
    },
  }

  if (input.systemInstruction) {
    payload.systemInstruction = { parts: [{ text: input.systemInstruction }] }
  }

  if (input.tools && input.tools.length > 0) {
    payload.tools = [{ functionDeclarations: input.tools }]
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    logError('Vertex Gemini fetch falló', err)
    throw new Error('No se pudo contactar Gemini para generar la respuesta')
  }

  type GeminiResponse = {
    candidates?: Array<{
      content?: {
        role?: string
        parts?: Array<{
          text?: string
          functionCall?: { name?: string; args?: Record<string, unknown> }
        }>
      }
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
    }
    error?: { message?: string }
  }

  const body = (await res.json().catch(() => ({}))) as GeminiResponse
  if (!res.ok) {
    throw new Error(body.error?.message ?? `Gemini HTTP ${res.status}`)
  }

  const parts = body.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((part) => part.text ?? '').join('').trim()
  const functionCalls: GeminiGenerateResult['functionCalls'] = []

  for (const part of parts) {
    if (part.functionCall?.name) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
      })
    }
  }

  const usage: GeminiUsageMetadata | undefined =
    typeof body.usageMetadata?.promptTokenCount === 'number' ||
    typeof body.usageMetadata?.candidatesTokenCount === 'number'
      ? {
          promptTokenCount: body.usageMetadata.promptTokenCount ?? 0,
          candidatesTokenCount: body.usageMetadata.candidatesTokenCount ?? 0,
          totalTokenCount: body.usageMetadata.totalTokenCount ?? 0,
        }
      : undefined

  if (usage && input.usageMeter) {
    input.usageMeter.recordGemini({
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
    })
  }

  return { text, functionCalls, usage }
}
