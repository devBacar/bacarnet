function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

function unwrapData(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload)
  if (!root) return null
  const data = asRecord(root.data)
  return data ?? root
}

function collectRejectedCodes(data: Record<string, unknown> | null): string[] {
  if (!data) return []
  const codes: string[] = []
  const rejected = data.rejected_transfers
  if (!Array.isArray(rejected)) return codes
  for (const item of rejected) {
    const row = asRecord(item)
    if (!row) continue
    const errors = row.errors
    if (!Array.isArray(errors)) continue
    for (const err of errors) {
      const e = asRecord(err)
      if (!e) continue
      const code = pickString(e, 'code', 'message')
      if (code) codes.push(code)
    }
  }
  return codes
}

function collectFailedCodes(payload: unknown): string[] {
  const root = asRecord(payload)
  const data = unwrapData(payload)
  const codes = collectRejectedCodes(data)

  if (root) {
    const failed = root.failed ?? root.failures ?? root.errors
    if (Array.isArray(failed)) {
      for (const item of failed) {
        const row = asRecord(item)
        if (!row) continue
        const code =
          pickString(row, 'code', 'error_code', 'errorCode', 'message_code') ??
          pickString(row, 'message', 'description')
        if (code) codes.push(code)
      }
    }
    const message = pickString(root, 'message', 'error', 'error_description')
    if (message && codes.length === 0) codes.push(message)
  }

  if (data && data.status === false && codes.length === 0) {
    codes.push('interbanking.confeccion.rechazada')
  }

  return codes
}

export interface ParsedInterbankingConfeccionResponse {
  operationId: string | null
  processId: string | null
  confectionIds: string[]
  failedCodes: string[]
  estadoInmediato: 'confeccionada' | 'pendiente_proceso' | 'rechazada'
  interbankingStatus: boolean | null
}

export function parseInterbankingConfeccionResponse(
  httpStatus: number,
  payload: unknown,
): ParsedInterbankingConfeccionResponse {
  const root = asRecord(payload)
  const data = unwrapData(payload)
  const failedCodes = collectFailedCodes(payload)

  let operationId =
    (data && pickString(data, 'operation_id', 'operationId')) ??
    (root && pickString(root, 'operation_id', 'operationId', 'operation-id')) ??
    null
  let processId =
    (data && pickString(data, 'process_id', 'processId')) ??
    (root && pickString(root, 'process_id', 'processId', 'process-id')) ??
    null

  const confectionIds: string[] = []
  const transferLists = [
    data?.accepted_transfers,
    data?.validated_transfers,
    data?.found_transfers,
    root?.found_transfers,
    root?.transfers,
  ]
  for (const list of transferLists) {
    if (!Array.isArray(list)) continue
    for (const t of list) {
      const row = asRecord(t)
      if (!row) continue
      const cid = pickString(row, 'confection_id', 'confectionId')
      if (cid) confectionIds.push(cid)
      operationId = operationId ?? pickString(row, 'operation_id', 'operationId')
      processId = processId ?? pickString(row, 'process_id', 'processId')
    }
  }

  const interbankingStatus =
    data && typeof data.status === 'boolean' ? data.status : null

  if (httpStatus >= 400 || failedCodes.length > 0 || interbankingStatus === false) {
    return {
      operationId,
      processId,
      confectionIds,
      failedCodes,
      estadoInmediato: 'rechazada',
      interbankingStatus,
    }
  }

  if (interbankingStatus === true && operationId) {
    return {
      operationId,
      processId,
      confectionIds,
      failedCodes,
      estadoInmediato: 'confeccionada',
      interbankingStatus,
    }
  }

  if (processId && !operationId) {
    return {
      operationId,
      processId,
      confectionIds,
      failedCodes,
      estadoInmediato: 'pendiente_proceso',
      interbankingStatus,
    }
  }

  return {
    operationId,
    processId,
    confectionIds,
    failedCodes,
    estadoInmediato: operationId ? 'confeccionada' : 'pendiente_proceso',
    interbankingStatus,
  }
}
