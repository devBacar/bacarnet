/** Códigos técnicos Interbanking → mensaje para la UI (ampliar cuando haya adapter real). */
const INTERBANKING_ERROR_MESSAGES: Record<string, string> = {
  'tef.gestion.error.ctacontrol.debito.no.operativa':
    'La cuenta de débito no está habilitada para este tipo de transferencia.',
  'tef.gestion.error.monto.supera.tope':
    'El importe supera el límite permitido para esta operación.',
  'tef.gestion.error.cbu.invalido': 'El CBU de la cuenta crédito debe tener 22 dígitos.',
}

export function translateInterbankingError(code: string): string {
  const key = code.trim().toLowerCase()
  return INTERBANKING_ERROR_MESSAGES[key] ?? 'Interbanking rechazó la confección. Revisá los datos o contactá al banco.'
}

export function translateInterbankingErrors(codes: string[] | null | undefined): string[] | null {
  if (!codes?.length) return null
  return codes.map(translateInterbankingError)
}
