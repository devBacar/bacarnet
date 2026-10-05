import { useEffect, useId, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { datosContraparte } from '../../components/finanzas/contraparteTexto'
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
  onClick?: () => void
  tour?: string
}) {
  const { categoria, nota } = props
  return (
    <div className="flex min-w-0 flex-col items-start">
      {categoria ? (
        props.onClick ? (
          <button
            type="button"
            data-tour={props.tour}
            className={`${CHIP_CLASS} cursor-pointer hover:opacity-75`}
            style={estiloChip(categoria.color)}
            title={nota ? `${categoria.nombre} — ${nota}` : categoria.nombre}
            onClick={props.onClick}
          >
            <span className="truncate">{categoria.nombre}</span>
          </button>
        ) : (
          <CategoriaChip categoria={categoria} />
        )
      ) : props.onClick ? (
        <button
          type="button"
          data-tour={props.tour}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-neutral-300 px-2 py-px text-[11px] leading-4 text-neutral-400 hover:border-neutral-400 hover:text-neutral-700 dark:border-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
          title={nota ? `Sin categoría — ${nota}` : 'Categorizar'}
          onClick={props.onClick}
        >
          <span aria-hidden="true">+</span> Categorizar
        </button>
      ) : (
        <span className="text-[11px] text-neutral-400 dark:text-zinc-500">Sin categoría</span>
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
  /** Solo si la persona cambió el nombre o el CUIT. Queda cargado a mano. */
  contraparte?: { nombre: string | null; cuit: string | null }
}

function digitosCuit(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
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
  const inicial = datosContraparte(movimiento.contraparte)
  const cuitInicial = inicial.cuit || digitosCuit(movimiento.customerCuit)
  const [categoriaId, setCategoriaId] = useState<string | null>(movimiento.categoriaId)
  const [nota, setNota] = useState(movimiento.nota ?? '')
  const [contraparteNombre, setContraparteNombre] = useState(inicial.nombre ?? '')
  const [contraparteCuit, setContraparteCuit] = useState(cuitInicial)
  const [aplicarATodos, setAplicarATodos] = useState(false)

  const entrada = movimiento.tipo === 'credito'
  const notaLimpia = nota.trim()
  const nombreLimpio = contraparteNombre.trim().replace(/\s+/g, ' ')
  const cuitDigitos = digitosCuit(contraparteCuit)
  const cambio = categoriaId !== movimiento.categoriaId || (notaLimpia || null) !== (movimiento.nota ?? null)
  const contraparteCambio = nombreLimpio !== (inicial.nombre ?? '') || cuitDigitos !== cuitInicial
  const puedeAplicarATodos = Boolean(categoriaId)
  const puedeGuardar = cambio || contraparteCambio || (aplicarATodos && puedeAplicarATodos)

  return (
    <ModalShell tituloId={tituloId} saving={props.saving} onClose={props.onClose}>
      <form
        data-tour="movimientos-categoria-ventana"
        className="surface-card w-full max-w-md rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700"
        onSubmit={(event) => {
          event.preventDefault()
          if (contraparteCambio && cuitDigitos && cuitDigitos.length !== 11) {
            toast.error('El CUIT tiene que tener 11 dígitos')
            return
          }
          void props.onGuardar({
            categoriaId,
            nota: notaLimpia || null,
            aplicarATodos: aplicarATodos && puedeAplicarATodos,
            ...(contraparteCambio
              ? { contraparte: { nombre: nombreLimpio || null, cuit: cuitDigitos || null } }
              : {}),
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
        </div>

        <label className="mt-4 block text-sm font-medium text-neutral-800 dark:text-gray-200">
          ¿De quién / a quién?
          <input
            className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            maxLength={120}
            placeholder="Nombre de la empresa o la persona"
            autoFocus={!inicial.nombre}
            value={contraparteNombre}
            disabled={props.saving}
            onChange={(event) => setContraparteNombre(event.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-neutral-800 dark:text-gray-200">
          CUIT <span className="text-body-muted font-normal">(opcional)</span>
          <input
            className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            inputMode="numeric"
            maxLength={13}
            placeholder="11 dígitos, si lo tenés"
            value={contraparteCuit}
            disabled={props.saving}
            onChange={(event) => setContraparteCuit(event.target.value)}
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-neutral-800 dark:text-gray-200" data-tour="movimientos-categoria-selector">
          Categoría
          <div className="mt-1.5">
            <CategoriaSelector
              categorias={props.categorias}
              value={categoriaId}
              disabled={props.saving}
              autoFocus={Boolean(inicial.nombre)}
              onChange={setCategoriaId}
              onCrear={props.onCrear}
            />
          </div>
        </label>

        <label
          data-tour="movimientos-categoria-regla"
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

        <label className="mt-4 block text-sm font-medium text-neutral-800 dark:text-gray-200" data-tour="movimientos-categoria-nota">
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
            data-tour="movimientos-categoria-guardar"
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
