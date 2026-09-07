/** Fecha ISO `YYYY-MM-DD` o variantes parseables por Date. */
export function isBirthdayToday(birthDate: string | undefined): boolean {
  if (!birthDate?.trim()) return false

  const parsed = parseBirthDateParts(birthDate)
  if (!parsed) return false

  const today = new Date()
  return parsed.month === today.getMonth() + 1 && parsed.day === today.getDate()
}

function parseBirthDateParts(
  birthDate: string,
): { month: number; day: number } | null {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate.trim())
  if (isoMatch) {
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day }
    }
    return null
  }

  const parsed = new Date(birthDate)
  if (Number.isNaN(parsed.getTime())) return null
  return { month: parsed.getMonth() + 1, day: parsed.getDate() }
}
