import type { HoyResponse } from '../../../services/finanzasHoyApi'
import { etiquetaMedioPago, etiquetaOrigenCompromiso } from './etiquetasCompromiso'
import { Etiqueta, Monto, Tarjeta, Vacio } from './TarjetasHoy'

/**
 * Lo que ya se pagó o se cobró hoy, sin importar cuándo vencía. Informativo (no se puede
 * accionar desde acá): evita que un día con mucho movimiento real se vea como un día vacío.
 */
export function ResueltoHoy({ resueltoHoy }: { resueltoHoy: HoyResponse['resueltoHoy'] }) {
  if (!resueltoHoy) return null
  const { pagos, cobros } = resueltoHoy
  if (pagos.filas.length === 0 && cobros.filas.length === 0) return null

  return (
    <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
      <Tarjeta
        titulo="Pagado hoy"
        subtitulo={pagos.filas.length > 0 ? <Monto centavos={pagos.totalCentavos} /> : undefined}
        ayuda="Ya está resuelto: no hace falta hacer nada más con esto."
      >
        {pagos.filas.length === 0 ? (
          <Vacio texto="No se pagó nada hoy." />
        ) : (
          <ul className="space-y-2">
            {pagos.filas.map((fila) => (
              <li key={fila.id} className="flex items-start justify-between gap-2 text-[13px]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{fila.aQuienODeQuien}</p>
                  <p className="text-body-muted truncate">{fila.concepto}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {fila.medioPago ? <Etiqueta tono="gris">{etiquetaMedioPago(fila.medioPago)}</Etiqueta> : null}
                    <Etiqueta tono="gris">{etiquetaOrigenCompromiso(fila.id)}</Etiqueta>
                  </div>
                </div>
                <Monto centavos={fila.montoCentavos} className="shrink-0 font-medium" />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <Tarjeta
        titulo="Cobrado hoy"
        subtitulo={cobros.filas.length > 0 ? <Monto centavos={cobros.totalCentavos} /> : undefined}
        ayuda="Ya está resuelto: no hace falta hacer nada más con esto."
      >
        {cobros.filas.length === 0 ? (
          <Vacio texto="No se cobró nada hoy." />
        ) : (
          <ul className="space-y-2">
            {cobros.filas.map((fila) => (
              <li key={fila.id} className="flex items-start justify-between gap-2 text-[13px]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{fila.aQuienODeQuien}</p>
                  <p className="text-body-muted truncate">{fila.concepto}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Etiqueta tono="gris">{etiquetaOrigenCompromiso(fila.id)}</Etiqueta>
                  </div>
                </div>
                <Monto centavos={fila.montoCentavos} className="shrink-0 font-medium" />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}
