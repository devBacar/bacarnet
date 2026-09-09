import { google } from 'googleapis'
import { getEnv } from '../../config/env.js'
import { initFirebaseAdmin } from '../../lib/firebase/admin.js'
import { getApps } from 'firebase-admin/app'
import { logError } from '../../lib/log.js'
import { RAG_GENERATION_MODEL } from './constants.js'

export { RAG_GENERATION_MODEL }
const IAM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

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

export type RagCitation = {
  fileId: string
  fileName: string
  webViewLink: string | null
  chunkIndex: number
  excerpt: string
}

export async function generateRagAnswer(input: {
  question: string
  citations: RagCitation[]
}): Promise<string> {
  if (input.citations.length === 0) {
    return 'No encontré documentos de Sistemas con permiso para responder esa consulta.'
  }

  const projectId = await resolveGcpProjectId()
  const location = getEnv().ragEmbeddingLocation
  const token = await getVertexAccessToken()
  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${RAG_GENERATION_MODEL}:generateContent`

  const contextBlocks = input.citations
    .map(
      (citation, index) =>
        `[${index + 1}] ${citation.fileName}\n${citation.excerpt}\nURL: ${citation.webViewLink ?? 'sin enlace'}`,
    )
    .join('\n\n')

  const prompt =
    'Sos un asistente interno de Bacarsa. Respondé en español, de forma concisa y precisa.\n' +
    'Usá solo el contexto provisto. Si no alcanza, decilo explícitamente.\n' +
    'Citá fuentes como [1], [2], etc.\n\n' +
    `Pregunta:\n${input.question.trim()}\n\n` +
    `Contexto:\n${contextBlocks}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      }),
    })
  } catch (err) {
    logError('Vertex Gemini fetch falló', err)
    throw new Error('No se pudo contactar Gemini para generar la respuesta')
  }

  type GeminiResponse = {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }

  const body = (await res.json().catch(() => ({}))) as GeminiResponse
  if (!res.ok) {
    throw new Error(body.error?.message ?? `Gemini HTTP ${res.status}`)
  }

  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  if (!text.trim()) {
    throw new Error('Gemini devolvió una respuesta vacía')
  }

  return text.trim()
}
