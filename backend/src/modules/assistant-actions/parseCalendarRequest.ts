import { addDaysIso, todayInTimeZone } from './calendarDateTime.js'
import { isCalendarCreateQuery, isCalendarReadQuery } from '../rag/assistantIntent.js'

export type ParsedCalendarRequest = {
  title: string
  startDateTime: string
  endDateTime: string
  attendees: string[]
  addGoogleMeet: boolean
  description: string
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function extractAttendeeEmails(text: string): string[] {
  const matches = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []
  return [...new Set(matches.map((email) => email.toLowerCase()))]
}

function parseTomorrowAtHour(text: string): { hour: number; minute: number } | null {
  const atHour =
    /ma[nñ]ana\s+(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\b/i.exec(text) ??
    /a\s+las?\s+(\d{1,2})(?::(\d{2}))?\s*(?:de\s+)?ma[nñ]ana/i.exec(text)
  if (!atHour) return null
  const hour = Number.parseInt(atHour[1], 10)
  const minute = atHour[2] ? Number.parseInt(atHour[2], 10) : 0
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function parseExplicitRange(text: string, dateIso: string): ParsedCalendarRequest | null {
  const titleMatch = /titulad[oa]\s+"([^"]+)"/i.exec(text)
  const timeMatch = /(\d{1,2}):(\d{2})\s*a\s*(\d{1,2}):(\d{2})/i.exec(text)
  if (!titleMatch || !timeMatch) return null

  const startDateTime = `${dateIso}T${pad2(Number.parseInt(timeMatch[1], 10))}:${pad2(Number.parseInt(timeMatch[2], 10))}:00`
  const endDateTime = `${dateIso}T${pad2(Number.parseInt(timeMatch[3], 10))}:${pad2(Number.parseInt(timeMatch[4], 10))}:00`

  return {
    title: titleMatch[1].trim(),
    startDateTime,
    endDateTime,
    attendees: extractAttendeeEmails(text),
    addGoogleMeet: /\b(meet|google\s+meet|videollamada)\b/i.test(text),
    description: 'Evento preparado desde el asistente BacarNet.',
  }
}

export function parseCalendarFromNaturalLanguage(text: string): ParsedCalendarRequest | null {
  if (isCalendarReadQuery(text) || !isCalendarCreateQuery(text)) return null

  const tomorrow = addDaysIso(todayInTimeZone(), 1)
  const explicit = parseExplicitRange(text, tomorrow)
  if (explicit) return explicit

  const atHour = parseTomorrowAtHour(text)
  if (!atHour) return null

  const startDateTime = `${tomorrow}T${pad2(atHour.hour)}:${pad2(atHour.minute)}:00`
  const endHour = atHour.minute + 30 >= 60 ? atHour.hour + 1 : atHour.hour
  const endMinute = (atHour.minute + 30) % 60
  const endDateTime = `${tomorrow}T${pad2(endHour)}:${pad2(endMinute)}:00`

  const topicMatch = /para\s+(?:conversar\s+)?(?:sobre\s+)?(?:este\s+)?(.{4,80})/i.exec(text)
  const title = topicMatch
    ? `Reunión — ${topicMatch[1].trim().replace(/[.!?]+$/, '')}`
    : 'Reunión BacarNet'

  return {
    title: title.slice(0, 200),
    startDateTime,
    endDateTime,
    attendees: extractAttendeeEmails(text),
    addGoogleMeet: /\b(meet|google\s+meet|videollamada)\b/i.test(text),
    description: 'Evento preparado desde el asistente BacarNet.',
  }
}
