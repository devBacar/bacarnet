import { inicialesDe, coloresAvatar } from './util'

export function AvatarUsuario({
  nombre,
  email,
  clave,
}: {
  nombre: string
  email: string
  clave: string
}) {
  const colores = coloresAvatar(clave)
  return (
    <span
      aria-hidden
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${colores.fondo} ${colores.texto}`}
    >
      {inicialesDe(nombre, email)}
    </span>
  )
}
