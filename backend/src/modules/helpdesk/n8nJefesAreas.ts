import { getEnv } from '../../config/env.js'

export interface JefeAreaTableRow {
  email?: string
  nombre?: string
  area?: string
  link?: string
  enviado?: boolean
  respondido?: boolean
  fecha_envio?: string | number | Date | null
  fecha_respuesta?: string | number | Date | null
  [key: string]: unknown
}

export async function listJefesAreasRows(input?: {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<JefeAreaTableRow[]> {
  const env = getEnv()
  if (!env.n8nManagementCredential) {
    throw new Error('N8N_MGMT_API_KEY no configurada')
  }
  const fetchImpl = input?.fetchImpl ?? fetch
  const timeoutMs = input?.timeoutMs ?? 15_000
  const response = await fetchImpl(
    `${env.n8nMgmtApiBase}/data-tables/${encodeURIComponent(env.n8nJefesAreasTableId)}/rows`,
    {
      headers: {
        'X-N8N-API-KEY': env.n8nManagementCredential,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
  )
  if (!response.ok) {
    throw new Error(`n8n data table respondió ${response.status}`)
  }
  const payload = (await response.json()) as { data?: unknown }
  return Array.isArray(payload.data) ? (payload.data as JefeAreaTableRow[]) : []
}
