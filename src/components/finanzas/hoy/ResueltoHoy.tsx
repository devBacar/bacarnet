import { useState } from 'react'
import type { HoyResponse, MedioResueltoHoy, MovimientoDelDiaHoy } from '../../../services/finanzasHoyApi'
import { etiquetaOrigenCompromiso } from './etiquetasCompromiso'
import { Etiqueta, Monto, Tarjeta, Vacio } from './TarjetasHoy'

const ETIQUETA_MEDIO: Record<MedioResueltoHoy, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque_fisico: 'Cheque físico',
  echeq: 'E-cheq',
  otro: 'Otro medio',
}

const ORDEN_MEDIO: MedioResueltoHoy[] = ['efectivo', 'transferencia', 'cheque_fisico', 'echeq', 'otro']

function agruparPorMedio(filas: MovimientoDelDiaHoy[]): Array<{ medio: MedioResueltoHoy; totalCentavos: number; filas: MovimientoDelDiaHoy[] }> {
  const grupos = new Map<MedioResueltoHoy, MovimientoDelDiaHoy[]>()
  for (const fila of filas) grupos.set(fila.medio, [...(grupos.get(fila.medio) ?? []), fila])
  return ORDEN_MEDIO.filter((m) => grupos.has(m)).map((medio) => {
    const filasMedio = grupos.get(medio) ?? []
    return { medio, totalCentavos: filasMedio.reduce((s, f) => s + f.montoCentavos, 0), filas: filasMedio }
  })
}

function GrupoMedio({ medio, totalCentavos, filas }: { medio: MedioResueltoHoy; totalCentavos: number; filas: MovimientoDelDiaHoy[] }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <li className="rounded-lg border border-neutral-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[13px]"
        aria-expanded={abierto}
      >
        <span className="font-medium">
          {ETIQUETA_MEDIO[medio]} <span className="text-body-muted font-normal">({filas.length})</span>
        </span>
        <span className="flex items-center gap-2">
          <Monto centavos={totalCentavos} className="font-medium" />
          <span className="text-body-muted">{abierto ? '▲' : '▼'}</span>
        </span>
      </button>
      {abierto ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto border-t border-neutral-100 px-2.5 py-2 dark:border-zinc-800">
          {filas.map((fila) => (
            <li key={fila.id} className="flex items-start justify-between gap-2 text-[13px]">
              <div className="min-w-0">
                <p className="truncate font-medium">{fila.aQuienODeQuien}</p>
                <p className="text-body-muted truncate">
                  {fila.concepto}
                  {fila.chequeNumero ? ` · ${fila.chequeNumero}` : ''}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <Etiqueta tono="gris">{etiquetaOrigenCompromiso(fila.id)}</Etiqueta>
                  {fila.debitadoPorBanco === true ? (
                    <Etiqueta tono="verde">Ya lo movió el banco</Etiqueta>
                  ) : fila.debitadoPorBanco === false ? (
                    <Etiqueta tono="ambar">El banco todavía no lo movió</Etiqueta>
                  ) : null}
                </div>
              </div>
              <Monto centavos={fila.montoCentavos} className="shrink-0 font-medium" />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/**
 * Plata que de verdad ya se movió del banco hoy, agrupada por medio real. Un cheque cuenta recién cuando
 * el banco lo debitó/acreditó (no cuando se armó la orden de pago ni el día en que vence en el papel).
 * Informativo: no se puede accionar desde acá.
 */
export function ResueltoHoy({ resueltoHoy }: { resueltoHoy: HoyResponse['resueltoHoy'] }) {
  if (!resueltoHoy) return null
  const { pagos, cobros } = resueltoHoy
  if (pagos.filas.length === 0 && cobros.filas.length === 0) return null
  const gruposPagos = agruparPorMedio(pagos.filas)
  const gruposCobros = agruparPorMedio(cobros.filas)

  return (
    <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
      <Tarjeta
        titulo="Salió del banco hoy"
        subtitulo={pagos.filas.length > 0 ? <Monto centavos={pagos.totalCentavos} /> : undefined}
        ayuda="Solo lo que el banco ya movió de verdad. Un cheque cuenta recién cuando el banco lo debitó, no el día que vence en el papel ni el día que se armó la orden de pago."
      >
        {gruposPagos.length === 0 ? (
          <Vacio texto="Todavía no salió nada del banco hoy." />
        ) : (
          <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {gruposPagos.map((g) => (
              <GrupoMedio key={g.medio} {...g} />
            ))}
          </ul>
        )}
      </Tarjeta>
      <Tarjeta
        titulo="Ingresó al banco hoy"
        subtitulo={cobros.filas.length > 0 ? <Monto centavos={cobros.totalCentavos} /> : undefined}
        ayuda="Solo lo que el banco ya acreditó de verdad. Un cheque cuenta recién cuando el banco lo acreditó, no el día que vence en el papel ni el día que se recibió."
      >
        {gruposCobros.length === 0 ? (
          <Vacio texto="Todavía no ingresó nada al banco hoy." />
        ) : (
          <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {gruposCobros.map((g) => (
              <GrupoMedio key={g.medio} {...g} />
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}
