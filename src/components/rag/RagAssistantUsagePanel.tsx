import { AlertTriangle, BarChart3, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { fetchAssistantUsageStats, type AssistantUsageStatsResponse } from '../../services/ragApi'

function formatUsd(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
}

function formatMonth(month: string): string {
  const [year, monthNum] = month.split('-')
  const date = new Date(Number.parseInt(year, 10), Number.parseInt(monthNum, 10) - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export function RagAssistantUsagePanel() {
  const [stats, setStats] = useState<AssistantUsageStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setStats(await fetchAssistantUsageStats())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar el consumo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loading && !stats) {
    return (
      <div className="flex items-center gap-2 text-sm text-body-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando consumo estimado…
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        No hay datos de consumo disponibles.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Estimación interna — no es la factura de Google Cloud</p>
            <p>{stats.disclaimer}</p>
            <p className="text-xs text-amber-900/80">
              Modelo: {stats.pricing.geminiModel} · Embeddings: {stats.pricing.embeddingModel}. Tarifas
              orientativas: entrada Gemini ${stats.pricing.geminiInputUsdPer1M}/1M tokens, salida $
              {stats.pricing.geminiOutputUsdPer1M}/1M, embeddings $
              {stats.pricing.embeddingUsdPer1MChars}/1M caracteres.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-body-muted">Preguntas totales</p>
          <p className="mt-1 text-2xl font-semibold text-heading">{stats.totals.questions}</p>
          <p className="mt-1 text-xs text-body-muted">
            {stats.scannedInteractions} interacciones analizadas
          </p>
        </div>
        <div className="surface-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-body-muted">Mes actual</p>
          <p className="mt-1 text-2xl font-semibold text-heading">
            {stats.totals.currentMonthQuestions}
          </p>
          <p className="mt-1 text-xs text-body-muted">preguntas este mes</p>
        </div>
        <div className="surface-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-body-muted">Costo estimado (mes)</p>
          <p className="mt-1 text-2xl font-semibold text-heading">
            {formatUsd(stats.totals.currentMonthEstimatedCostUsd)}
          </p>
          <p className="mt-1 text-xs text-body-muted">aproximación USD</p>
        </div>
        <div className="surface-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-body-muted">Medición</p>
          <p className="mt-1 text-2xl font-semibold text-heading">
            {stats.totals.measuredInteractions}
          </p>
          <p className="mt-1 text-xs text-body-muted">
            medidas · {stats.totals.estimatedInteractions} estimadas (histórico)
          </p>
        </div>
      </div>

      <section className="surface-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-brand-primary" aria-hidden />
          <h2 className="font-medium text-heading">Uso por usuario</h2>
        </div>
        {stats.volume.byUser.length === 0 ? (
          <p className="text-sm text-body-muted">Sin interacciones registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-body-muted">
                  <th className="py-2 pr-4">Usuario</th>
                  <th className="py-2 pr-4">Preguntas</th>
                  <th className="py-2">Costo est.</th>
                </tr>
              </thead>
              <tbody>
                {stats.volume.byUser.map((row) => (
                  <tr key={row.userEmail} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{row.userEmail}</td>
                    <td className="py-2 pr-4">{row.questions}</td>
                    <td className="py-2">{formatUsd(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface-card p-4 shadow-sm">
        <h2 className="mb-3 font-medium text-heading">Herramientas más usadas</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-body-muted">
              Por categoría
            </p>
            <ul className="space-y-2 text-sm">
              {stats.tools.byCategory.map((item) => (
                <li key={item.category} className="flex justify-between gap-3">
                  <span>{item.label}</span>
                  <span className="font-medium text-heading">{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-body-muted">
              Detalle (top 10)
            </p>
            <ul className="space-y-2 text-sm">
              {stats.tools.byName.slice(0, 10).map((item) => (
                <li key={item.toolName} className="flex justify-between gap-3">
                  <span className="truncate font-mono text-xs">{item.toolName}</span>
                  <span className="font-medium text-heading">{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="surface-card p-4 shadow-sm">
        <h2 className="mb-3 font-medium text-heading">Últimos 14 días</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {stats.volume.last14Days.map((day) => (
            <div
              key={day.date}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center"
            >
              <p className="text-[10px] text-body-muted">{day.date.slice(5)}</p>
              <p className="text-lg font-semibold text-heading">{day.questions}</p>
            </div>
          ))}
        </div>
      </section>

      {stats.monthlyHistory.length > 0 ? (
        <section className="surface-card p-4 shadow-sm">
          <h2 className="mb-3 font-medium text-heading">Histórico mensual</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-body-muted">
                  <th className="py-2 pr-4">Mes</th>
                  <th className="py-2 pr-4">Preguntas</th>
                  <th className="py-2">Costo est.</th>
                </tr>
              </thead>
              <tbody>
                {stats.monthlyHistory.map((row) => (
                  <tr key={row.month} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{formatMonth(row.month)}</td>
                    <td className="py-2 pr-4">{row.questions}</td>
                    <td className="py-2">{formatUsd(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-body-muted">
        Actualizado: {new Date(stats.generatedAt).toLocaleString('es-AR')}
      </p>
    </div>
  )
}
