import { useEffect, useId, useState, type CSSProperties } from 'react'
import toast from 'react-hot-toast'
import type { CategoriaMovimiento } from '../../services/finanzasMovimientosApi'

const GRUPOS_SUGERIDOS = [
  'Gastos bancarios',
  'Impuestos',
  'Financiación',
  'Inversiones',
  'Pagos',
  'Cheques',
  'Cobros',
  'Movimientos internos',
]

const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900'

function opcionesGrupo(categorias: CategoriaMovimiento[]): string[] {
  const set = new Set<string>(GRUPOS_SUGERIDOS)
  for (const categoria of categorias) {
    const grupo = categoria.grupo?.trim()
    if (grupo) set.add(grupo)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

function agruparCategorias(
  categorias: CategoriaMovimiento[],
): Array<{ id: string; nombre: string; items: CategoriaMovimiento[] }> {
  const conGrupo = new Map<string, CategoriaMovimiento[]>()
  const sinGrupo: CategoriaMovimiento[] = []
  for (const categoria of categorias) {
    const grupo = categoria.grupo?.trim()
    if (!grupo) {
      sinGrupo.push(categoria)
      continue
    }
    const lista = conGrupo.get(grupo)
    if (lista) lista.push(categoria)
    else conGrupo.set(grupo, [categoria])
  }
  const grupos = [...conGrupo.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([nombre, items]) => ({ id: nombre, nombre, items }))
  if (sinGrupo.length > 0) grupos.push({ id: '__sin_grupo', nombre: 'Sin grupo', items: sinGrupo })
  return grupos
}

function textoFusion(usos: number, destino: string): string {
  const nombre = `«${destino}»`
  if (usos === 1) {
    return `El movimiento y sus reglas pasan a ${nombre}. Esta categoría se borra.`
  }
  return `Los ${usos.toLocaleString('es-AR')} movimientos y sus reglas pasan a ${nombre}. Esta categoría se borra.`
}

function estiloChip(color: string | null): CSSProperties | undefined {
  if (!color) return undefined
  return { borderColor: `${color}66`, color, backgroundColor: `${color}14` }
}

function useCerrarConEscape(activo: boolean, ocupado: boolean, onClose: () => void) {
  useEffect(() => {
    if (!activo) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !ocupado) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activo, ocupado, onClose])
}

function GrupoCampo(props: {
  categoria: CategoriaMovimiento
  opcionesId: string
  disabled: boolean
  onGuardar: (grupo: string | null) => Promise<void>
}) {
  const inputId = useId()
  const [valor, setValor] = useState(props.categoria.grupo ?? '')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setValor(props.categoria.grupo ?? '')
  }, [props.categoria.grupo, props.categoria.id])

  const dirty = valor.trim() !== (props.categoria.grupo?.trim() ?? '')

  async function guardar() {
    if (!dirty || guardando || props.disabled) return
    setGuardando(true)
    try {
      await props.onGuardar(valor.trim() || null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el grupo')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-2">
      <label htmlFor={inputId} className="text-body-muted block text-xs">
        Grupo
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          className={`${inputClass} min-w-0 flex-1`}
          list={props.opcionesId}
          maxLength={40}
          autoComplete="off"
          placeholder="Sin grupo"
          value={valor}
          disabled={props.disabled || guardando}
          onChange={(event) => setValor(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void guardar()
            }
          }}
        />
        <button
          type="button"
          className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          disabled={!dirty || props.disabled || guardando}
          onClick={() => void guardar()}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export function CategoriasGestionModal(props: {
  open: boolean
  categorias: CategoriaMovimiento[]
  onClose: () => void
  onCrear: (nombre: string, grupo: string | null) => Promise<void>
  onEliminar: (categoria: CategoriaMovimiento) => Promise<void>
  onGuardarGrupo: (categoria: CategoriaMovimiento, grupo: string | null) => Promise<void>
  onFusionar: (origen: CategoriaMovimiento, destinoId: string) => Promise<void>
  onAplicarReglas: () => Promise<void>
}) {
  const tituloId = useId()
  const opcionesId = useId()
  const [nombre, setNombre] = useState('')
  const [grupoNuevo, setGrupoNuevo] = useState('')
  const [creando, setCreando] = useState(false)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [fusionId, setFusionId] = useState<string | null>(null)
  const [destinoId, setDestinoId] = useState('')
  const [fusionando, setFusionando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const ocupado = creando || eliminandoId !== null || fusionando || aplicando
  useCerrarConEscape(props.open, ocupado, props.onClose)

  useEffect(() => {
    if (!props.open) {
      setNombre('')
      setGrupoNuevo('')
      setConfirmandoId(null)
      setFusionId(null)
      setDestinoId('')
    }
  }, [props.open])

  if (!props.open) return null

  const opciones = opcionesGrupo(props.categorias)
  const grupos = agruparCategorias(props.categorias)
  const puedeFusionar = props.categorias.length > 1

  async function crear() {
    const limpio = nombre.trim()
    if (!limpio || ocupado) return
    setCreando(true)
    try {
      await props.onCrear(limpio, grupoNuevo.trim() || null)
      setNombre('')
      setGrupoNuevo('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear la categoría')
    } finally {
      setCreando(false)
    }
  }

  async function eliminar(categoria: CategoriaMovimiento) {
    setEliminandoId(categoria.id)
    try {
      await props.onEliminar(categoria)
      setConfirmandoId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la categoría')
    } finally {
      setEliminandoId(null)
    }
  }

  async function fusionar(origen: CategoriaMovimiento) {
    if (!destinoId) return
    setFusionando(true)
    try {
      await props.onFusionar(origen, destinoId)
      setFusionId(null)
      setDestinoId('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo fusionar la categoría')
    } finally {
      setFusionando(false)
    }
  }

  async function aplicarReglas() {
    setAplicando(true)
    try {
      await props.onAplicarReglas()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron aplicar las reglas')
    } finally {
      setAplicando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-start sm:p-4 sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !ocupado) props.onClose()
      }}
    >
      <div className="surface-card max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700">
        <h2 id={tituloId} className="text-heading text-base font-semibold">
          Categorías de movimientos
        </h2>

        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-left text-sm font-medium leading-snug hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          disabled={ocupado}
          onClick={() => void aplicarReglas()}
        >
          {aplicando ? 'Aplicando reglas…' : 'Aplicar reglas a movimientos sin categoría'}
        </button>

        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void crear()
          }}
        >
          <label className="block text-xs">
            <span className="text-body-muted mb-1 block">Nombre</span>
            <input
              className={inputClass}
              placeholder="Nueva categoría"
              maxLength={40}
              value={nombre}
              disabled={ocupado}
              onChange={(event) => setNombre(event.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="text-body-muted mb-1 block">Grupo (opcional)</span>
            <input
              className={inputClass}
              list={opcionesId}
              maxLength={40}
              autoComplete="off"
              placeholder="Elegí o escribí un grupo"
              value={grupoNuevo}
              disabled={ocupado}
              onChange={(event) => setGrupoNuevo(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            disabled={ocupado || !nombre.trim()}
          >
            {creando ? 'Creando…' : 'Crear'}
          </button>
        </form>

        <datalist id={opcionesId}>
          {opciones.map((grupo) => (
            <option key={grupo} value={grupo} />
          ))}
        </datalist>

        <div className="mt-4 space-y-4 text-sm">
          {props.categorias.length === 0 ? (
            <p className="text-body-muted">Todavía no hay categorías.</p>
          ) : null}
          {grupos.map((grupo) => (
            <section key={grupo.id}>
              <h3 className="text-body-muted text-xs font-semibold">{grupo.nombre}</h3>
              <ul className="mt-1 divide-y divide-neutral-100 dark:divide-zinc-800">
                {grupo.items.map((categoria) => {
                  const destino = props.categorias.find((item) => item.id === destinoId) ?? null
                  const otras = props.categorias.filter((item) => item.id !== categoria.id)
                  return (
                    <li key={categoria.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span
                          className="inline-flex max-w-full items-center rounded-full border border-neutral-200 bg-neutral-50 px-2 py-px text-[11px] font-medium leading-4 text-neutral-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                          style={estiloChip(categoria.color)}
                        >
                          <span className="truncate">{categoria.nombre}</span>
                        </span>
                        <span className="text-body-muted text-xs tabular-nums">
                          {categoria.usos.toLocaleString('es-AR')}{' '}
                          {categoria.usos === 1 ? 'movimiento' : 'movimientos'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-3">
                        {puedeFusionar && fusionId !== categoria.id && confirmandoId !== categoria.id ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-brand-primary hover:underline disabled:opacity-50"
                            disabled={ocupado}
                            onClick={() => {
                              setFusionId(categoria.id)
                              setDestinoId('')
                              setConfirmandoId(null)
                            }}
                          >
                            Fusionar en…
                          </button>
                        ) : null}
                        {confirmandoId !== categoria.id && fusionId !== categoria.id ? (
                          <button
                            type="button"
                            className="text-xs text-neutral-500 hover:text-red-700 disabled:opacity-50 dark:hover:text-red-400"
                            disabled={ocupado}
                            onClick={() => {
                              setConfirmandoId(categoria.id)
                              setFusionId(null)
                              setDestinoId('')
                            }}
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>

                      {fusionId === categoria.id ? (
                        <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                          <label className="block">
                            <span className="text-body-muted mb-1 block">Pasa a</span>
                            <select
                              className={inputClass}
                              value={destinoId}
                              disabled={ocupado}
                              onChange={(event) => setDestinoId(event.target.value)}
                            >
                              <option value="">Elegir categoría</option>
                              {otras.map((otra) => (
                                <option key={otra.id} value={otra.id}>
                                  {otra.grupo?.trim() ? `${otra.nombre} · ${otra.grupo.trim()}` : otra.nombre}
                                </option>
                              ))}
                            </select>
                          </label>
                          {destino ? (
                            <p className="text-heading mt-2">{textoFusion(categoria.usos, destino.nombre)}</p>
                          ) : (
                            <p className="text-body-muted mt-2">Elegí a qué categoría pasan los movimientos.</p>
                          )}
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                              disabled={ocupado}
                              onClick={() => {
                                setFusionId(null)
                                setDestinoId('')
                              }}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className="rounded bg-brand-primary px-2 py-1 font-medium text-white hover:opacity-90 disabled:opacity-60"
                              disabled={ocupado || !destino}
                              onClick={() => void fusionar(categoria)}
                            >
                              {fusionando ? 'Fusionando…' : 'Fusionar'}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {confirmandoId === categoria.id ? (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                          <p>
                            Los movimientos que tenían esta categoría quedan sin categoría, no se borran ni se bloquea
                            nada. Las reglas automáticas que apuntaban a «{categoria.nombre}» también se eliminan.
                          </p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                              disabled={ocupado}
                              onClick={() => setConfirmandoId(null)}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className="rounded bg-red-700 px-2 py-1 font-medium text-white hover:bg-red-800 disabled:opacity-60"
                              disabled={ocupado}
                              onClick={() => void eliminar(categoria)}
                            >
                              {eliminandoId === categoria.id ? 'Eliminando…' : 'Sí, eliminar'}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <GrupoCampo
                        categoria={categoria}
                        opcionesId={opcionesId}
                        disabled={ocupado}
                        onGuardar={(grupoElegido) => props.onGuardarGrupo(categoria, grupoElegido)}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-zinc-800"
            onClick={props.onClose}
            disabled={ocupado}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
