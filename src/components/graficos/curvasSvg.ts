/**
 * Primitivas SVG para gráficos de curva suave ("en S"), compartidas entre tableros (Ventas, RRHH).
 * Sin librería de gráficos: path Bezier cúbico con el punto de control a mitad de camino horizontal
 * entre cada par de puntos consecutivos — la técnica estándar para una curva monótona suave.
 */

export interface PuntoCurva {
  x: number
  y: number
}

/** Tramo de curva entre cada par de puntos consecutivos. No incluye el "M" inicial. */
export function segmentosCurva(puntos: PuntoCurva[]): string {
  let d = ''
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i]
    const p1 = puntos[i + 1]
    const mx = (p0.x + p1.x) / 2
    d += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`
  }
  return d
}

/** Path de una línea suave simple (para un gráfico de una sola serie). */
export function pathLinea(puntos: PuntoCurva[]): string {
  if (puntos.length === 0) return ''
  return `M ${puntos[0].x} ${puntos[0].y}${segmentosCurva(puntos)}`
}

/** Path de área bajo una curva, cerrado contra `baseY` (para el relleno degradado debajo de la línea). */
export function pathArea(puntos: PuntoCurva[], baseY: number): string {
  if (puntos.length === 0) return ''
  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]
  return `M ${primero.x} ${baseY} L ${primero.x} ${primero.y}${segmentosCurva(puntos)} L ${ultimo.x} ${baseY} Z`
}

/** Banda apilada: curva superior suave + curva inferior suave (el límite con la banda de abajo), cerrada. */
export function pathBanda(puntosArriba: PuntoCurva[], puntosAbajoInvertidos: PuntoCurva[]): string {
  if (puntosArriba.length === 0) return ''
  const primero = puntosArriba[0]
  const inicioAbajo = puntosAbajoInvertidos[0]
  return `M ${primero.x} ${primero.y}${segmentosCurva(puntosArriba)} L ${inicioAbajo.x} ${inicioAbajo.y}${segmentosCurva(puntosAbajoInvertidos)} Z`
}

/** Texto alineado al primer/último punto en vez de centrado, para que nunca se corte contra el borde del SVG. */
export function anclaDe(i: number, n: number): 'start' | 'middle' | 'end' {
  if (n <= 1) return 'middle'
  if (i === 0) return 'start'
  if (i === n - 1) return 'end'
  return 'middle'
}
