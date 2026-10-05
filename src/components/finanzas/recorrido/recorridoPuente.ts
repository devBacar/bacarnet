import { useSyncExternalStore } from 'react'

type Abrir = () => void

let abrirActual: Abrir | null = null
const oyentes = new Set<() => void>()

export function publicarAbrir(abrir: Abrir | null) {
  abrirActual = abrir
  oyentes.forEach((aviso) => aviso())
}

/** El botón de la barra vive fuera del layout: se entera por acá. */
export function useAbrirRecorrido(): Abrir | null {
  return useSyncExternalStore(
    (aviso) => {
      oyentes.add(aviso)
      return () => oyentes.delete(aviso)
    },
    () => abrirActual,
    () => null,
  )
}
