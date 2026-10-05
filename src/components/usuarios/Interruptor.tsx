export function Interruptor({
  activo,
  onChange,
  titulo,
  ayuda,
  deshabilitado = false,
}: {
  activo: boolean
  onChange: (valor: boolean) => void
  titulo: string
  ayuda: string
  deshabilitado?: boolean
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-lg border border-neutral-100 px-4 py-3 dark:border-zinc-800 ${
        deshabilitado ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-gray-100">{titulo}</p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-gray-400">{ayuda}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={titulo}
        disabled={deshabilitado}
        onClick={() => onChange(!activo)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${
          activo ? 'bg-brand-primary' : 'bg-neutral-300 dark:bg-zinc-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-zinc-900 ${
            activo ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
