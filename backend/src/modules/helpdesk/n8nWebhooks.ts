import { getEnv } from '../../config/env.js'

export type HelpdeskN8nEvento = 'solicitud_creada' | 'estado_cambiado' | 'recordatorio'

export interface HelpdeskN8nNotifyResult {
  ok: boolean
  skipped?: boolean
  status?: number
  reason?: string
}

let lastNotifyResult: (HelpdeskN8nNotifyResult & { evento?: HelpdeskN8nEvento }) | null = null

/** Inspección post-notify (scripts E2E). */
export function peekLastN8nNotifyResult() {
  return lastNotifyResult
}

function webhookUrlForEvento(evento: HelpdeskN8nEvento): string {
  const env = getEnv()
  switch (evento) {
    case 'solicitud_creada':
      return env.helpdeskN8nWebhookSolicitudCreada
    case 'estado_cambiado':
      return env.helpdeskN8nWebhookEstadoCambiado
    case 'recordatorio':
      return env.helpdeskN8nWebhookRecordatorio
    default:
      return ''
  }
}

function buildRequestBody(
  evento: HelpdeskN8nEvento,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (evento === 'estado_cambiado') {
    return payload
  }
  return { evento, ...payload }
}

/** Notifica a n8n sin bloquear ni propagar errores al flujo principal. */
export async function notificarN8n(
  evento: HelpdeskN8nEvento,
  payload: Record<string, unknown>,
): Promise<HelpdeskN8nNotifyResult> {
  const url = webhookUrlForEvento(evento)
  if (!url) {
    console.warn(`webhook de n8n no configurado para ${evento}, se omite`)
    lastNotifyResult = { ok: false, skipped: true, reason: 'no_url', evento }
    return lastNotifyResult
  }

  const { helpdeskN8nOutboundApiKey } = getEnv()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (helpdeskN8nOutboundApiKey) {
    headers['X-Api-Key'] = helpdeskN8nOutboundApiKey
  } else {
    console.warn(`HELPDESK_N8N_OUTBOUND_API_KEY no configurada; POST a n8n sin X-Api-Key (${evento})`)
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildRequestBody(evento, payload)),
    })
    if (!res.ok) {
      console.warn(
        `webhook de n8n respondió ${res.status} para ${evento}: ${await res.text().catch(() => '')}`,
      )
      lastNotifyResult = { ok: false, status: res.status, evento }
      return lastNotifyResult
    }
    lastNotifyResult = { ok: true, status: res.status, evento }
    return lastNotifyResult
  } catch (err) {
    console.warn(`webhook de n8n falló para ${evento}:`, err)
    lastNotifyResult = {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      evento,
    }
    return lastNotifyResult
  }
}
