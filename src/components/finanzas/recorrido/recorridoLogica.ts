import type { PermisosFinanzasEfectivos } from '../../../services/userService'
import type { PasoRecorrido } from './pasosRecorrido'

export type ModoRecorrido = 'completo' | 'pantalla'

export interface Caja {
  top: number
  left: number
  width: number
  height: number
}

export type LadoGlobo = 'arriba' | 'abajo' | 'izquierda' | 'derecha' | 'centro' | 'abajo-ancho'

export interface PosicionGlobo {
  top: number
  left: number
  width: number
  lado: LadoGlobo
}

const MARGEN = 12
const SEPARACION = 14

export function esCelular(ancho: number): boolean {
  return ancho < 768
}

export function claveVisto(uid: string): string {
  return `bacarnet.recorridoFinanzas.visto.${uid}`
}

export function estaVisto(leer: (clave: string) => string | null, uid: string): boolean {
  if (!uid) return true
  try {
    return leer(claveVisto(uid)) === '1'
  } catch {
    return true
  }
}

export function marcarVisto(guardar: (clave: string, valor: string) => void, uid: string): void {
  if (!uid) return
  try {
    guardar(claveVisto(uid), '1')
  } catch {
    // el navegador puede bloquear el almacenamiento
  }
}

export function pathnameDeRuta(ruta: string): string {
  const corte = ruta.indexOf('?')
  return corte === -1 ? ruta : ruta.slice(0, corte)
}

export function ubicacionCoincide(ruta: string, pathname: string, search: string): boolean {
  const corte = ruta.indexOf('?')
  const path = corte === -1 ? ruta : ruta.slice(0, corte)
  const query = corte === -1 ? '' : ruta.slice(corte + 1)
  if (path !== pathname) return false
  const esperada = new URLSearchParams(query)
  const actual = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const clavesEsperadas = [...esperada.keys()]
  if (clavesEsperadas.length !== [...actual.keys()].length) return false
  return clavesEsperadas.every((clave) => actual.get(clave) === esperada.get(clave))
}

/** Recorrido completo, o solo los pasos de la pantalla actual. Sin ver el módulo, queda Cajas. */
export function pasosDelRecorrido(
  pasos: readonly PasoRecorrido[],
  opciones: { modo: ModoRecorrido; pathname: string; puedeVerResto: boolean },
): PasoRecorrido[] {
  const accesibles = opciones.puedeVerResto
    ? [...pasos]
    : pasos.filter((paso) => pathnameDeRuta(paso.ruta) === '/finanzas/cajas')
  if (opciones.modo === 'pantalla') {
    return accesibles.filter((paso) => pathnameDeRuta(paso.ruta) === opciones.pathname)
  }
  return accesibles
}

export function textoSinPermiso(etiqueta: string): string {
  return `Esto lo hace quien tiene permiso de ${etiqueta}.`
}

/** Si no tiene el permiso, no se señala el botón: se explica quién hace esa tarea. */
export function presentarPaso(
  paso: PasoRecorrido,
  permisos: PermisosFinanzasEfectivos,
): { texto: string; señalar: boolean } {
  if (paso.permiso && paso.etiquetaPermiso && !permisos[paso.permiso]) {
    return { texto: textoSinPermiso(paso.etiquetaPermiso), señalar: false }
  }
  return { texto: paso.texto, señalar: true }
}

export type MovimientoPaso = { tipo: 'paso'; indice: number } | { tipo: 'final' } | { tipo: 'igual' }

export function siguientePaso(indice: number, total: number, enFinal: boolean): MovimientoPaso {
  if (enFinal || total <= 0) return { tipo: 'igual' }
  if (indice >= total - 1) return { tipo: 'final' }
  return { tipo: 'paso', indice: indice + 1 }
}

export function anteriorPaso(indice: number, enFinal: boolean, total: number): MovimientoPaso {
  if (total <= 0) return { tipo: 'igual' }
  if (enFinal) return { tipo: 'paso', indice: total - 1 }
  if (indice <= 0) return { tipo: 'igual' }
  return { tipo: 'paso', indice: indice - 1 }
}

export function rectUtil(rect: { width: number; height: number }): boolean {
  return rect.width > 1 && rect.height > 1
}

/** A dónde scrollear en vertical para dejar el elemento a la vista, arriba del globo en el celular. */
export function scrollDestino(input: {
  rectTop: number
  rectHeight: number
  viewportHeight: number
  scrollY: number
  celular: boolean
}): number | null {
  const limiteSuperior = 72
  const reservaAbajo = input.celular ? input.viewportHeight * 0.42 : 24
  const limiteInferior = input.viewportHeight - reservaAbajo
  const rectBottom = input.rectTop + input.rectHeight
  if (input.rectTop >= limiteSuperior && rectBottom <= limiteInferior) return null
  const centro = input.celular ? input.viewportHeight * 0.3 : input.viewportHeight / 2
  const delta = input.rectTop + input.rectHeight / 2 - centro
  const destino = Math.max(0, input.scrollY + delta)
  if (Math.abs(destino - input.scrollY) < 4) return null
  return destino
}

export function posicionGlobo(input: {
  objetivo: Caja | null
  globo: { width: number; height: number }
  viewport: { width: number; height: number }
  celular: boolean
}): PosicionGlobo {
  const { objetivo, globo, viewport, celular } = input
  const anchoTope = Math.max(160, viewport.width - MARGEN * 2)
  const width = Math.min(globo.width, anchoTope)

  if (celular) {
    const top = Math.max(MARGEN, viewport.height - globo.height - MARGEN)
    return { top, left: MARGEN, width: anchoTope, lado: 'abajo-ancho' }
  }

  if (!objetivo) {
    return {
      top: Math.max(MARGEN, (viewport.height - globo.height) / 2),
      left: Math.max(MARGEN, (viewport.width - width) / 2),
      width,
      lado: 'centro',
    }
  }

  const candidatos = ladosEnOrden(objetivo, globo.height, width, viewport)
  for (const candidato of candidatos) {
    if (!solapa(candidato, width, globo.height, objetivo)) return { ...candidato, width }
  }

  const mejor = [...candidatos].sort(
    (a, b) => espacioLibre(b.lado, objetivo, viewport) - espacioLibre(a.lado, objetivo, viewport),
  )[0]
  const respaldo = mejor ?? {
    lado: 'centro' as const,
    top: Math.max(MARGEN, (viewport.height - globo.height) / 2),
    left: Math.max(MARGEN, (viewport.width - width) / 2),
  }
  const fijo = clamp(respaldo, width, globo.height, viewport)
  return { top: fijo.top, left: fijo.left, width, lado: respaldo.lado }
}

function ladosEnOrden(
  objetivo: Caja,
  alto: number,
  ancho: number,
  viewport: { width: number; height: number },
): Array<{ lado: LadoGlobo; top: number; left: number }> {
  const orden: LadoGlobo[] = ['abajo', 'arriba', 'derecha', 'izquierda']
  const puestos: Array<{ lado: LadoGlobo; top: number; left: number }> = []
  for (const lado of orden) {
    const puesto = ponerDeLado(lado, objetivo, alto, ancho, viewport)
    if (puesto) puestos.push(puesto)
  }
  return puestos
}

function ponerDeLado(
  lado: LadoGlobo,
  objetivo: Caja,
  alto: number,
  ancho: number,
  viewport: { width: number; height: number },
): { lado: LadoGlobo; top: number; left: number } | null {
  const centroX = objetivo.left + objetivo.width / 2 - ancho / 2
  const centroY = objetivo.top + objetivo.height / 2 - alto / 2
  if (lado === 'abajo') {
    const top = objetivo.top + objetivo.height + SEPARACION
    if (top + alto > viewport.height - MARGEN) return null
    return { lado, top, left: limitar(centroX, MARGEN, viewport.width - ancho - MARGEN) }
  }
  if (lado === 'arriba') {
    const top = objetivo.top - SEPARACION - alto
    if (top < MARGEN) return null
    return { lado, top, left: limitar(centroX, MARGEN, viewport.width - ancho - MARGEN) }
  }
  if (lado === 'derecha') {
    const left = objetivo.left + objetivo.width + SEPARACION
    if (left + ancho > viewport.width - MARGEN) return null
    return { lado, top: limitar(centroY, MARGEN, viewport.height - alto - MARGEN), left }
  }
  if (lado === 'izquierda') {
    const left = objetivo.left - SEPARACION - ancho
    if (left < MARGEN) return null
    return { lado, top: limitar(centroY, MARGEN, viewport.height - alto - MARGEN), left }
  }
  return null
}

function solapa(
  puesto: { top: number; left: number },
  ancho: number,
  alto: number,
  objetivo: Caja,
): boolean {
  const derecha = puesto.left + ancho
  const abajo = puesto.top + alto
  const objetivoDerecha = objetivo.left + objetivo.width
  const objetivoAbajo = objetivo.top + objetivo.height
  return puesto.left < objetivoDerecha && derecha > objetivo.left && puesto.top < objetivoAbajo && abajo > objetivo.top
}

function espacioLibre(lado: LadoGlobo, objetivo: Caja, viewport: { width: number; height: number }): number {
  if (lado === 'abajo') return viewport.height - (objetivo.top + objetivo.height)
  if (lado === 'arriba') return objetivo.top
  if (lado === 'derecha') return viewport.width - (objetivo.left + objetivo.width)
  if (lado === 'izquierda') return objetivo.left
  return 0
}

function clamp(
  puesto: { top: number; left: number },
  ancho: number,
  alto: number,
  viewport: { width: number; height: number },
): { top: number; left: number } {
  return {
    top: limitar(puesto.top, MARGEN, Math.max(MARGEN, viewport.height - alto - MARGEN)),
    left: limitar(puesto.left, MARGEN, Math.max(MARGEN, viewport.width - ancho - MARGEN)),
  }
}

function limitar(valor: number, minimo: number, maximo: number): number {
  if (maximo < minimo) return minimo
  return Math.min(Math.max(valor, minimo), maximo)
}
