import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  esCelular,
  posicionGlobo,
  rectUtil,
  scrollDestino,
  type Caja,
  type PosicionGlobo,
} from './recorridoLogica'

const ANCHO_GLOBO = 352

interface RecorridoGloboProps {
  titulo: string
  texto: string
  indice: number
  total: number
  /** data-tour a recortar. Vacío: el globo queda centrado, sin recorte. */
  selector: string | null
  esFinal: boolean
  puedeAnterior: boolean
  puedeSiguiente: boolean
  onAnterior: () => void
  onSiguiente: () => void
  onSalir: () => void
}

export function RecorridoGlobo({
  titulo,
  texto,
  indice,
  total,
  selector,
  esFinal,
  puedeAnterior,
  puedeSiguiente,
  onAnterior,
  onSiguiente,
  onSalir,
}: RecorridoGloboProps) {
  const dialogo = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<PosicionGlobo | null>(null)
  const [objetivo, setObjetivo] = useState<Caja | null>(null)

  const medir = useCallback(() => {
    const nodo = dialogo.current
    const viewport = {
      width: document.documentElement.clientWidth,
      height: window.innerHeight,
    }
    const celular = esCelular(viewport.width)
    const ancho = celular ? Math.max(160, viewport.width - 24) : Math.min(ANCHO_GLOBO, viewport.width - 24)
    if (nodo) nodo.style.width = `${ancho}px`
    const el = selector ? document.querySelector<HTMLElement>(`[data-tour="${selector}"]`) : null
    const rect = el?.getBoundingClientRect()
    const caja = rect && rectUtil(rect) ? inflar(rect, 8, viewport) : null
    const alto = nodo?.offsetHeight ?? 180
    const puesto = posicionGlobo({
      objetivo: caja,
      globo: { width: ancho, height: alto },
      viewport,
      celular,
    })
    setObjetivo(caja)
    setPos(puesto)
  }, [selector])

  useLayoutEffect(() => {
    if (selector) {
      const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`)
      if (el) acercar(el)
    }
    medir()
  }, [medir, selector, titulo, texto])

  useEffect(() => {
    const actualizar = () => medir()
    const bloquear = (event: Event) => {
      if (dialogo.current?.contains(event.target as Node)) return
      event.preventDefault()
    }
    window.addEventListener('resize', actualizar)
    window.addEventListener('scroll', actualizar, true)
    document.addEventListener('wheel', bloquear, { passive: false })
    document.addEventListener('touchmove', bloquear, { passive: false })
    const el = selector ? document.querySelector<HTMLElement>(`[data-tour="${selector}"]`) : null
    const observer = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(actualizar) : null
    if (el && observer) observer.observe(el)
    return () => {
      window.removeEventListener('resize', actualizar)
      window.removeEventListener('scroll', actualizar, true)
      document.removeEventListener('wheel', bloquear)
      document.removeEventListener('touchmove', bloquear)
      observer?.disconnect()
    }
  }, [medir, selector])

  useEffect(() => {
    dialogo.current?.focus()
  }, [titulo, texto])

  return createPortal(
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0" aria-hidden />
      {objetivo ? (
        <Recorte caja={objetivo} />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-neutral-950/55" aria-hidden />
      )}
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recorrido-titulo"
        aria-describedby="recorrido-texto"
        tabIndex={-1}
        onKeyDown={encerrarTab}
        className="absolute max-h-[min(70vh,calc(100dvh-1.5rem))] max-w-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] dark:border-zinc-700 dark:bg-zinc-900"
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 12,
          width: pos?.width ?? ANCHO_GLOBO,
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        <div className="rounded-t-2xl bg-[var(--color-primary-light)] px-4 py-2.5">
          <p id="recorrido-titulo" className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
            {titulo}
          </p>
        </div>
        <div className="px-4 py-3">
          <p id="recorrido-texto" aria-live="polite" className="text-[15px] leading-snug text-neutral-800 dark:text-gray-100">
            {texto}
          </p>
          {total > 1 ? (
            <div className="mt-3 flex flex-wrap gap-1" aria-hidden>
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full ${
                    i === indice
                      ? 'w-3 bg-[var(--color-primary)]'
                      : i < indice
                        ? 'w-1.5 bg-[var(--color-primary)]'
                        : 'w-1.5 bg-neutral-300 dark:bg-zinc-600'
                  }`}
                />
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAnterior}
              disabled={!puedeAnterior}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-gray-100 dark:hover:bg-zinc-800"
            >
              ‹ Anterior
            </button>
            {puedeSiguiente && !esFinal ? (
              <button
                type="button"
                onClick={onSiguiente}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-3 text-sm font-medium text-white transition hover:opacity-90"
              >
                Siguiente ›
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSalir}
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-neutral-600 underline-offset-2 hover:underline dark:text-gray-300"
            >
              Salir del recorrido
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Recorte({ caja }: { caja: Caja }) {
  const fondo = 'pointer-events-none absolute bg-neutral-950/55'
  const derecha = caja.left + caja.width
  const abajo = caja.top + caja.height
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className={`${fondo} right-0 left-0 top-0`} style={{ height: Math.max(0, caja.top) }} />
      <div className={`${fondo} left-0`} style={{ top: caja.top, height: caja.height, width: Math.max(0, caja.left) }} />
      <div className={fondo} style={{ top: caja.top, left: derecha, height: caja.height, right: 0 }} />
      <div className={`${fondo} right-0 bottom-0 left-0`} style={{ top: abajo }} />
      <div
        className="absolute rounded-xl"
        style={{
          top: caja.top,
          left: caja.left,
          width: caja.width,
          height: caja.height,
          boxShadow: '0 0 0 3px #f2b705, 0 0 16px 2px rgb(242 183 5 / 0.5)',
        }}
      />
    </div>
  )
}

function inflar(rect: DOMRect, margen: number, viewport: { width: number; height: number }): Caja {
  const top = Math.max(8, rect.top - margen)
  const left = Math.max(8, rect.left - margen)
  const right = Math.min(viewport.width - 8, rect.right + margen)
  const bottom = Math.min(viewport.height - 8, rect.bottom + margen)
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

function acercar(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const celular = esCelular(document.documentElement.clientWidth)
  const destino = scrollDestino({
    rectTop: rect.top,
    rectHeight: rect.height,
    viewportHeight: window.innerHeight,
    scrollY: window.scrollY,
    celular,
  })
  if (destino != null) window.scrollTo({ top: destino, behavior: 'smooth' })

  let padre = el.parentElement
  while (padre && padre !== document.body) {
    const estilo = getComputedStyle(padre)
    if (estilo.overflowX === 'auto' || estilo.overflowX === 'scroll') {
      const caja = padre.getBoundingClientRect()
      const hijo = el.getBoundingClientRect()
      if (hijo.left < caja.left + 8 || hijo.right > caja.right - 8) {
        const delta = hijo.left < caja.left ? hijo.left - caja.left - 12 : hijo.right - caja.right + 12
        padre.scrollBy({ left: delta, behavior: 'smooth' })
      }
      break
    }
    padre = padre.parentElement
  }
}

function encerrarTab(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Tab') return
  const root = event.currentTarget
  const focos = [...root.querySelectorAll<HTMLElement>('button:not(:disabled)')]
  if (focos.length === 0) return
  const primero = focos[0]
  const ultimo = focos[focos.length - 1]
  if (!primero || !ultimo) return
  if (event.shiftKey && document.activeElement === primero) {
    event.preventDefault()
    ultimo.focus()
  } else if (!event.shiftKey && document.activeElement === ultimo) {
    event.preventDefault()
    primero.focus()
  }
}
