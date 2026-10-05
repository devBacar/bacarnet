import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { buscarElemento } from './recorridoDom'
import {
  esCelular,
  posicionGlobo,
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
  /** Aviso ámbar: la guía pide un permiso que la persona no tiene. */
  aviso?: string | null
  /** Guías: la persona tiene que poder tocar la pantalla; el fondo oscuro no bloquea. */
  dejarPasar?: boolean
  /** Paso "tocar": esperamos a que la persona lo haga. */
  esperando?: boolean
  /** Pasaron ~8 s sin que aparezca lo esperado: ofrecer seguir solo explicando. */
  ofrecerSalida?: boolean
  /** No robar el foco (la persona está escribiendo en un campo). */
  sinFoco?: boolean
  puedeAnterior: boolean
  puedeSiguiente: boolean
  textoSalir?: string
  onAnterior: () => void
  onSiguiente: () => void
  onVerComoSigue?: () => void
  onSalir: () => void
}

export function RecorridoGlobo({
  titulo,
  texto,
  indice,
  total,
  selector,
  esFinal,
  aviso = null,
  dejarPasar = false,
  esperando = false,
  ofrecerSalida = false,
  sinFoco = false,
  puedeAnterior,
  puedeSiguiente,
  textoSalir = 'Salir del recorrido',
  onAnterior,
  onSiguiente,
  onVerComoSigue,
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
    const el = selector ? buscarElemento(selector) : null
    const rect = el?.getBoundingClientRect()
    const caja = rect ? inflar(rect, 8, viewport) : null
    const alto = nodo?.offsetHeight ?? 180
    const puesto = posicionGlobo({
      objetivo: caja,
      globo: { width: ancho, height: alto },
      viewport,
      celular,
    })
    setObjetivo((previo) => (mismaCaja(previo, caja) ? previo : caja))
    setPos((previo) => (mismaPosicion(previo, puesto) ? previo : puesto))
  }, [selector])

  useLayoutEffect(() => {
    if (selector) {
      const el = buscarElemento(selector)
      if (el) acercar(el)
    }
    medir()
  }, [medir, selector, titulo, texto, aviso, esperando, ofrecerSalida])

  useEffect(() => {
    const actualizar = () => medir()
    const bloquear = (event: Event) => {
      if (dialogo.current?.contains(event.target as Node)) return
      event.preventDefault()
    }
    window.addEventListener('resize', actualizar)
    window.addEventListener('scroll', actualizar, true)
    if (!dejarPasar) {
      document.addEventListener('wheel', bloquear, { passive: false })
      document.addEventListener('touchmove', bloquear, { passive: false })
    }
    const el = selector ? buscarElemento(selector) : null
    const observer = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(actualizar) : null
    if (el && observer) observer.observe(el)
    // Dentro de una ventana el contenido puede moverse sin disparar scroll/resize: remedimos de a ratos.
    const pulso = dejarPasar ? window.setInterval(actualizar, 250) : 0
    return () => {
      window.removeEventListener('resize', actualizar)
      window.removeEventListener('scroll', actualizar, true)
      document.removeEventListener('wheel', bloquear)
      document.removeEventListener('touchmove', bloquear)
      observer?.disconnect()
      if (pulso) window.clearInterval(pulso)
    }
  }, [medir, selector, dejarPasar])

  useEffect(() => {
    if (sinFoco) return
    dialogo.current?.focus()
  }, [titulo, texto, sinFoco])

  const fondo = dejarPasar ? 'bg-neutral-950/40' : 'bg-neutral-950/55'

  return createPortal(
    <div className={`fixed inset-0 z-[110] ${dejarPasar ? 'pointer-events-none' : ''}`}>
      {!dejarPasar ? <div className="absolute inset-0" aria-hidden /> : null}
      {objetivo ? (
        <Recorte caja={objetivo} fondo={fondo} />
      ) : (
        <div className={`pointer-events-none absolute inset-0 ${fondo}`} aria-hidden />
      )}
      <div
        ref={dialogo}
        role="dialog"
        aria-modal={!dejarPasar}
        aria-labelledby="recorrido-titulo"
        aria-describedby="recorrido-texto"
        tabIndex={-1}
        onKeyDown={dejarPasar ? undefined : encerrarTab}
        className="pointer-events-auto absolute max-h-[min(70vh,calc(100dvh-1.5rem))] max-w-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] dark:border-zinc-700 dark:bg-zinc-900"
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
          {aviso && !esFinal ? (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs leading-snug text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              {aviso}
            </p>
          ) : null}
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
            {puedeSiguiente && !esFinal && esperando ? (
              <button
                type="button"
                disabled
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-3 text-sm font-medium text-white opacity-50"
              >
                Hacelo vos y sigo
              </button>
            ) : null}
            {puedeSiguiente && !esFinal && !esperando ? (
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
              {textoSalir}
            </button>
          </div>
          {esperando && ofrecerSalida && onVerComoSigue ? (
            <button
              type="button"
              onClick={onVerComoSigue}
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
            >
              No lo encuentro: ver cómo sigue
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Recorte({ caja, fondo }: { caja: Caja; fondo: string }) {
  const panel = `pointer-events-none absolute ${fondo}`
  const derecha = caja.left + caja.width
  const abajo = caja.top + caja.height
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className={`${panel} right-0 left-0 top-0`} style={{ height: Math.max(0, caja.top) }} />
      <div className={`${panel} left-0`} style={{ top: caja.top, height: caja.height, width: Math.max(0, caja.left) }} />
      <div className={panel} style={{ top: caja.top, left: derecha, height: caja.height, right: 0 }} />
      <div className={`${panel} right-0 bottom-0 left-0`} style={{ top: abajo }} />
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

function mismaCaja(a: Caja | null, b: Caja | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

function mismaPosicion(a: PosicionGlobo | null, b: PosicionGlobo): boolean {
  if (!a) return false
  return a.top === b.top && a.left === b.left && a.width === b.width && a.lado === b.lado
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

function contenedorConScroll(el: HTMLElement): HTMLElement | null {
  let padre = el.parentElement
  while (padre && padre !== document.body) {
    const estilo = getComputedStyle(padre)
    if ((estilo.overflowY === 'auto' || estilo.overflowY === 'scroll') && padre.scrollHeight > padre.clientHeight + 1) {
      return padre
    }
    padre = padre.parentElement
  }
  return null
}

function acercar(el: HTMLElement) {
  const celular = esCelular(document.documentElement.clientWidth)
  const contenedor = contenedorConScroll(el)
  if (contenedor) {
    // Dentro de una ventana: la movemos a ella, no a la página.
    el.scrollIntoView({ block: celular ? 'start' : 'center', behavior: 'smooth' })
  } else {
    const rect = el.getBoundingClientRect()
    const destino = scrollDestino({
      rectTop: rect.top,
      rectHeight: rect.height,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
      celular,
    })
    if (destino != null) window.scrollTo({ top: destino, behavior: 'smooth' })
  }

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
