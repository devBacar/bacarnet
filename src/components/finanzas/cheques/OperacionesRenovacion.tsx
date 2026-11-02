import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, History, Link2, Link2Off, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context'
import {
  fetchOperacionesRenovacion,
  type OperacionRenovacionItem,
  type ChequeEnOperacionItem,
} from '../../../services/finanzasChequesApi'
import { finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function formatPorcentaje(decimal: number): string {
  return `${(decimal * 100).toFixed(1)}%`
}

function chequeCorto(num: string): string {
  const partes = num.split('-')
  return partes.length >= 4 ? partes[3]! : num
}

function diasEntreFechas(a: string, b: string): number {
  const msA = new Date(a + 'T12:00:00Z').getTime()
  const msB = new Date(b + 'T12:00:00Z').getTime()
  return Math.round((msB - msA) / 86_400_000)
}

interface ParCheques {
  viejo: ChequeEnOperacionItem | null
  nuevo: ChequeEnOperacionItem | null
  interesCentavos: number
  dias: number | null
}

function armarPares(op: OperacionRenovacionItem): ParCheques[] {
  const viejos = [...op.chequesViejos].sort((a, b) =>
    (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? ''),
  )
  const nuevos = [...op.chequesNuevos].sort((a, b) =>
    (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? ''),
  )
  const len = Math.max(viejos.length, nuevos.length)
  const pares: ParCheques[] = []
  for (let i = 0; i < len; i++) {
    const v = viejos[i] ?? null
    const n = nuevos[i] ?? null
    const interes = v && n ? n.montoCentavos - v.montoCentavos : 0
    let dias: number | null = null
    if (v?.fechaVencimiento && n?.fechaVencimiento) {
      dias = diasEntreFechas(v.fechaVencimiento, n.fechaVencimiento)
    }
    pares.push({ viejo: v, nuevo: n, interesCentavos: interes, dias })
  }
  return pares
}

interface Props {
  beneficiarioFiltro: string
  onLimpiarFiltro: () => void
}

interface GrupoBeneficiario {
  clave: string
  beneficiario: string
  operaciones: OperacionRenovacionItem[]
  interesCentavos: number
  totalNuevosCentavos: number
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function beneficiariosCompatibles(a: string, b: string): boolean {
  if (a === b) return true
  const wa = a.split(/\s+/).filter(w => w.length >= 3)
  const wb = b.split(/\s+/).filter(w => w.length >= 3)
  return wa.some(w => wb.some(x => x.startsWith(w) || w.startsWith(x)))
}

const HOY = new Date().toISOString().slice(0, 10)

function esOperacionActual(op: OperacionRenovacionItem): boolean {
  return op.chequesNuevos.some(c => c.fechaVencimiento && c.fechaVencimiento >= HOY)
}

function opMatchBusqueda(op: OperacionRenovacionItem, q: string): boolean {
  if (normalizar(op.beneficiario).includes(q)) return true
  const todos = [...op.chequesNuevos, ...op.chequesViejos]
  for (const c of todos) {
    if (c.numeroCheque.includes(q)) return true
    const centavos = c.montoCentavos
    const pesos = Math.round(centavos / 100)
    if (String(pesos).includes(q)) return true
  }
  return false
}

function opMatchVto(op: OperacionRenovacionItem, desde: string, hasta: string): boolean {
  const todos = [...op.chequesNuevos, ...op.chequesViejos]
  for (const c of todos) {
    if (!c.fechaVencimiento) continue
    if (desde && c.fechaVencimiento < desde) continue
    if (hasta && c.fechaVencimiento > hasta) continue
    return true
  }
  return false
}

export function OperacionesRenovacion({ beneficiarioFiltro, onLimpiarFiltro }: Props) {
  const { user } = useAuth()

  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  const [vtoDesde, setVtoDesde] = useState('')
  const [vtoHasta, setVtoHasta] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQ(normalizar(busqueda.trim())), 400)
    return () => clearTimeout(t)
  }, [busqueda])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'operaciones-renovacion'],
    queryFn: fetchOperacionesRenovacion,
    enabled: Boolean(user),
  })

  const filtradas = useMemo(() => {
    const todas = data?.operaciones ?? []
    return todas.filter((op) => {
      if (beneficiarioFiltro && !beneficiariosCompatibles(op.beneficiarioNormalizado, beneficiarioFiltro)) return false
      if (q && !opMatchBusqueda(op, q)) return false
      if ((vtoDesde || vtoHasta) && !opMatchVto(op, vtoDesde, vtoHasta)) return false
      return true
    })
  }, [data, beneficiarioFiltro, q, vtoDesde, vtoHasta])

  const grupos = useMemo<GrupoBeneficiario[]>(() => {
    const lista: GrupoBeneficiario[] = []
    for (const op of filtradas) {
      const existente = lista.find(g => beneficiariosCompatibles(g.clave, op.beneficiarioNormalizado))
      if (existente) {
        existente.operaciones.push(op)
        existente.interesCentavos += op.interesCentavos
        existente.totalNuevosCentavos += op.totalNuevosCentavos
      } else {
        lista.push({
          clave: op.beneficiarioNormalizado,
          beneficiario: op.beneficiario,
          operaciones: [op],
          interesCentavos: op.interesCentavos,
          totalNuevosCentavos: op.totalNuevosCentavos,
        })
      }
    }
    return lista.sort((a, b) => b.totalNuevosCentavos - a.totalNuevosCentavos)
  }, [filtradas])

  const totales = useMemo(() => {
    let interes = 0
    let capital = 0
    let ops = 0
    let explicitas = 0
    let implicitas = 0
    for (const g of grupos) {
      for (const o of g.operaciones) {
        ops++
        interes += o.interesCentavos
        capital += o.totalNuevosCentavos
        if (o.tipoVinculo === 'explicito') explicitas++
        else if (o.tipoVinculo === 'implicito') implicitas++
      }
    }
    return { interes, capital, ops, explicitas, implicitas }
  }, [grupos])

  const hayFiltros = q || vtoDesde || vtoHasta

  if (isLoading) return <p className="text-body-muted text-sm">Cargando operaciones de renovación…</p>
  if (isError) {
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : 'No se pudieron cargar las operaciones'}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            className={`${finanzasInputClass} pl-9`}
            placeholder="Beneficiario, nº cheque, importe…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {busqueda ? (
            <button
              type="button"
              className="text-body-muted hover:text-heading absolute right-2 top-1/2 -translate-y-1/2 px-1"
              onClick={() => setBusqueda('')}
            >
              ×
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-body-muted text-xs whitespace-nowrap">Vto desde</label>
          <input type="date" className={`${finanzasInputClass} text-sm w-36`} value={vtoDesde} onChange={(e) => setVtoDesde(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-body-muted text-xs whitespace-nowrap">hasta</label>
          <input type="date" className={`${finanzasInputClass} text-sm w-36`} value={vtoHasta} onChange={(e) => setVtoHasta(e.target.value)} />
        </div>
        {hayFiltros ? (
          <button
            type="button"
            className="text-brand-primary text-xs underline"
            onClick={() => { setBusqueda(''); setVtoDesde(''); setVtoHasta('') }}
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {/* Resumen */}
      {totales.ops > 0 ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
            <span className="text-body-muted">Operaciones:</span>{' '}
            <span className="text-heading font-semibold">{totales.ops}</span>
            <span className="text-body-muted ml-1 text-xs">
              ({totales.explicitas} explícitas, {totales.implicitas} implícitas)
            </span>
          </span>
          <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
            <span className="text-body-muted">Capital renovado:</span>{' '}
            <span className="text-heading font-semibold tabular-nums">{formatMoneyCentavos(totales.capital, 'ARS')}</span>
          </span>
          {totales.interes > 0 ? (
            <span className="rounded-lg border border-red-200 bg-red-50/60 px-2.5 py-1.5 dark:border-red-900/60 dark:bg-red-950/20">
              <span className="text-body-muted">Interés total:</span>{' '}
              <span className="font-semibold text-red-600 tabular-nums dark:text-red-400">{formatMoneyCentavos(totales.interes, 'ARS')}</span>
            </span>
          ) : null}
        </div>
      ) : null}

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
        <p className="text-body-muted px-4 py-8 text-center">No hay operaciones de renovación.</p>
      ) : null}

      {grupos.map((g) => (
        <GrupoBeneficiarioSection key={g.clave} grupo={g} />
      ))}
    </div>
  )
}

function GrupoBeneficiarioSection({ grupo: g }: { grupo: GrupoBeneficiario }) {
  const actuales = g.operaciones.filter(esOperacionActual)
  const anteriores = g.operaciones.filter(op => !esOperacionActual(op))
  const [verAnteriores, setVerAnteriores] = useState(false)

  return (
    <section className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-heading text-sm font-semibold">{g.beneficiario}</h3>
        <span className="text-body-muted text-xs">
          {g.operaciones.length} {g.operaciones.length === 1 ? 'operación' : 'operaciones'} · Capital{' '}
          <span className="text-heading font-medium tabular-nums">{formatMoneyCentavos(g.totalNuevosCentavos, 'ARS')}</span>
          {g.interesCentavos > 0 ? (
            <>
              {' '}· Interés{' '}
              <span className="font-medium text-red-600 dark:text-red-400">
                {formatMoneyCentavos(g.interesCentavos, 'ARS')}
              </span>
            </>
          ) : null}
        </span>
      </header>

      {/* Operaciones actuales — resaltadas */}
      {actuales.length > 0 ? (
        <div className="space-y-3">
          {actuales.map((op) => (
            <OperacionCard key={op.id} op={op} resaltada />
          ))}
        </div>
      ) : null}

      {/* Operaciones anteriores — colapsadas */}
      {anteriores.length > 0 ? (
        <div className={actuales.length > 0 ? 'mt-3' : ''}>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/60 px-3 py-2 text-left text-xs dark:border-zinc-700 dark:bg-zinc-800/30"
            onClick={() => setVerAnteriores(v => !v)}
          >
            <History className="h-3.5 w-3.5 text-neutral-400" />
            <span className="text-body-muted">
              {anteriores.length} {anteriores.length === 1 ? 'operación anterior' : 'operaciones anteriores'}
            </span>
            <span className="ml-auto">
              {verAnteriores
                ? <ChevronUp className="h-3.5 w-3.5 text-neutral-400" />
                : <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />}
            </span>
          </button>
          {verAnteriores ? (
            <div className="mt-2 space-y-3">
              {anteriores.map((op) => (
                <OperacionCard key={op.id} op={op} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Si no hay actuales, mostrar todo directamente */}
      {actuales.length === 0 && anteriores.length === 0 ? (
        <div className="space-y-3">
          {g.operaciones.map((op) => (
            <OperacionCard key={op.id} op={op} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function OperacionCard({ op, resaltada }: { op: OperacionRenovacionItem; resaltada?: boolean }) {
  const [abierta, setAbierta] = useState(false)
  const pares = useMemo(() => armarPares(op), [op])

  const cadenaTexto = useMemo(() => {
    const nums: string[] = []
    for (const p of pares) {
      if (p.viejo) nums.push(p.viejo.numeroCheque)
      if (p.nuevo) nums.push(p.nuevo.numeroCheque)
    }
    return nums.join(' → ')
  }, [pares])

  return (
    <div className={`rounded-xl border ${resaltada ? 'border-violet-300 ring-1 ring-violet-200 dark:border-violet-700 dark:ring-violet-800/40' : 'border-neutral-200 dark:border-zinc-800'}`}>
      {/* Summary header — estilo cadena */}
      <button
        type="button"
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-t-xl border-b px-3 py-2 text-left text-sm ${resaltada ? 'border-violet-200 bg-violet-50/60 dark:border-violet-800 dark:bg-violet-900/20' : 'border-neutral-200 bg-neutral-50/80 dark:border-zinc-800 dark:bg-zinc-800/40'}`}
        onClick={() => setAbierta((v) => !v)}
      >
        <span className="inline-flex items-center gap-1.5">
          {op.vinculada ? (
            <Link2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Link2Off className="h-3.5 w-3.5 text-amber-500" />
          )}
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
            op.vinculada
              ? (op.tipoVinculo === 'implicito'
                ? 'border border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
                : 'border border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200')
              : 'border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
          }`}>
            {op.vinculada
              ? (op.tipoVinculo === 'implicito' ? 'Implícito' : 'Explícito')
              : (op.tipoVinculo === 'implicito' ? 'Sin vincular (impl.)' : 'Sin vincular (expl.)')}
          </span>
        </span>

        {op.vinculada ? (
          <>
            <span className="tabular-nums">
              <span className="text-body-muted">Capital:</span>{' '}
              <span className="text-heading font-semibold">{formatMoneyCentavos(op.totalViejosCentavos, 'ARS')}</span>
            </span>
            <span className="text-body-muted">→</span>
            <span className="tabular-nums">
              <span className="text-body-muted">Final:</span>{' '}
              <span className="text-heading font-semibold">{formatMoneyCentavos(op.totalNuevosCentavos, 'ARS')}</span>
            </span>
            <span className="tabular-nums">
              <span className="text-body-muted">Interés:</span>{' '}
              <span className="font-semibold text-red-600 dark:text-red-400">{formatMoneyCentavos(op.interesCentavos, 'ARS')}</span>
            </span>
            <span className="tabular-nums">
              <span className="text-body-muted">Tasa implícita:</span>{' '}
              <span className="text-heading font-semibold">{formatPorcentaje(op.tasaImplicita)}</span>
            </span>
          </>
        ) : (
          <span className="tabular-nums">
            <span className="text-body-muted">Total nuevos:</span>{' '}
            <span className="text-heading font-semibold">{formatMoneyCentavos(op.totalNuevosCentavos, 'ARS')}</span>
          </span>
        )}

        {op.diasRenovacion != null ? (
          <span className="tabular-nums">
            <span className="text-body-muted">Período:</span>{' '}
            <span className="text-heading font-medium">{op.fechaVtoViejos ?? '?'}</span>
            <span className="text-body-muted"> → </span>
            <span className="text-heading font-medium">{op.fechaVtoNuevos ?? '?'}</span>
            <span className="text-body-muted"> ({op.diasRenovacion} días)</span>
          </span>
        ) : null}

        <span className="ml-auto">
          {abierta ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
        </span>
      </button>

      {abierta ? (
        <div className="space-y-2 p-3">
          {/* Cadena de cheques */}
          {cadenaTexto ? (
            <p className="text-body-muted break-all font-mono text-[10px] leading-relaxed">{cadenaTexto}</p>
          ) : null}

          {/* Tabla pareada viejo→nuevo */}
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-zinc-700">
            <table className="min-w-full text-xs">
              <thead className="text-body-muted bg-neutral-50/80 text-left dark:bg-zinc-800/40">
                <tr>
                  <th className="px-2 py-1.5">Cheque viejo</th>
                  <th className="px-2 py-1.5">Emisión</th>
                  <th className="px-2 py-1.5">Vto</th>
                  <th className="px-2 py-1.5">Cheque nuevo</th>
                  <th className="px-2 py-1.5">Emisión</th>
                  <th className="px-2 py-1.5">Vto</th>
                  <th className="px-2 py-1.5 text-right">Monto viejo</th>
                  <th className="px-2 py-1.5 text-right">Monto nuevo</th>
                  <th className="px-2 py-1.5 text-right">Interés</th>
                  <th className="px-2 py-1.5 text-right">Días</th>
                </tr>
              </thead>
              <tbody>
                {pares.map((p, i) => (
                  <tr key={i} className="border-t border-subtle">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                      {p.viejo ? chequeCorto(p.viejo.numeroCheque) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {p.viejo ? formatFecha(p.viejo.fechaEmision) : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {p.viejo ? formatFecha(p.viejo.fechaVencimiento) : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                      {p.nuevo ? chequeCorto(p.nuevo.numeroCheque) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {p.nuevo ? formatFecha(p.nuevo.fechaEmision) : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {p.nuevo ? formatFecha(p.nuevo.fechaVencimiento) : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {p.viejo ? formatMoneyCentavos(p.viejo.montoCentavos, 'ARS') : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {p.nuevo ? formatMoneyCentavos(p.nuevo.montoCentavos, 'ARS') : ''}
                    </td>
                    <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium ${
                      p.interesCentavos < 0 ? 'text-red-600 dark:text-red-400' : p.interesCentavos > 0 ? 'text-red-600 dark:text-red-400' : ''
                    }`}>
                      {p.viejo && p.nuevo ? formatMoneyCentavos(p.interesCentavos, 'ARS') : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {p.dias != null ? p.dias : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              {pares.length > 1 ? (
                <tfoot className="border-t-2 border-neutral-300 text-xs font-semibold dark:border-zinc-600">
                  <tr>
                    <td colSpan={6} className="px-2 py-1.5">
                      Total ({op.chequesViejos.length} → {op.chequesNuevos.length})
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {op.totalViejosCentavos > 0 ? formatMoneyCentavos(op.totalViejosCentavos, 'ARS') : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {formatMoneyCentavos(op.totalNuevosCentavos, 'ARS')}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-red-600 dark:text-red-400">
                      {op.interesCentavos !== 0 ? formatMoneyCentavos(op.interesCentavos, 'ARS') : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {op.diasRenovacion != null ? op.diasRenovacion : ''}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          {/* OBS */}
          {op.obsOriginal ? (
            <p className="text-body-muted font-mono text-[11px]">OBS: {op.obsOriginal}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
