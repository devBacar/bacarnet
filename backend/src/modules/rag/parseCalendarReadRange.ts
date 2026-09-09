import { addDaysIso, todayInTimeZone } from '../assistant-actions/calendarDateTime.js'

export type CalendarReadRange = {
  dateFrom: string
  dateTo: string
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
}

function normalizeWeekday(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\u0307/g, '')
    .replace(/[\u0300-\u036f]/g, '')
}

function nextWeekdayIso(fromDate: string, weekdayName: string): string {
  const target = WEEKDAY_TO_INDEX[normalizeWeekday(weekdayName)]
  if (target === undefined) return fromDate

  const base = new Date(`${fromDate}T12:00:00`)
  const current = base.getDay()
  let delta = target - current
  if (delta <= 0) delta += 7
  base.setDate(base.getDate() + delta)
  return base.toISOString().slice(0, 10)
}

/** Rango de fechas para consultas de agenda en lenguaje natural (zona AR). */
export function parseCalendarReadRange(
  question: string,
  referenceDate = todayInTimeZone(),
): CalendarReadRange {
  const text = question.trim().toLowerCase()

  if (/\besta\s+semana\b|\bde\s+la\s+semana\b|\bagenda\s+de\s+la\s+semana\b/.test(text)) {
    return { dateFrom: referenceDate, dateTo: addDaysIso(referenceDate, 6) }
  }

  if (/\bma[nñ]ana\b/.test(text)) {
    const tomorrow = addDaysIso(referenceDate, 1)
    return { dateFrom: tomorrow, dateTo: tomorrow }
  }

  const weekdayMatch =
    /\b(?:el|para\s+el)\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.exec(
      question,
    )
  if (weekdayMatch) {
    const day = nextWeekdayIso(referenceDate, weekdayMatch[1])
    return { dateFrom: day, dateTo: day }
  }

  return { dateFrom: referenceDate, dateTo: referenceDate }
}
