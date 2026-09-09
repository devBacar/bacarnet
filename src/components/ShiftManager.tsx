import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useUrlEnumParam, useUrlWeekParam } from '../hooks/useUrlSearchState'
import { AdminTabs } from './AdminTabs'
import { JefeAnnualGrid } from './JefeAnnualGrid'
import {
  clearSystemsOverride,
  DEFAULT_SYSTEMS_MEMBERS,
  getJefeAssignment,
  getSystemsOverride,
  getSystemsRotationConfig,
  previewSystemsRotation,
  saveJefeAssignment,
  saveSystemsOverride,
  saveSystemsRotationConfig,
  type SystemsRotationConfig,
} from '../services/shiftService'
import { addWeeks, formatDateKey, getMonday, getWeekKey, getWeekRangeLabel, parseDateKey } from '../utils/weekUtils'

const inputClassName =
  'input-brand-focus w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-800'

const selectClassName =
  'input-brand-focus w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-colors focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:focus:bg-zinc-800'

const SHIFT_TABS = [
  { id: 'jefes', label: 'Jefes de turno' },
  { id: 'sistemas', label: 'Sistemas' },
] as const

type ShiftTab = (typeof SHIFT_TABS)[number]['id']

export function ShiftManager() {
  const [activeTab, setActiveTab] = useUrlEnumParam(
    'tab',
    SHIFT_TABS.map((tab) => tab.id),
    'jefes',
  )
  const [weekKey, setWeekKeyParam] = useUrlWeekParam('semana')
  const setWeekKey = useCallback(
    (next: string | ((prev: string) => string)) => {
      setWeekKeyParam(typeof next === 'function' ? next(weekKey) : next)
    },
    [setWeekKeyParam, weekKey],
  )
  const [gridRefresh, setGridRefresh] = useState(0)
  const weeklyFormRef = useRef<HTMLElement>(null)
  const [jefeForm, setJefeForm] = useState({ firstName: '', lastName: '', internalPhone: '' })
  const [jefeSaving, setJefeSaving] = useState(false)
  const [jefeLoading, setJefeLoading] = useState(true)

  const [rotation, setRotation] = useState<SystemsRotationConfig | null>(null)
  const [rotationSaving, setRotationSaving] = useState(false)
  const [preview, setPreview] = useState<
    Array<{ weekKey: string; name: string; isOverride: boolean }>
  >([])

  const [overrideName, setOverrideName] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')

  const loadJefe = useCallback(async (key: string) => {
    setJefeLoading(true)
    try {
      const assignment = await getJefeAssignment(key)
      setJefeForm({
        firstName: assignment?.firstName ?? '',
        lastName: assignment?.lastName ?? '',
        internalPhone: assignment?.internalPhone ?? '',
      })
    } catch (err) {
      console.error('Error al cargar jefe de turno:', err)
      toast.error('No se pudo cargar el jefe de turno')
    } finally {
      setJefeLoading(false)
    }
  }, [])

  const loadRotation = useCallback(async (fromWeekKey: string) => {
    try {
      const config = await getSystemsRotationConfig()
      setRotation(config)
      const rows = await previewSystemsRotation(fromWeekKey, 12)
      setPreview(rows)
    } catch (err) {
      console.error('Error al cargar rotación de sistemas:', err)
      toast.error('No se pudo cargar la rotación de sistemas')
    }
  }, [])

  const loadOverride = useCallback(async (key: string) => {
    try {
      const override = await getSystemsOverride(key)
      setOverrideName(override?.assigneeName ?? '')
      setOverrideReason(override?.reason ?? '')
    } catch (err) {
      console.error('Error al cargar excepción:', err)
    }
  }, [])

  useEffect(() => {
    loadJefe(weekKey)
    loadOverride(weekKey)
  }, [weekKey, loadJefe, loadOverride])

  useEffect(() => {
    loadRotation(weekKey)
  }, [weekKey, loadRotation])

  const handleJefeSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!jefeForm.firstName.trim() || !jefeForm.lastName.trim()) {
      toast.error('Completá nombre y apellido del jefe de turno')
      return
    }

    setJefeSaving(true)
    try {
      await saveJefeAssignment({ weekKey, ...jefeForm })
      setGridRefresh((n) => n + 1)
      toast.success('Jefe de turno guardado')
    } catch (err) {
      console.error('Error al guardar jefe:', err)
      toast.error('No se pudo guardar el jefe de turno')
    } finally {
      setJefeSaving(false)
    }
  }

  const handleRotationSave = async () => {
    if (!rotation) return

    setRotationSaving(true)
    try {
      const anchorMonday = formatDateKey(getMonday(parseDateKey(rotation.anchorWeekKey)))
      const normalized = { ...rotation, anchorWeekKey: anchorMonday }
      await saveSystemsRotationConfig(normalized)
      setRotation(normalized)
      await loadRotation(weekKey)
      toast.success('Rotación de sistemas actualizada')
    } catch (err) {
      console.error('Error al guardar rotación:', err)
      toast.error('No se pudo guardar la rotación')
    } finally {
      setRotationSaving(false)
    }
  }

  const handleOverrideSave = async () => {
    if (!overrideName.trim()) {
      toast.error('Elegí quién cubre la semana')
      return
    }

    setOverrideSaving(true)
    try {
      await saveSystemsOverride({
        weekKey,
        assigneeName: overrideName,
        reason: overrideReason || undefined,
      })
      await loadRotation(weekKey)
      toast.success('Excepción guardada')
    } catch (err) {
      console.error('Error al guardar excepción:', err)
      toast.error('No se pudo guardar la excepción')
    } finally {
      setOverrideSaving(false)
    }
  }

  const handleOverrideClear = async () => {
    setOverrideSaving(true)
    try {
      await clearSystemsOverride(weekKey)
      setOverrideName('')
      setOverrideReason('')
      await loadRotation(weekKey)
      toast.success('Excepción eliminada — vuelve la rotación automática')
    } catch (err) {
      console.error('Error al quitar excepción:', err)
      toast.error('No se pudo quitar la excepción')
    } finally {
      setOverrideSaving(false)
    }
  }

  const members = rotation?.members ?? [...DEFAULT_SYSTEMS_MEMBERS]

  const moveMember = (index: number, direction: -1 | 1) => {
    setRotation((current) => {
      if (!current) return current
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.members.length) return current

      const nextMembers = [...current.members]
      ;[nextMembers[index], nextMembers[nextIndex]] = [nextMembers[nextIndex], nextMembers[index]]

      let nextAnchorIndex = current.anchorIndex
      if (current.anchorIndex === index) {
        nextAnchorIndex = nextIndex
      } else if (current.anchorIndex === nextIndex) {
        nextAnchorIndex = index
      }

      return { ...current, members: nextMembers, anchorIndex: nextAnchorIndex }
    })
  }

  const removeMember = (index: number) => {
    setRotation((current) => {
      if (!current || current.members.length <= 1) return current

      const nextMembers = current.members.filter((_, memberIndex) => memberIndex !== index)
      let nextAnchorIndex = current.anchorIndex
      if (index < current.anchorIndex) {
        nextAnchorIndex -= 1
      } else if (index === current.anchorIndex) {
        nextAnchorIndex = Math.min(current.anchorIndex, nextMembers.length - 1)
      }

      return { ...current, members: nextMembers, anchorIndex: nextAnchorIndex }
    })
  }

  const addMember = () => {
    const trimmed = newMemberName.trim()
    if (!trimmed) {
      toast.error('Escribí un nombre para agregar')
      return
    }

    setRotation((current) => {
      if (!current) return current
      if (current.members.some((name) => name.toLowerCase() === trimmed.toLowerCase())) {
        toast.error('Esa persona ya está en la rotación')
        return current
      }
      return { ...current, members: [...current.members, trimmed] }
    })
    setNewMemberName('')
  }

  const handleGridSelectWeek = (key: string) => {
    setWeekKey(key)
    setActiveTab('jefes')
    requestAnimationFrame(() => {
      weeklyFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="space-y-6">
      <AdminTabs
        tabs={[...SHIFT_TABS]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as ShiftTab)}
      />

      {activeTab === 'jefes' && (
        <>
          <JefeAnnualGrid
            selectedWeekKey={weekKey}
            onSelectWeek={handleGridSelectWeek}
            refreshToken={gridRefresh}
          />

          <section
            ref={weeklyFormRef}
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
          >
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-gray-100">
              Editar semana seleccionada
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
              Asignación manual por semana (lunes a domingo). Independiente del directorio.
            </p>
          </div>
          <div className="flex items-center gap-1 self-start rounded-xl border border-neutral-200 bg-neutral-50 p-1 dark:border-zinc-700 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setWeekKey((k) => addWeeks(k, -1))}
              className="rounded-lg p-2 text-neutral-600 hover:bg-white dark:text-gray-400 dark:hover:bg-zinc-800"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[10rem] px-2 text-center text-sm font-medium text-neutral-800 dark:text-gray-200">
              {getWeekRangeLabel(weekKey)}
            </div>
            <button
              type="button"
              onClick={() => setWeekKey((k) => addWeeks(k, 1))}
              className="rounded-lg p-2 text-neutral-600 hover:bg-white dark:text-gray-400 dark:hover:bg-zinc-800"
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {weekKey !== getWeekKey() && (
              <button
                type="button"
                onClick={() => setWeekKey(getWeekKey())}
                className="ml-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-tint"
              >
                Actual
              </button>
            )}
          </div>
        </header>

        {jefeLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-neutral-100 dark:bg-zinc-800" />
        ) : (
          <form onSubmit={handleJefeSubmit} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                Nombre
              </label>
              <input
                type="text"
                value={jefeForm.firstName}
                onChange={(e) => setJefeForm((f) => ({ ...f, firstName: e.target.value }))}
                className={inputClassName}
                placeholder="Ej. Juan"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                Apellido
              </label>
              <input
                type="text"
                value={jefeForm.lastName}
                onChange={(e) => setJefeForm((f) => ({ ...f, lastName: e.target.value }))}
                className={inputClassName}
                placeholder="Ej. Pérez"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                Interno
              </label>
              <input
                type="text"
                value={jefeForm.internalPhone}
                onChange={(e) => setJefeForm((f) => ({ ...f, internalPhone: e.target.value }))}
                className={inputClassName}
                placeholder="Ej. 1234"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={jefeSaving}
                className="rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {jefeSaving ? 'Guardando…' : 'Guardar jefe de turno'}
              </button>
            </div>
          </form>
        )}
          </section>
        </>
      )}

      {activeTab === 'sistemas' && (
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <header className="mb-5">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-gray-100">
            Sistemas — rotación semanal
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
            Editá el orden base de la rotación y marcá excepciones puntuales por semana.
          </p>
        </header>

        {rotation && (
          <div className="mb-6 rounded-xl border border-neutral-200 p-4 dark:border-zinc-700">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-gray-100">
              Orden de la rotación
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
              La secuencia avanza semana a semana en este orden. Guardá los cambios con el botón
              de abajo.
            </p>
            <ol className="mt-4 space-y-2">
              {members.map((name, index) => (
                <li
                  key={`${name}-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/50"
                >
                  <span className="min-w-[1.5rem] text-xs font-semibold text-neutral-400">
                    {index + 1}.
                  </span>
                  <span className="flex-1 text-sm font-medium text-neutral-900 dark:text-gray-100">
                    {name}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveMember(index, -1)}
                      disabled={index === 0}
                      aria-label={`Subir a ${name}`}
                      className="rounded-lg border border-neutral-300 p-1.5 text-neutral-600 hover:bg-white disabled:opacity-40 dark:border-zinc-600 dark:text-gray-300 dark:hover:bg-zinc-800"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMember(index, 1)}
                      disabled={index === members.length - 1}
                      aria-label={`Bajar a ${name}`}
                      className="rounded-lg border border-neutral-300 p-1.5 text-neutral-600 hover:bg-white disabled:opacity-40 dark:border-zinc-600 dark:text-gray-300 dark:hover:bg-zinc-800"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMember(index)}
                      disabled={members.length <= 1}
                      aria-label={`Quitar a ${name}`}
                      className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMember()
                  }
                }}
                className={`${inputClassName} min-w-[12rem] flex-1`}
                placeholder="Nombre para agregar a la rotación"
              />
              <button
                type="button"
                onClick={addMember}
                className="inline-flex items-center gap-1.5 rounded-xl border border-brand-primary px-4 py-3 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-tint dark:hover:bg-brand-primary-hover/30"
              >
                <Plus className="h-4 w-4" />
                Agregar
              </button>
            </div>
          </div>
        )}

        {rotation && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                Semana ancla (desde)
              </label>
              <input
                type="date"
                value={rotation.anchorWeekKey}
                onChange={(e) => {
                  const mondayKey = formatDateKey(
                    getMonday(new Date(`${e.target.value}T12:00:00`)),
                  )
                  setRotation((r) => (r ? { ...r, anchorWeekKey: mondayKey } : r))
                }}
                className={inputClassName}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                Quién arranca esa semana
              </label>
              <select
                value={rotation.anchorIndex}
                onChange={(e) =>
                  setRotation((r) =>
                    r ? { ...r, anchorIndex: Number(e.target.value) } : r,
                  )
                }
                className={selectClassName}
              >
                {members.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleRotationSave}
                disabled={rotationSaving}
                className="w-full rounded-xl border border-brand-primary px-4 py-3 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-tint disabled:opacity-60 dark:hover:bg-brand-primary-hover/30"
              >
                {rotationSaving ? 'Guardando…' : 'Guardar rotación'}
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 overflow-x-auto rounded-xl border border-neutral-200 dark:border-zinc-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-zinc-950 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Semana</th>
                <th className="px-4 py-3 font-semibold">Sistemas</th>
                <th className="px-4 py-3 font-semibold">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
              {preview.map((row) => (
                <tr
                  key={row.weekKey}
                  className={
                    row.weekKey === weekKey
                      ? 'bg-brand-tint/60'
                      : 'bg-white dark:bg-zinc-900'
                  }
                >
                  <td className="px-4 py-2.5 text-neutral-700 dark:text-gray-300">
                    {getWeekRangeLabel(row.weekKey)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-gray-100">
                    {row.name}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500 dark:text-gray-400">
                    {row.isOverride ? 'Excepción' : 'Rotación'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-zinc-600 dark:bg-zinc-950/50">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-gray-100">
            Excepción para {getWeekRangeLabel(weekKey)}
          </h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
            Reemplaza solo esta semana; el resto sigue la rotación automática.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                Persona
              </label>
              <select
                value={overrideName}
                onChange={(e) => setOverrideName(e.target.value)}
                className={selectClassName}
              >
                <option value="">— Rotación automática —</option>
                {members.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                Motivo (opcional)
              </label>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className={inputClassName}
                placeholder="Ej. licencia, feriado"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOverrideSave}
              disabled={overrideSaving || !overrideName.trim()}
              className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {overrideSaving ? 'Guardando…' : 'Guardar excepción'}
            </button>
            <button
              type="button"
              onClick={handleOverrideClear}
              disabled={overrideSaving}
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:border-zinc-600 dark:text-gray-300"
            >
              Quitar excepción
            </button>
          </div>
        </div>
      </section>
      )}
    </div>
  )
}
