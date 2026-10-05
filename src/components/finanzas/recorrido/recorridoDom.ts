import { rectUtil } from './recorridoLogica'

/** Primer elemento con ese data-tour que esté realmente visible (hay marcas duplicadas celular/escritorio). */
export function buscarElemento(selector: string): HTMLElement | null {
  const candidatos = document.querySelectorAll<HTMLElement>(`[data-tour="${selector}"]`)
  for (const el of candidatos) {
    if (rectUtil(el.getBoundingClientRect())) return el
  }
  return null
}

export function existeElemento(selector: string): boolean {
  return buscarElemento(selector) !== null
}
