import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getWeekKey } from '../utils/weekUtils'

export function useUrlSearchParam(
  key: string,
  defaultValue = '',
): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(key) ?? defaultValue

  const setValue = useCallback(
    (next: string) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          const trimmed = next.trim()
          if (!trimmed || trimmed === defaultValue) params.delete(key)
          else params.set(key, trimmed)
          return params
        },
        { replace: true },
      )
    },
    [key, defaultValue, setSearchParams],
  )

  return [value, setValue]
}

export function useUrlEnumParam<T extends string>(
  key: string,
  allowed: readonly T[],
  defaultValue: T,
): [T, (value: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(key)
  const value =
    raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : defaultValue

  const setValue = useCallback(
    (next: T) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          if (next === defaultValue) params.delete(key)
          else params.set(key, next)
          return params
        },
        { replace: true },
      )
    },
    [key, defaultValue, setSearchParams],
  )

  return [value, setValue]
}

function parseCsvParam(raw: string | null): Set<string> {
  if (!raw?.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  )
}

function csvParamValue(values: Set<string>): string | null {
  if (values.size === 0) return null
  return [...values].sort().join(',')
}

export function useUrlCsvParam(
  key: string,
  allowed?: readonly string[],
): [Set<string>, (value: Set<string>) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSet = parseCsvParam(searchParams.get(key))
  const value =
    allowed === undefined
      ? rawSet
      : new Set([...rawSet].filter((item) => (allowed as readonly string[]).includes(item)))

  const setValue = useCallback(
    (next: Set<string>) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          const serialized = csvParamValue(next)
          if (!serialized) params.delete(key)
          else params.set(key, serialized)
          return params
        },
        { replace: true },
      )
    },
    [key, setSearchParams],
  )

  return [value, setValue]
}

const WEEK_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Semana ISO (lunes YYYY-MM-DD) persistida en la URL. */
export function useUrlWeekParam(key = 'semana'): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(key)
  const defaultWeek = getWeekKey()
  const value = raw && WEEK_KEY_PATTERN.test(raw) ? raw : defaultWeek

  const setValue = useCallback(
    (next: string) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          if (!WEEK_KEY_PATTERN.test(next) || next === defaultWeek) params.delete(key)
          else params.set(key, next)
          return params
        },
        { replace: true },
      )
    },
    [defaultWeek, key, setSearchParams],
  )

  return [value, setValue]
}
