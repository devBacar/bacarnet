import { google } from 'googleapis'
import { getEnv } from '../../config/env.js'
import { initFirebaseAdmin } from '../../lib/firebase/admin.js'
import { getApps } from 'firebase-admin/app'
import { logError } from '../../lib/log.js'

export const RAG_EMBEDDING_MODEL = 'text-embedding-005'
const IAM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const BATCH_SIZE = 16

async function resolveGcpProjectId(): Promise<string> {
  const fromEnv = getEnv().gcpProjectId
  if (fromEnv) return fromEnv

  initFirebaseAdmin()
  const app = getApps()[0]
  const projectId = app?.options?.projectId
  if (typeof projectId === 'string' && projectId.length > 0) {
    return projectId
  }

  throw new Error(
    'No se pudo resolver GCP project id. Definí GCP_PROJECT_ID o GOOGLE_CLOUD_PROJECT.',
  )
}

async function getVertexAccessToken(): Promise<string> {
  const googleAuth = new google.auth.GoogleAuth({ scopes: [IAM_SCOPE] })
  const client = await googleAuth.getClient()
  const { token } = await client.getAccessToken()
  if (!token) {
    throw new Error('ADC no devolvió access token para Vertex AI')
  }
  return token
}

type EmbeddingResponse = {
  predictions?: Array<{
    embeddings?: {
      values?: number[]
    }
  }>
  error?: { message?: string }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const projectId = await resolveGcpProjectId()
  const location = getEnv().ragEmbeddingLocation
  const token = await getVertexAccessToken()
  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${RAG_EMBEDDING_MODEL}:predict`

  const vectors: number[][] = []

  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const batch = texts.slice(offset, offset + BATCH_SIZE)
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: batch.map((content) => ({ content })),
        }),
      })
    } catch (err) {
      logError('Vertex embeddings fetch falló', err)
      throw new Error('No se pudo contactar Vertex AI para embeddings')
    }

    const body = (await res.json().catch(() => ({}))) as EmbeddingResponse
    if (!res.ok) {
      throw new Error(body.error?.message ?? `Vertex embeddings HTTP ${res.status}`)
    }

    for (const prediction of body.predictions ?? []) {
      const values = prediction.embeddings?.values
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Vertex devolvió un embedding vacío')
      }
      vectors.push(values)
    }
  }

  if (vectors.length !== texts.length) {
    throw new Error(`Embeddings incompletos: ${vectors.length}/${texts.length}`)
  }

  return vectors
}

export function encodeEmbeddingsSnapshot(vectors: number[][], dims: number): Buffer {
  const chunkCount = vectors.length
  const header = Buffer.alloc(12)
  header.write('RAG1', 0, 4, 'ascii')
  header.writeUInt32LE(1, 4)
  header.writeUInt32LE(chunkCount, 8)

  const body = Buffer.alloc(chunkCount * dims * 4)
  let offset = 0
  for (const vector of vectors) {
    if (vector.length !== dims) {
      throw new Error(`Embedding dims=${vector.length}, esperado ${dims}`)
    }
    for (const value of vector) {
      body.writeFloatLE(value, offset)
      offset += 4
    }
  }

  return Buffer.concat([header, body])
}
