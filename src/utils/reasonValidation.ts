export function isValidReason(value: string): boolean {
  return value.trim().length > 0
}

export const REASON_REQUIRED_ERROR = 'El motivo es obligatorio'
export const REASON_REQUIRED_LABEL = 'Motivo (obligatorio)'
