import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useUrlWeekParam } from '../hooks/useUrlSearchState'
import {
  clearSystemsOverride,
  DEFAULT_SYSTEMS_MEMBERS,
  getSystemsOverride,
  getSystemsRotationConfig,
  resolveSystemsAssignee,
  saveSystemsOverride,
  saveSystemsRotationConfig,
  type SystemsRotationConfig,
} from '../services/shiftService'
import { addWeeks, formatDateKey, getMonday, getWeekRangeLabel, parseDateKey } from '../utils/weekUtils'

const inputClassName =
  'input-brand-focus w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-800'

const selectClassName =
  'input-brand-focus w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-colors focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:focus:bg-zinc-800'

export function ShiftManager() {
  const [weekKey] = useUrlWeekParam('semana')
  const [rotation, setRotation] = useState<SystemsRotationConfig | null>(null)
  const [rotationSaving, setRotationSaving] = useState(false)
  const [preview, setPreview] = useState<
    Array<{ weekKey: string; name: string; isOverride: boolean }>
  >([])

  const [overrideName, setOverrideName] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const rotationDirtyRef = useRef(false)
  const loadRequestIdRef = useRef(0)

  const buildPreviewFromConfig = useCallback(
    async (config: SystemsRotationConfig, fromWeekKey: string, count = 12) => {
      const rows: Array<{ weekKey: string; name: string; isOverride: boolean }> = []
      for (let i = 0; i < count; i += 1) {
        const key = addWeeks(fromWeekKey, i)
        const override = await getSystemsOverride(key)
        const resolved = resolveSystemsAssignee(config, key, override)
        rows.push({ weekKey: key, name: resolved.name, isOverride: resolved.isOverride })
      }
      return rows
    },
    [],
  )

  const loadRotation = useCallback(async (opts?: { force?: boolean }) => {
    const requestId = ++loadRequestIdRef.current
    try {
      const config = await getSystemsRotationConfig()
      if (requestId !== loadRequestIdRef.current) return
      if (opts?.force || !rotationDirtyRef.current) {
        setRotation(config)
      }
    } catch (err) {
      console.error('Error al cargar rotación de sistemas:', err)
      toast.error('No se pudo cargar la rotación de sistemas')
    }
  }, [])

  const refreshPreview = useCallback(
    async (config: SystemsRotationConfig, fromWeekKey: string) => {
      try {
        setPreview(await buildPreviewFromConfig(config, fromWeekKey))
      } catch (err) {
        console.error('Error al armar vista previa de rotación:', err)
      }
    },
    [buildPreviewFromConfig],
  )

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
    loadOverride(weekKey)
  }, [weekKey, loadOverride])

  useEffect(() => {
    void loadRotation()
  }, [weekKey, loadRotation])

  useEffect(() => {
    if (!rotation) return
    void refreshPreview(rotation, weekKey)
  }, [rotation, weekKey, refreshPreview])

  const handleRotationSave = async () => {
    if (!rotation) return

    setRotationSaving(true)
    try {
      const anchorMonday = formatDateKey(getMonday(parseDateKey(rotation.anchorWeekKey)))
      const normalized = { ...rotation, anchorWeekKey: anchorMonday }
      await saveSystemsRotationConfig(normalized)
      setRotation(normalized)
      rotationDirtyRef.current = false
      await loadRotation({ force: true })
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
      if (rotation) await refreshPreview(rotation, weekKey)
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
      if (rotation) await refreshPreview(rotation, weekKey)
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
    rotationDirtyRef.current = true
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
    rotationDirtyRef.current = true
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

    rotationDirtyRef.current = true
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

  return (
    <div className="space-y-6">
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
                  data-testid={`rotation-member-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/50"
                >
                  <span className="min-w-[1.5rem] text-xs font-semibold text-neutral-400">
                    {index + 1}.
                  </span>
                  <span
                    data-testid="rotation-member-name"
                    className="flex-1 text-sm font-medium text-neutral-900 dark:text-gray-100"
                  >
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
    </div>
  )
}
