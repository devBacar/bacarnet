/** Normaliza Timestamp Admin, objetos legacy o ISO string a Date. */
export function agendaTimestampToDate(value: unknown): Date | null {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string') {
    const d = new Date(value.trim())
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const toDate = (value as { toDate?: () => Date }).toDate
    if (typeof toDate === 'function') {
      const d = toDate.call(value)
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
    }
    const sec =
      typeof record._seconds === 'number'
        ? record._seconds
        : typeof record.seconds === 'number'
          ? record.seconds
          : null
    if (sec != null) return new Date(sec * 1000)
  }
  return null
}

export function agendaTimestampToIso(value: unknown): string | null {
  const d = agendaTimestampToDate(value)
  return d ? d.toISOString() : null
}
