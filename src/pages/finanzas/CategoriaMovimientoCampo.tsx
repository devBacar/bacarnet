import { useEffect, useId, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import type { CategoriaMovimiento, MovimientoListItem } from '../../services/finanzasMovimientosApi'

function normalizar(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

function estiloChip(color: string | null | undefined): React.CSSProperties | undefined {
  if (!color) return undefined
  return { borderColor: `${color}66`, color, backgroundColor: `${color}14` }
}

function formatFecha(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

const CHIP_CLASS =
  'inline-flex max-w-[11rem] items-center rounded-full border border-neutral-200 bg-neutral-50 px-2 py-px text-[11px] font-medium leading-4 text-neutral-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'

/** Chip pequeño con el color de la categoría. */
export function CategoriaChip(props: { categoria: CategoriaMovimiento; className?: string }) {
  return (
    <span className={`${CHIP_CLASS} ${props.className ?? ''}`} style={estiloChip(props.categoria.color)}>
      <span className="truncate">{props.categoria.nombre}</span>
    </span>
  )
}

/** Celda compacta: chip con la categoría o botón discreto para categorizar. */
export function CategoriaMovimientoChip(props: {
  categoria: CategoriaMovimiento | null
  nota: string | null
  onClick: () => void
}) {
  const { categoria, nota } = props
  return (
    <div className="flex min-w-0 flex-col items-start">
      {categoria ? (
        <button
          type="button"
          className={`${CHIP_CLASS} cursor-pointer hover:opacity-75`}
          style={estiloChip(categoria.color)}
          title={nota ? `${categoria.nombre} — ${nota}` : categoria.nombre}
          onClick={props.onClick}
        >
          <span className="truncate">{categoria.nombre}</span>
        </button>
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-neutral-300 px-2 py-px text-[11px] leading-4 text-neutral-400 hover:border-neutral-400 hover:text-neutral-700 dark:border-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
          title={nota ? `Sin categoría — ${nota}` : 'Categorizar'}
          onClick={props.onClick}
        >
          <span aria-hidden="true">+</span> Categorizar
        </button>
      )}
      {nota ? (
        <span className="text-body-muted mt-0.5 max-w-[11rem] truncate text-[11px] leading-4" title={nota}>
          {nota}
        </span>
      ) : null}
    </div>
  )
}

/** Combobox "buscar o crear" controlado: no guarda, solo cambia la selección. */
export function CategoriaSelector(props: {
  categorias: CategoriaMovimiento[]
  value: string | null
  disabled?: boolean
  autoFocus?: boolean
  onChange: (categoriaId: string | null) => void
  onCrear: (nombre: string) => Promise<CategoriaMovimiento>
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const actual = props.categorias.find((categoria) => categoria.id === props.value) ?? null
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    if (props.autoFocus) inputRef.current?.focus()
  }, [props.autoFocus])

  const consulta = normalizar(texto)
  const coincidencias = props.categorias.filter((categoria) =>
    consulta ? normalizar(categoria.nombre).includes(consulta) : true,
  )
  const exacta = props.categorias.find((categoria) => normalizar(categoria.nombre) === consulta) ?? null
  const puedeCrear = consulta.length > 0 && !exacta

  function elegir(categoriaId: string | null) {
    props.onChange(categoriaId)
    setTexto('')
    setAbierto(false)
  }

  async function crear() {
    const nombre = texto.trim()
    if (!nombre) return
    setCreando(true)
    try {
      const creada = await props.onCrear(nombre)
      elegir(creada.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear la categoría')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {actual ? (
          <span className={CHIP_CLASS} style={estiloChip(actual.color)}>
            {actual.nombre}
            <button
              type="button"
              className="ml-1 rounded-full px-1 leading-none hover:bg-black/10"
              aria-label="Quitar categoría"
              title="Quitar categoría"
              disabled={props.disabled}
              onClick={() => elegir(null)}
            >
              ×
            </button>
          </span>
        ) : null}
        <input
          ref={inputRef}
          className="min-w-[10rem] flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={actual ? 'Cambiar…' : 'Buscar o crear…'}
          disabled={props.disabled || creando}
          value={texto}
          onFocus={() => setAbierto(true)}
          onChange={(event) => {
            setTexto(event.target.value)
            setAbierto(true)
          }}
          onBlur={() => {
            window.setTimeout(() => setAbierto(false), 150)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && abierto) {
              event.stopPropagation()
              setAbierto(false)
              return
            }
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (exacta) {
              elegir(exacta.id)
              return
            }
            if (puedeCrear) void crear()
          }}
        />
      </div>
      {abierto ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {coincidencias.map((categoria) => (
            <li key={categoria.id}>
              <button
                type="button"
                role="option"
                aria-selected={categoria.id === props.value}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-zinc-800"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => elegir(categoria.id)}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full border border-neutral-300"
                  style={categoria.color ? { backgroundColor: categoria.color, borderColor: categoria.color } : undefined}
                  aria-hidden="true"
                />
                <span className="truncate">{categoria.nombre}</span>
                <span className="text-body-muted ml-auto text-[11px] tabular-nums">
                  {categoria.id === props.value ? 'actual' : categoria.usos > 0 ? categoria.usos : ''}
                </span>
              </button>
            </li>
          ))}
          {puedeCrear ? (
            <li>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left font-medium hover:bg-neutral-100 dark:hover:bg-zinc-800"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void crear()}
              >
                {creando ? 'Creando…' : `Crear «${texto.trim()}»`}
              </button>
            </li>
          ) : null}
          {coincidencias.length === 0 && !puedeCrear ? (
            <li className="text-body-muted px-3 py-1.5">Sin categorías</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

export interface GuardarMovimientoInput {
  categoriaId: string | null
  nota: string | null
  /** Crear regla "misma descripción → esta categoría" y aplicarla a todos los existentes. */
  aplicarATodos: boolean
}

function ModalShell(props: {
  tituloId: string
  saving: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={props.tituloId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !props.saving) props.onClose()
      }}
    >
      {props.children}
    </div>
  )
}

function useCerrarConEscape(activo: boolean, saving: boolean, onClose: () => void) {
  useEffect(() => {
    if (!activo) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activo, saving, onClose])
}

/** Modal liviano para categorizar un movimiento y anotarlo. */
export function CategoriaMovimientoModal(props: {
  movimiento: MovimientoListItem | null
  categorias: CategoriaMovimiento[]
  saving: boolean
  onClose: () => void
  onGuardar: (input: GuardarMovimientoInput) => Promise<void>
  onCrear: (nombre: string) => Promise<CategoriaMovimiento>
}) {
  const { movimiento } = props
  useCerrarConEscape(Boolean(movimiento), props.saving, props.onClose)
  if (!movimiento) return null
  // key por movimiento: el formulario arranca limpio con los valores de esa fila.
  return <CategoriaMovimientoForm key={movimiento.id} {...props} movimiento={movimiento} />
}

function CategoriaMovimientoForm(props: {
  movimiento: MovimientoListItem
  categorias: CategoriaMovimiento[]
  saving: boolean
  onClose: () => void
  onGuardar: (input: GuardarMovimientoInput) => Promise<void>
  onCrear: (nombre: string) => Promise<CategoriaMovimiento>
}) {
  const { movimiento } = props
  const tituloId = useId()
  const [categoriaId, setCategoriaId] = useState<string | null>(movimiento.categoriaId)
  const [nota, setNota] = useState(movimiento.nota ?? '')
  const [aplicarATodos, setAplicarATodos] = useState(false)

  const entrada = movimiento.tipo === 'credito'
  const notaLimpia = nota.trim()
  const cambio = categoriaId !== movimiento.categoriaId || (notaLimpia || null) !== (movimiento.nota ?? null)
  const puedeAplicarATodos = Boolean(categoriaId)
  const puedeGuardar = cambio || (aplicarATodos && puedeAplicarATodos)

  return (
    <ModalShell tituloId={tituloId} saving={props.saving} onClose={props.onClose}>
      <form
        className="surface-card w-full max-w-md rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700"
        onSubmit={(event) => {
          event.preventDefault()
          void props.onGuardar({
            categoriaId,
            nota: notaLimpia || null,
            aplicarATodos: aplicarATodos && puedeAplicarATodos,
          })
        }}
      >
        <h2 id={tituloId} className="text-heading text-base font-semibold">
          Categorizar movimiento
        </h2>
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-body-muted whitespace-nowrap text-xs">{formatFecha(movimiento.fechaProceso)}</span>
            <span
              className={`whitespace-nowrap font-semibold tabular-nums ${entrada ? 'text-emerald-800' : 'text-red-800'}`}
            >
              {entrada ? '' : '−'}
              {formatMoneyCentavos(movimiento.montoCentavos, 'ARS')}
            </span>
          </div>
          <p className="text-heading mt-0.5 break-words font-medium">{movimiento.descripcion}</p>
          {movimiento.contraparte ? (
            <p className="text-body-muted mt-0.5 text-xs">{movimiento.contraparte}</p>
          ) : null}
        </div>

        <label className="mt-4 block text-sm font-medium text-neutral-800 dark:text-gray-200">
          Categoría
          <div className="mt-1.5">
            <CategoriaSelector
              categorias={props.categorias}
              value={categoriaId}
              disabled={props.saving}
              autoFocus
              onChange={setCategoriaId}
              onCrear={props.onCrear}
            />
          </div>
        </label>

        <label
          className={`mt-3 flex items-start gap-2 text-sm ${puedeAplicarATodos ? '' : 'opacity-50'}`}
          title={puedeAplicarATodos ? undefined : 'Elegí una categoría primero'}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={aplicarATodos && puedeAplicarATodos}
            disabled={!puedeAplicarATodos || props.saving}
            onChange={(event) => setAplicarATodos(event.target.checked)}
          />
          <span>
            Aplicar a todos los que digan «{movimiento.descripcion}»
            <span className="text-body-muted block text-xs">
              Categoriza los que ya están y los que entren en próximas sincronizaciones.
            </span>
          </span>
        </label>

        <label className="mt-4 block text-sm font-medium text-neutral-800 dark:text-gray-200">
          Nota <span className="text-body-muted font-normal">(opcional)</span>
          <textarea
            className="mt-1.5 w-full resize-y rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            rows={2}
            maxLength={500}
            placeholder="Detalle para quien lo lea después"
            value={nota}
            disabled={props.saving}
            onChange={(event) => setNota(event.target.value)}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
            onClick={props.onClose}
            disabled={props.saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            disabled={props.saving || !puedeGuardar}
          >
            {props.saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

/** Alta directa y eliminación de categorías. */
export function CategoriasGestionModal(props: {
  open: boolean
  categorias: CategoriaMovimiento[]
  onClose: () => void
  onCrear: (nombre: string) => Promise<CategoriaMovimiento>
  onEliminar: (categoria: CategoriaMovimiento) => Promise<void>
}) {
  const tituloId = useId()
  const [nombre, setNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const ocupado = creando || eliminandoId !== null
  useCerrarConEscape(props.open, ocupado, props.onClose)

  useEffect(() => {
    if (!props.open) {
      setNombre('')
      setConfirmandoId(null)
    }
  }, [props.open])

  if (!props.open) return null

  async function crear() {
    const limpio = nombre.trim()
    if (!limpio) return
    setCreando(true)
    try {
      await props.onCrear(limpio)
      setNombre('')
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

  return (
    <ModalShell tituloId={tituloId} saving={ocupado} onClose={props.onClose}>
      <div className="surface-card w-full max-w-md rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700">
        <h2 id={tituloId} className="text-heading text-base font-semibold">
          Categorías de movimientos
        </h2>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void crear()
          }}
        >
          <input
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            placeholder="Nueva categoría"
            maxLength={40}
            value={nombre}
            disabled={ocupado}
            onChange={(event) => setNombre(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            disabled={ocupado || !nombre.trim()}
          >
            {creando ? 'Creando…' : 'Crear'}
          </button>
        </form>

        <ul className="mt-4 max-h-[50vh] divide-y divide-neutral-100 overflow-auto text-sm dark:divide-zinc-800">
          {props.categorias.length === 0 ? (
            <li className="text-body-muted py-3">Todavía no hay categorías.</li>
          ) : null}
          {props.categorias.map((categoria) => (
            <li key={categoria.id} className="py-2">
              <div className="flex items-center gap-3">
                <CategoriaChip categoria={categoria} />
                <span className="text-body-muted text-xs tabular-nums">
                  {categoria.usos.toLocaleString('es-AR')} {categoria.usos === 1 ? 'movimiento' : 'movimientos'}
                </span>
                {confirmandoId !== categoria.id ? (
                  <button
                    type="button"
                    className="ml-auto text-xs text-neutral-500 hover:text-red-700 disabled:opacity-50"
                    disabled={ocupado}
                    onClick={() => setConfirmandoId(categoria.id)}
                  >
                    Eliminar
                  </button>
                ) : null}
              </div>
              {confirmandoId === categoria.id ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                  <p>
                    Los movimientos que tenían esta categoría quedan sin categoría, no se borran ni se bloquea nada.
                    Las reglas automáticas que apuntaban a «{categoria.nombre}» también se eliminan.
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
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
            onClick={props.onClose}
            disabled={ocupado}
          >
            Cerrar
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
