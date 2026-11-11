import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Guarda en la URL (?clave=valor) por dónde va navegando el usuario,
 * así al recargar la página vuelve al mismo lugar.
 *
 * `cambiar` recibe todas las claves juntas: un valor vacío (o null) borra la
 * clave para que la URL quede corta cuando se usa el valor por defecto.
 */
export function useParamsUrl() {
  const [searchParams, setSearchParams] = useSearchParams()

  const cambiar = useCallback(
    (cambios: Record<string, string | null | undefined>, opciones?: { reemplazar?: boolean }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [clave, valor] of Object.entries(cambios)) {
            if (valor) next.set(clave, valor)
            else next.delete(clave)
          }
          return next
        },
        { replace: opciones?.reemplazar ?? false },
      )
    },
    [setSearchParams],
  )

  return { params: searchParams, cambiar }
}

/** Devuelve el valor de la URL solo si es uno de los permitidos; si no, el de por defecto. */
export function valorPermitido<T extends string>(valor: string | null, permitidos: readonly T[], porDefecto: T): T {
  return valor !== null && (permitidos as readonly string[]).includes(valor) ? (valor as T) : porDefecto
}
