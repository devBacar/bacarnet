import { ChevronLeft, ChevronRight, Phone, Shield, UserCog } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useUrlWeekParam } from '../hooks/useUrlSearchState'
import { getWeekShiftSnapshot, type WeekShiftSnapshot } from '../services/shiftService'
import { addWeeks, getWeekKey } from '../utils/weekUtils'

export function ShiftWidget() {
  const [weekKey, setWeekKeyParam] = useUrlWeekParam('semana')
  const setWeekKey = useCallback(
    (next: string | ((prev: string) => string)) => {
      setWeekKeyParam(typeof next === 'function' ? next(weekKey) : next)
    },
    [setWeekKeyParam, weekKey],
  )
  const [snapshot, setSnapshot] = useState<WeekShiftSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async (key: string) => {
    setLoading(true)
    setError(false)
    try {
      const data = await getWeekShiftSnapshot(key)
      setSnapshot(data)
    } catch (err) {
      console.error('Error al cargar turnos:', err)
      setSnapshot(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(weekKey)
  }, [weekKey, load])

  const isCurrentWeek = weekKey === getWeekKey()

  return (
    <section className="card-minimal overflow-hidden">
      <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 lg:px-5 lg:py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-gray-100">
              Turno de la semana
            </h2>
            <p className="text-xs text-neutral-500 dark:text-gray-400">
              {snapshot?.weekLabel ?? 'Lunes a domingo'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setWeekKey((k) => addWeeks(k, -1))}
              className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-800 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => setWeekKey(getWeekKey())}
                className="rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-primary hover:bg-brand-tint"
              >
                Hoy
              </button>
            )}
            <button
              type="button"
              onClick={() => setWeekKey((k) => addWeeks(k, 1))}
              className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-800 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4 lg:p-5">
        {loading ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-zinc-800" />
            <div className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-zinc-800" />
          </div>
        ) : error ? (
          <p className="text-sm text-danger">
            No se pudieron cargar los turnos.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-primary">
                <Shield className="h-3.5 w-3.5" />
                Jefe de turno
              </div>
              {snapshot?.jefe?.fullName ? (
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-gray-100">
                    {snapshot.jefe.fullName}
                  </p>
                  {snapshot.jefe.internalPhone && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-600 dark:text-gray-400">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      Interno {snapshot.jefe.internalPhone}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-gray-400">
                  Sin asignar esta semana
                </p>
              )}
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-primary">
                <UserCog className="h-3.5 w-3.5" />
                Sistemas
              </div>
              {snapshot?.systems?.name ? (
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-neutral-900 dark:text-gray-100">
                    {snapshot.systems.name}
                  </p>
                  {snapshot.systems.isOverride && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      Excepción
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-gray-400">
                  Sin asignar esta semana
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
