import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { DetalleCajaOpcion } from '../../../../services/finanzasCajaDiaApi'

const DETALLE_MAX = 40

function normalizar(raw: string): string | null {
  const texto = raw.trim().toLocaleLowerCase('es').replace(/\s+/g, ' ')
  if (!texto || texto.length > DETALLE_MAX || texto.includes('/')) return null
  if (!/[0-9a-záéíóúüñ]/i.test(texto)) return null
  return texto
}

export function SelectorDetalle({
  detalles,
  origen,
  guardando,
  onCerrar,
  onElegir,
}: {
  detalles: DetalleCajaOpcion[]
  origen: 'manual' | 'sugerido'
  guardando: boolean
  onCerrar: () => void
  onElegir: (texto: string | null, aplicarAlMismoTexto: boolean) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [aplicar, setAplicar] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const nuevo = normalizar(busqueda)
  const needle = busqueda.trim().toLocaleLowerCase('es')

  const visibles = useMemo(
    () => (needle ? detalles.filter((item) => item.texto.includes(needle)) : detalles),
    [detalles, needle],
  )
  const yaExiste = nuevo != null && detalles.some((item) => item.texto === nuevo)

  useEffect(() => {
    const cerrar = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onCerrar()
    }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [onCerrar])

  const elegir = (texto: string | null) => {
    if (guardando) return
    onElegir(texto, aplicar)
  }

  return (
    <div
      ref={panel}
      className="absolute inset-x-0 z-30 mt-1 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <label htmlFor={inputId} className="sr-only">
        Buscar detalle
      </label>
      <input
        id={inputId}
        autoFocus
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCerrar()
          if (event.key === 'Enter' && nuevo) {
            event.preventDefault()
            elegir(nuevo)
          }
        }}
        placeholder="Buscar o escribir"
        className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-neutral-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-100"
      />
      <ul className="mt-1 max-h-40 overflow-y-auto">
        {visibles.map((item) => (
          <li key={item.texto}>
            <button
              type="button"
              disabled={guardando}
              onClick={() => elegir(item.texto)}
              className="flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-zinc-800"
            >
              <span className="min-w-0 truncate">{item.texto}</span>
              {item.veces > 0 ? <span className="text-body-muted shrink-0 text-xs">{item.veces}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {nuevo && !yaExiste ? (
        <button
          type="button"
          disabled={guardando}
          onClick={() => elegir(nuevo)}
          className="mt-1 w-full truncate rounded px-1.5 py-1 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 dark:text-gray-100 dark:hover:bg-zinc-800"
        >
          Agregar nueva: {nuevo}
        </button>
      ) : null}
      {origen === 'manual' ? (
        <button
          type="button"
          disabled={guardando}
          onClick={() => elegir(null)}
          className="text-body-muted mt-1 w-full rounded px-1.5 py-1 text-left text-xs hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-zinc-800"
        >
          Volver a la sugerida
        </button>
      ) : null}
      <label className="mt-1 flex items-start gap-2 px-1.5 py-1 text-xs text-neutral-700 dark:text-gray-300">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={aplicar}
          onChange={(event) => setAplicar(event.target.checked)}
        />
        <span>Aplicar a todos los de hoy con el mismo texto del banco</span>
      </label>
    </div>
  )
}
