import { useEffect, useId, useState } from 'react'
import type { CategoriaMovimiento } from '../../services/finanzasMovimientosApi'

function normalizar(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

export function CategoriaMovimientoCampo(props: {
  categorias: CategoriaMovimiento[]
  categoriaId: string | null
  disabled?: boolean
  onAsignar: (categoriaId: string | null) => Promise<void>
  onCrear: (nombre: string) => Promise<CategoriaMovimiento>
}) {
  const listId = useId()
  const actual = props.categorias.find((categoria) => categoria.id === props.categoriaId) ?? null
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(actual?.nombre ?? '')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) setTexto(actual?.nombre ?? '')
  }, [abierto, actual?.nombre, props.categoriaId])

  const consulta = normalizar(texto)
  const coincidencias = props.categorias.filter((categoria) =>
    consulta ? normalizar(categoria.nombre).includes(consulta) : true,
  )
  const exacta = props.categorias.find((categoria) => normalizar(categoria.nombre) === consulta) ?? null
  const puedeCrear = consulta.length > 0 && !exacta

  async function ejecutar(accion: () => Promise<void>) {
    setGuardando(true)
    try {
      await accion()
      setAbierto(false)
    } catch {
      setTexto(actual?.nombre ?? '')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="relative min-w-[11rem]">
      <input
        className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
        style={actual?.color ? { borderColor: actual.color, color: actual.color } : undefined}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Buscar o crear"
        disabled={props.disabled || guardando}
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
          if (event.key === 'Escape') {
            setAbierto(false)
            setTexto(actual?.nombre ?? '')
          }
          if (event.key !== 'Enter') return
          event.preventDefault()
          if (exacta) {
            void ejecutar(() => props.onAsignar(exacta.id))
            return
          }
          if (puedeCrear) void ejecutar(async () => {
            const creada = await props.onCrear(texto.trim())
            await props.onAsignar(creada.id)
          })
        }}
      />
      {abierto ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border border-neutral-200 bg-white py-1 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {props.categoriaId ? (
            <li>
              <button
                type="button"
                className="block w-full px-2 py-1 text-left text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void ejecutar(() => props.onAsignar(null))}
              >
                Quitar categoría
              </button>
            </li>
          ) : null}
          {coincidencias.map((categoria) => (
            <li key={categoria.id}>
              <button
                type="button"
                role="option"
                aria-selected={categoria.id === props.categoriaId}
                className="block w-full px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-zinc-800"
                style={categoria.color ? { color: categoria.color } : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void ejecutar(() => props.onAsignar(categoria.id))}
              >
                {categoria.nombre}
              </button>
            </li>
          ))}
          {puedeCrear ? (
            <li>
              <button
                type="button"
                className="block w-full px-2 py-1 text-left font-medium hover:bg-neutral-100 dark:hover:bg-zinc-800"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  void ejecutar(async () => {
                    const creada = await props.onCrear(texto.trim())
                    await props.onAsignar(creada.id)
                  })
                }
              >
                Crear «{texto.trim()}»
              </button>
            </li>
          ) : null}
          {coincidencias.length === 0 && !puedeCrear ? (
            <li className="text-body-muted px-2 py-1">Sin categorías</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

export function NotaMovimientoCampo(props: {
  nota: string | null
  disabled?: boolean
  onGuardar: (nota: string | null) => Promise<void>
}) {
  const [texto, setTexto] = useState(props.nota ?? '')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setTexto(props.nota ?? '')
  }, [props.nota])

  return (
    <input
      className="w-full min-w-[8rem] rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      placeholder="Nota"
      disabled={props.disabled || guardando}
      value={texto}
      onChange={(event) => setTexto(event.target.value)}
      onBlur={() => {
        const siguiente = texto.trim()
        const actual = props.nota ?? ''
        if (siguiente === actual) return
        setGuardando(true)
        void props
          .onGuardar(siguiente || null)
          .catch(() => setTexto(props.nota ?? ''))
          .finally(() => setGuardando(false))
      }}
    />
  )
}
