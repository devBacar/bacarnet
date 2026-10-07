import type { FocoRrhh } from '../../services/rrhhApi'
import { BORDE_SEVERIDAD } from './severidad'

/** "Dónde está el problema": los focos más graves, como tarjetas con borde de severidad. */
export function FocosRrhh({ focos }: { focos: FocoRrhh[] }) {
  if (focos.length === 0) {
    return <p className="text-body-muted text-[13px]">No hay focos graves para esta selección.</p>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {focos.map((f, i) => (
        <article
          key={`${f.cc}-${f.etiqueta}`}
          className={`flex min-w-0 flex-col gap-1.5 rounded-lg border border-t-4 border-neutral-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 ${BORDE_SEVERIDAD[f.severidad]}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
            {i + 1} · {f.etiqueta}
          </p>
          <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-gray-100">{f.area}</h3>
          <p className="text-[22px] font-semibold leading-tight tabular-nums text-neutral-900 dark:text-gray-100">{f.cifra}</p>
          <p className="text-[13px] text-neutral-600 dark:text-gray-400">{f.texto}</p>
        </article>
      ))}
    </div>
  )
}
