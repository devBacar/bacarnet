import { AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PropuestaRenovacionItem } from '../../../services/finanzasChequesApi'
import { finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

const numeroCorto = (n: string) => n.split('-').pop() ?? n

/**
 * Arma a mano una renovación: de un lado los cheques nuevos (los emitidos el mismo día, al mismo beneficiario y
 * con el mismo OBS), del otro los cheques viejos que nombra el OBS, buscados en la base. Se marca qué entra
 * de cada lado y se ve si los montos cierran antes de guardar.
 */
export function ArmarRenovacion({
  numeroAbierto,
  obs,
  propuesta,
  guardando,
  onGuardar,
}: {
  /** Número del cheque que se está mirando: siempre forma parte de la operación. */
  numeroAbierto: string
  obs: string
  propuesta: PropuestaRenovacionItem
  guardando: boolean
  onGuardar: (chequeIds: string[], chequesDelGrupo: string[]) => void
}) {
  const [nuevosMarcados, setNuevosMarcados] = useState<Set<string>>(
    () => new Set(propuesta.nuevos.map((n) => n.numeroCheque)),
  )
  const [viejosMarcados, setViejosMarcados] = useState<Set<string>>(
    () => new Set(propuesta.viejos.filter((v) => v.encontrado).map((v) => v.numeroObs)),
  )
  const [otros, setOtros] = useState('')

  const alternar = (set: Set<string>, valor: string) => {
    const nuevo = new Set(set)
    if (nuevo.has(valor)) nuevo.delete(valor)
    else nuevo.add(valor)
    return nuevo
  }

  const otrosNumeros = otros.split(/[\s,;/]+/).map((x) => x.trim()).filter(Boolean)
  const cuentas = useMemo(() => {
    const totalNuevos = propuesta.nuevos
      .filter((n) => nuevosMarcados.has(n.numeroCheque))
      .reduce((s, n) => s + n.montoCentavos, 0)
    const viejos = propuesta.viejos.filter((v) => viejosMarcados.has(v.numeroObs))
    const totalViejos = viejos.reduce((s, v) => s + (v.encontrado?.montoCentavos ?? 0), 0)
    const sinMonto = viejos.filter((v) => !v.encontrado).length
    return { totalNuevos, totalViejos, sinMonto, interes: totalNuevos - totalViejos }
  }, [propuesta, nuevosMarcados, viejosMarcados])

  const chequeIds = [...propuesta.viejos.filter((v) => viejosMarcados.has(v.numeroObs)).map((v) => v.numeroObs), ...otrosNumeros]
  const hayViejos = cuentas.totalViejos > 0

  return (
    <div className="mt-2 space-y-3 text-xs">
      <section>
        <p className="font-semibold text-heading">Cheques viejos que se renuevan</p>
        <p className="text-body-muted">
          Según el OBS <span className="font-mono">{obs || '(vacío)'}</span>
          {propuesta.viejos.length > 0 ? ` son ${propuesta.viejos.length}. Destildá los que no correspondan.` : ': no nombra ningún cheque. Agregalos abajo.'}
        </p>
        {propuesta.viejos.length > 0 ? (
          <table className="mt-1 min-w-full">
            <thead className="text-left text-[11px] text-body-muted">
              <tr>
                <th className="w-6 py-1"></th>
                <th className="py-1 pr-2">Cheque</th>
                <th className="py-1 pr-2">Vencimiento</th>
                <th className="py-1 pr-2">Estado</th>
                <th className="py-1 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {propuesta.viejos.map((v) => (
                <tr key={v.numeroObs} className="border-t border-neutral-200/70 align-top dark:border-zinc-700/70">
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      checked={viejosMarcados.has(v.numeroObs)}
                      onChange={() => setViejosMarcados((s) => alternar(s, v.numeroObs))}
                      aria-label={`Renueva el cheque ${v.numeroObs}`}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="font-mono">{v.numeroObs}</span>
                    {v.avisos.map((a) => (
                      <span key={a} className="mt-0.5 flex items-start gap-1 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                        {a}
                      </span>
                    ))}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2">{formatFecha(v.encontrado?.fechaVencimiento ?? null)}</td>
                  <td className="py-1.5 pr-2 text-body-muted">{v.encontrado?.estado || '—'}</td>
                  <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                    {v.encontrado ? formatMoneyCentavos(v.encontrado.montoCentavos, 'ARS') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <label className="mt-2 block">
          <span className="text-body-muted">Otros cheques que renueva (opcional, números separados por coma)</span>
          <input className={`${finanzasInputClass} mt-0.5 w-full`} value={otros} placeholder="39111588, 39111589" onChange={(e) => setOtros(e.target.value)} />
        </label>
      </section>

      <section>
        <p className="font-semibold text-heading">Cheques nuevos de esta operación</p>
        <p className="text-body-muted">Emitidos el mismo día, al mismo beneficiario y con el mismo OBS.</p>
        <table className="mt-1 min-w-full">
          <thead className="text-left text-[11px] text-body-muted">
            <tr>
              <th className="w-6 py-1"></th>
              <th className="py-1 pr-2">Cheque</th>
              <th className="py-1 pr-2">Vencimiento</th>
              <th className="py-1 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {propuesta.nuevos.map((n) => {
              const esElAbierto = n.numeroCheque === numeroAbierto
              return (
                <tr key={n.numeroCheque} className="border-t border-neutral-200/70 dark:border-zinc-700/70">
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      checked={esElAbierto || nuevosMarcados.has(n.numeroCheque)}
                      disabled={esElAbierto}
                      onChange={() => setNuevosMarcados((s) => alternar(s, n.numeroCheque))}
                      aria-label={`El cheque ${numeroCorto(n.numeroCheque)} es parte de esta renovación`}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="font-mono">{numeroCorto(n.numeroCheque)}</span>
                    {esElAbierto ? <span className="ml-1 text-body-muted">(este)</span> : null}
                    {n.renovacionDe.length > 0 ? (
                      <span className="block text-body-muted">Ya marcado como renovación de {n.renovacionDe.join(', ')}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2">{formatFecha(n.fechaVencimiento)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{formatMoneyCentavos(n.montoCentavos, 'ARS')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>Viejos: <strong className="tabular-nums">{formatMoneyCentavos(cuentas.totalViejos, 'ARS')}</strong></span>
          <span>Nuevos: <strong className="tabular-nums">{formatMoneyCentavos(cuentas.totalNuevos, 'ARS')}</strong></span>
          {hayViejos ? (
            <span>
              Interés: <strong className={`tabular-nums ${cuentas.interes < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatMoneyCentavos(cuentas.interes, 'ARS')}</strong>
              {' '}({((cuentas.interes / cuentas.totalViejos) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%)
            </span>
          ) : null}
        </div>
        {hayViejos && cuentas.interes < 0 ? (
          <p className="mt-1 text-red-600 dark:text-red-400">Los cheques nuevos suman menos que los viejos. Revisá qué cheques marcaste.</p>
        ) : null}
        {cuentas.sinMonto > 0 || otrosNumeros.length > 0 ? (
          <p className="mt-1 text-body-muted">Los cheques que no están cargados no entran en la cuenta.</p>
        ) : null}
      </section>

      <button
        type="button"
        disabled={guardando || chequeIds.length === 0}
        onClick={() => onGuardar(chequeIds, [...nuevosMarcados, numeroAbierto])}
        className="rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
      >
        {guardando ? 'Guardando…' : 'Guardar renovación'}
      </button>
    </div>
  )
}
