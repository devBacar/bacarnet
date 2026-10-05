import { Building2, Plus } from 'lucide-react'
import { useState } from 'react'
import type { GoverningArea } from '../../services/areaService'
import { REASON_REQUIRED_LABEL } from '../../utils/reasonValidation'
import { Chip } from './Chip'
import { SeccionFicha } from './SeccionFicha'

interface AreaChip {
  id: string
  nombre: string
  jefe: boolean
}

export function SeccionAreas({
  areas,
  cargando,
  rolEsAdmin,
  miembroIds,
  jefeIds,
  motivo,
  mostrarMotivo,
  puedeEditarMiembro,
  puedeEditarJefe,
  esSuperAdmin,
  puedeAsignarRol,
  onMiembro,
  onJefe,
  onMotivo,
}: {
  areas: GoverningArea[]
  cargando: boolean
  rolEsAdmin: boolean
  miembroIds: string[]
  jefeIds: string[]
  motivo: string
  mostrarMotivo: boolean
  puedeEditarMiembro: boolean
  puedeEditarJefe: boolean
  esSuperAdmin: boolean
  puedeAsignarRol: boolean
  onMiembro: (ids: string[]) => void
  onJefe: (ids: string[]) => void
  onMotivo: (valor: string) => void
}) {
  const [agregando, setAgregando] = useState(false)
  const [areaNueva, setAreaNueva] = useState('')
  const nombres = new Map(areas.filter((area) => area.id).map((area) => [area.id as string, area.name]))
  const chips = armarChips(miembroIds, rolEsAdmin ? jefeIds : [], nombres)
  const ocupados = new Set(chips.map((chip) => chip.id))
  const disponibles = areas.filter((area) => area.id && !ocupados.has(area.id))

  const agregar = (comoJefe: boolean) => {
    if (!areaNueva) return
    if (comoJefe) {
      if (!puedeEditarJefe) return
      if (!jefeIds.includes(areaNueva)) onJefe([...jefeIds, areaNueva])
    } else if (puedeEditarMiembro && !miembroIds.includes(areaNueva)) {
      onMiembro([...miembroIds, areaNueva])
    }
    setAreaNueva('')
    setAgregando(false)
  }

  return (
    <SeccionFicha icono={Building2} titulo="Áreas">
      {esSuperAdmin ? (
        <>
          <p className="text-sm text-neutral-700 dark:text-gray-300">Tiene acceso a todas las áreas.</p>
          <p className="text-xs text-neutral-500 dark:text-gray-400">Esto no se cambia desde acá.</p>
        </>
      ) : (
        <>
          <p className="text-xs text-neutral-500 dark:text-gray-400">
            Las áreas de las que forma parte. Si dice jefe, también las administra.
          </p>
          {cargando ? (
            <p className="text-sm text-neutral-500 dark:text-gray-400">Cargando áreas…</p>
          ) : chips.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-gray-400">Todavía no tiene áreas.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span key={chip.id} className="inline-flex items-center gap-1">
                  <Chip
                    tono="area"
                    onQuitar={
                      chip.jefe
                        ? puedeEditarJefe
                          ? () => {
                              onJefe(jefeIds.filter((id) => id !== chip.id))
                              onMiembro(miembroIds.filter((id) => id !== chip.id))
                            }
                          : undefined
                        : puedeEditarMiembro
                          ? () => onMiembro(miembroIds.filter((id) => id !== chip.id))
                          : undefined
                    }
                    quitarLabel={`Quitar ${chip.nombre}`}
                  >
                    {chip.jefe ? `${chip.nombre} · jefe` : chip.nombre}
                  </Chip>
                  {puedeEditarJefe && !chip.jefe && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!jefeIds.includes(chip.id)) onJefe([...jefeIds, chip.id])
                      }}
                      className="text-xs font-medium text-brand-primary hover:underline"
                    >
                      Hacer jefe
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {!puedeAsignarRol && (rolEsAdmin || jefeIds.length > 0) && (
            <p className="text-xs text-neutral-500 dark:text-gray-400">
              Solo un super admin puede cambiar quién es jefe de un área.
            </p>
          )}
          {puedeAsignarRol && !rolEsAdmin && (
            <p className="text-xs text-neutral-500 dark:text-gray-400">
              Para ser jefe de un área, el rol tiene que ser Administrador de área.
            </p>
          )}

          {(puedeEditarMiembro || puedeEditarJefe) && (
            agregando ? (
              <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-zinc-700">
                {disponibles.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-gray-400">No hay más áreas para agregar.</p>
                ) : (
                  <select
                    value={areaNueva}
                    onChange={(event) => setAreaNueva(event.target.value)}
                    aria-label="Área para agregar"
                    className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">Elegí un área</option>
                    {disponibles.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex flex-wrap gap-2">
                  {puedeEditarMiembro && (
                    <button
                      type="button"
                      disabled={!areaNueva}
                      onClick={() => agregar(false)}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-zinc-600"
                    >
                      Como parte del área
                    </button>
                  )}
                  {puedeEditarJefe && (
                    <button
                      type="button"
                      disabled={!areaNueva}
                      onClick={() => agregar(true)}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-zinc-600"
                    >
                      Como jefe
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAgregando(false)
                      setAreaNueva('')
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 dark:text-gray-300"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAgregando(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
              >
                <Plus className="h-4 w-4" />
                Agregar área
              </button>
            )
          )}

          {mostrarMotivo && (
            <div>
              <label htmlFor="motivo-areas" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
                {REASON_REQUIRED_LABEL}
              </label>
              <textarea
                id="motivo-areas"
                value={motivo}
                onChange={(event) => onMotivo(event.target.value)}
                rows={3}
                placeholder="Contá por qué cambian las áreas"
                className="input-brand-focus w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          )}
        </>
      )}
    </SeccionFicha>
  )
}

function armarChips(miembroIds: string[], jefeIds: string[], nombres: Map<string, string>): AreaChip[] {
  const jefes = new Set(jefeIds)
  const ids = new Set([...miembroIds, ...jefeIds])
  return [...ids]
    .map((id) => ({
      id,
      nombre: nombres.get(id) ?? 'Área',
      jefe: jefes.has(id),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
