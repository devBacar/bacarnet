import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAuth } from '../../../context'
import {
  fetchOcasionalesCadenas,
  type CadenaRenovacion,
} from '../../../services/finanzasChequesApi'
import { formatMoneyCentavos } from '../formatMoney'

interface Props {
  /** beneficiarioNormalizado para filtrar (drill-down). Vacío = todas. */
  beneficiarioFiltro: string
  onLimpiarFiltro: () => void
}

interface GrupoBeneficiario {
  clave: string
  beneficiario: string
  cadenas: CadenaRenovacion[]
  interesCentavos: number
}

export function CadenasRenovacion({ beneficiarioFiltro, onLimpiarFiltro }: Props) {
  const { user } = useAuth()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'cadenas'],
    queryFn: fetchOcasionalesCadenas,
    enabled: Boolean(user),
  })

  const grupos = useMemo<GrupoBeneficiario[]>(() => {
    const mapa = new Map<string, GrupoBeneficiario>()
    for (const c of data?.cadenas ?? []) {
      if (beneficiarioFiltro && c.beneficiarioNormalizado !== beneficiarioFiltro) continue
      const g = mapa.get(c.beneficiarioNormalizado)
      if (g) {
        g.cadenas.push(c)
        g.interesCentavos += c.interesTotalCentavos
      } else {
        mapa.set(c.beneficiarioNormalizado, {
          clave: c.beneficiarioNormalizado,
          beneficiario: c.beneficiario,
          cadenas: [c],
          interesCentavos: c.interesTotalCentavos,
        })
      }
    }
    return [...mapa.values()].sort((a, b) => b.interesCentavos - a.interesCentavos)
  }, [data, beneficiarioFiltro])

  if (isLoading) return <p className="text-body-muted text-sm">Cargando cadenas de renovación…</p>
  if (isError) {
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : 'No se pudieron cargar las cadenas'}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {beneficiarioFiltro ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-body-muted">Filtrando por:</span>
          <span className="inline-block rounded border border-violet-300 bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
            {grupos[0]?.beneficiario ?? beneficiarioFiltro}
          </span>
          <button type="button" className="text-brand-primary text-xs underline" onClick={onLimpiarFiltro}>
            Ver todas
          </button>
        </div>
      ) : null}

      {grupos.length === 0 ? (
        <p className="text-body-muted px-4 py-8 text-center">No hay cadenas de renovación.</p>
      ) : null}

      {grupos.map((g) => (
        <section key={g.clave} className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-heading text-sm font-semibold">{g.beneficiario}</h3>
            <span className="text-body-muted text-xs">
              {g.cadenas.length} {g.cadenas.length === 1 ? 'cadena' : 'cadenas'} · Interés{' '}
              <span className="font-medium text-red-600 dark:text-red-400">
                {formatMoneyCentavos(g.interesCentavos, 'ARS')}
              </span>
            </span>
          </header>
          <div className="space-y-3">
            {g.cadenas.map((c) => (
              <CadenaCard key={c.id} cadena={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function CadenaCard({ cadena }: { cadena: CadenaRenovacion }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-body-muted">Capital:</span>{' '}
          <span className="text-heading font-medium">{formatMoneyCentavos(cadena.capitalInicialCentavos, 'ARS')}</span>
        </span>
        <span className="text-body-muted">→</span>
        <span>
          <span className="text-body-muted">Final:</span>{' '}
          <span className="text-heading font-medium">{formatMoneyCentavos(cadena.montoFinalCentavos, 'ARS')}</span>
        </span>
        <span>
          <span className="text-body-muted">Interés:</span>{' '}
          <span className="font-medium text-red-600 dark:text-red-400">
            {formatMoneyCentavos(cadena.interesTotalCentavos, 'ARS')}
          </span>
        </span>
        <span>
          <span className="text-body-muted">Tasa implícita:</span>{' '}
          <span className="text-heading font-medium">{(cadena.tasaImplicita * 100).toFixed(1)}%</span>
        </span>
        {cadena.operacionUsd ? (
          <span
            className="inline-block rounded border border-green-300 bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-900 dark:border-green-700 dark:bg-green-900/40 dark:text-green-200"
            title={`US$ ${cadena.operacionUsd.montoUsd.toLocaleString('es-AR')} @ ${cadena.operacionUsd.cotizacion.toLocaleString('es-AR')}`}
          >
            USD
          </span>
        ) : null}
      </div>

      <p className="text-body-muted mt-2 font-mono text-[11px]">{cadena.cheques.join(' → ')}</p>

      {cadena.eslabones.length > 0 ? (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-body-muted text-left">
              <tr>
                <th className="px-2 py-1">Cheque viejo</th>
                <th className="px-2 py-1">Cheque nuevo</th>
                <th className="px-2 py-1 text-right">Monto viejo</th>
                <th className="px-2 py-1 text-right">Monto nuevo</th>
                <th className="px-2 py-1 text-right">Interés</th>
              </tr>
            </thead>
            <tbody>
              {cadena.eslabones.map((e) => (
                <tr key={`${e.chequeViejo}-${e.chequeNuevo}`} className="border-t border-subtle">
                  <td className="px-2 py-1 font-mono">{e.chequeViejo}</td>
                  <td className="px-2 py-1 font-mono">{e.chequeNuevo}</td>
                  <td className="px-2 py-1 text-right">{formatMoneyCentavos(e.montoViejoCentavos, 'ARS')}</td>
                  <td className="px-2 py-1 text-right">{formatMoneyCentavos(e.montoNuevoCentavos, 'ARS')}</td>
                  <td className="px-2 py-1 text-right font-medium text-red-600 dark:text-red-400">
                    {formatMoneyCentavos(e.interesCentavos, 'ARS')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
