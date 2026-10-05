import { ChevronRight } from 'lucide-react'
import type { UserProfile } from '../../services/userService'
import { AvatarUsuario } from './AvatarUsuario'
import { Chip } from './Chip'
import { EtiquetaRol } from './EtiquetaRol'
import { chipsDeUsuario } from './util'

export function TarjetaUsuario({
  user,
  nombresArea,
  onAbrir,
}: {
  user: UserProfile
  nombresArea: Map<string, string>
  onAbrir: () => void
}) {
  const nombre = user.displayName || 'Sin nombre'
  const chips = chipsDeUsuario(user, nombresArea)

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Abrir la ficha de ${nombre}`}
      className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-[var(--color-primary-muted)] hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/70"
    >
      <AvatarUsuario nombre={nombre} email={user.email} clave={user.uid} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-neutral-900 dark:text-gray-100">{nombre}</span>
          <EtiquetaRol rol={user.role} />
        </div>
        <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-gray-400">{user.email}</p>
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Chip key={chip.id} tono={chip.tono}>
                {chip.texto}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
    </button>
  )
}
