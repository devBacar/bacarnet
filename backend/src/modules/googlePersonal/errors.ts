export const GOOGLE_RECONNECT_REQUIRED = 'google_reconnect_required' as const

export class GoogleReconnectRequiredError extends Error {
  readonly code = GOOGLE_RECONNECT_REQUIRED

  constructor(message = 'Hay que volver a conectar Google') {
    super(message)
    this.name = 'GoogleReconnectRequiredError'
  }
}

export function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const message = 'message' in err && typeof err.message === 'string' ? err.message : ''
  const code =
    'code' in err && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : ''
  const response =
    'response' in err && err.response && typeof err.response === 'object'
      ? (err.response as { data?: { error?: string } }).data?.error
      : undefined
  return (
    code === 'invalid_grant' ||
    response === 'invalid_grant' ||
    /invalid_grant/i.test(message)
  )
}
