export const HELPDESK_TOKEN_INVALID_MESSAGE =
  'Este enlace ya se usó o venció, pedí uno nuevo'

export class HelpdeskTokenError extends Error {
  constructor(message: string = HELPDESK_TOKEN_INVALID_MESSAGE) {
    super(message)
    this.name = 'HelpdeskTokenError'
  }
}

export class HelpdeskTokenAlreadyUsedError extends Error {
  constructor(message: string = 'El enlace de solicitud ya fue utilizado') {
    super(message)
    this.name = 'HelpdeskTokenAlreadyUsedError'
  }
}
