import { useQuery, useQueryClient } from '@tanstack/react-query'

import { RefreshCw } from 'lucide-react'

import { useMemo, useState } from 'react'

import toast from 'react-hot-toast'

import { AccountCard } from '../../components/finanzas/AccountCard'
import { AccountsDetailModal } from '../../components/finanzas/AccountsDetailModal'
import { AccountsSummary } from '../../components/finanzas/AccountsSummary'

import { BankPositionsSection } from '../../components/finanzas/BankPositionsSection'
import { CashflowSection } from '../../components/finanzas/CashflowSection'
import { PositionHistorySection } from '../../components/finanzas/PositionHistorySection'

import {
  computePosicionPorBanco,
  groupCuentasByBanco,
} from '../../components/finanzas/finanzasAggregates'

import {
  ManualSaldoModal,
  parseUsdInputToCentavos,
} from '../../components/finanzas/ManualSaldoModal'

import { SemaforoLegend } from '../../components/finanzas/SemaforoLegend'

import { useAuth } from '../../context'

import {
  fetchFinanzasCuentas,
  fetchFinanzasPosicionHistorial,
  patchFinanzasSaldoManual,
  syncFinanzasCuentas,
  type FinanzasCuenta,
  type FinanzasMoneda,
} from '../../services/finanzasApi'

import { hasFinanzasAccess } from '../../services/userService'

export function FinanzasCuentasPage() {
  const { user, userProfile } = useAuth()
  const queryClient = useQueryClient()
  const [manualCuenta, setManualCuenta] = useState<FinanzasCuenta | null>(null)
  const [savingManual, setSavingManual] = useState(false)
  const [detalle, setDetalle] = useState<{
    moneda: FinanzasMoneda
    bancoNombre: string | null
  } | null>(null)

  const canEditManual = hasFinanzasAccess(userProfile)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: Boolean(user),
  })

  const historialQuery = useQuery({
    queryKey: ['finanzas', 'cuentas', 'historial'],
    queryFn: fetchFinanzasPosicionHistorial,
    enabled: Boolean(user),
    refetchInterval: 60_000,
  })

  const posicionPorBanco = useMemo(
    () => (data ? computePosicionPorBanco(data.cuentas) : []),
    [data],
  )
  const gruposPorBanco = useMemo(
    () => (data ? groupCuentasByBanco(data.cuentas) : []),
    [data],
  )

  const handleRefresh = async () => {
    try {
      const result = await syncFinanzasCuentas()
      await refetch()
      toast.success(
        result.provider === 'interbanking'
          ? `Sincronizado con Interbanking (${result.synced} CC)`
          : `Saldos actualizados (${result.synced} cuentas del proveedor)`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron actualizar los saldos')
    }
  }

  const handleSaveManualSaldo = async (input: string) => {
    if (!manualCuenta) return
    const centavos = parseUsdInputToCentavos(input)
    if (centavos === null) {
      toast.error('Ingresá un monto válido')
      return
    }
    setSavingManual(true)
    try {
      await patchFinanzasSaldoManual(manualCuenta.id, centavos)
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'cuentas'] })
      toast.success('Saldo USD guardado')
      setManualCuenta(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSavingManual(false)
    }
  }

  return (
    <>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Saldos bancarios
          </h1>
          <p className="text-body-muted mt-2 max-w-2xl text-sm">
            Posición consolidada por moneda (pesos y dólares por separado), alineada al mail diario
            de finanzas. Las cuentas corrientes se sincronizan con Interbanking; los saldos en USD
            se cargan a mano.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isFetching}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
          Actualizar
        </button>
      </header>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {error instanceof Error ? error.message : 'Error al cargar las cuentas'}
          </p>
        </div>
      ) : data ? (
        <div className="space-y-8">
          <AccountsSummary
            arsCentavos={data.totales.arsCentavos}
            usdCentavos={data.totales.usdCentavos}
            onSelectMoneda={(moneda) => setDetalle({ moneda, bancoNombre: null })}
          />

          <BankPositionsSection
            rows={posicionPorBanco}
            onSelectPosicion={(bancoNombre, moneda) => setDetalle({ moneda, bancoNombre })}
          />

          <CashflowSection />

          <PositionHistorySection
            rows={historialQuery.data?.cierres ?? []}
            isLoading={historialQuery.isLoading}
            error={historialQuery.error}
          />

          <section aria-labelledby="finanzas-cuentas-heading" className="space-y-6">
            <div className="space-y-4">
              <h2
                id="finanzas-cuentas-heading"
                className="text-heading text-lg font-semibold tracking-tight"
              >
                Detalle por cuenta
              </h2>
              <SemaforoLegend />
            </div>

            {data.cuentas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-950/50">
                <p className="text-sm font-medium text-neutral-700 dark:text-gray-300">
                  No hay cuentas cargadas
                </p>
                <p className="text-body-muted mx-auto mt-2 max-w-md text-sm">
                  Ejecutá «Actualizar» para sincronizar las CC con Interbanking o el seed de
                  Finanzas en el emulador.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {gruposPorBanco.map((grupo) => (
                  <div key={grupo.bancoNombre} className="space-y-4">
                    <h3 className="text-heading border-b border-neutral-200 pb-2 text-base font-semibold dark:border-zinc-800">
                      {grupo.bancoNombre}
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {grupo.cuentas.map((cuenta) => (
                        <AccountCard
                          key={cuenta.id}
                          cuenta={cuenta}
                          canEditManualSaldo={canEditManual && cuenta.origenSaldo === 'manual'}
                          onEditManualSaldo={() => setManualCuenta(cuenta)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      <AccountsDetailModal
        open={detalle != null}
        cuentas={data?.cuentas ?? []}
        moneda={detalle?.moneda ?? 'ARS'}
        bancoNombre={detalle?.bancoNombre}
        canEditManual={canEditManual}
        onClose={() => setDetalle(null)}
        onEditManual={setManualCuenta}
      />
      <ManualSaldoModal
        cuenta={manualCuenta}
        open={manualCuenta != null}
        saving={savingManual}
        onClose={() => setManualCuenta(null)}
        onSave={(input) => void handleSaveManualSaldo(input)}
      />
    </>
  )
}
