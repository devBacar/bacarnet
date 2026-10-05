import type { ContraparteMovimiento } from '../../services/finanzasMovimientosApi'
import { datosContraparte, etiquetaOrigenContraparte } from './contraparteTexto'

export function CeldaContraparte(props: {
  contraparte: ContraparteMovimiento | string | null
  onCompletar?: () => void
}) {
  const datos = datosContraparte(props.contraparte)
  const etiqueta = etiquetaOrigenContraparte(datos.origen)
  if (!datos.nombre) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-neutral-400 dark:text-zinc-500">—</span>
        {props.onCompletar ? (
          <button
            type="button"
            className="text-xs font-medium text-sky-800 underline decoration-sky-800/40 underline-offset-2 hover:text-sky-950 dark:text-sky-300 dark:decoration-sky-300/40 dark:hover:text-sky-100"
            onClick={props.onCompletar}
          >
            Completar
          </button>
        ) : null}
      </div>
    )
  }
  return (
    <div className="max-w-[14rem]">
      <p className="text-heading break-words font-semibold leading-5">{datos.nombre}</p>
      {etiqueta ? <p className="text-body-muted text-[11px] leading-4">{etiqueta}</p> : null}
    </div>
  )
}
