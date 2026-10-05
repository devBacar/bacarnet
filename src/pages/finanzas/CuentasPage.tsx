import { useQuery, useQueryClient } from '@tanstack/react-query'

import { RefreshCw } from 'lucide-react'

import { useMemo, useState } from 'react'

import toast from 'react-hot-toast'

import { AccountsDetailModal } from '../../components/finanzas/AccountsDetailModal'
import { CashflowSection } from '../../components/finanzas/CashflowSection'
import { DescubiertoModal } from '../../components/finanzas/DescubiertoModal'
import { NuevaTransferenciaModal } from '../../components/finanzas/NuevaTransferenciaModal'
import { PosicionResumen } from '../../components/finanzas/PosicionResumen'
import { TransferirDesdeCuentaContext } from '../../components/finanzas/transferirDesdeCuenta'
import { PositionHistorySection } from '../../components/finanzas/PositionHistorySection'

import { computePosicionPorBanco } from '../../components/finanzas/finanzasAggregates'

import {
  ManualSaldoModal,
  parseUsdInputToCentavos,
} from '../../components/finanzas/ManualSaldoModal'

import { usePermisosFinanzas } from '../../components/finanzas/permisosFinanzas'

import { useAuth } from '../../context'

import {
  fetchFinanzasCuentas,
  fetchFinanzasPosicionHistorial,
  patchFinanzasDescubierto,
  patchFinanzasSaldoManual,
  syncFinanzasCuentas,
  type FinanzasCuenta,
  type FinanzasMoneda,
} from '../../services/finanzasApi'


export function FinanzasCuentasPage() {
  const { user } = useAuth()

  const permisos = usePermisosFinanzas()
  const queryClient = useQueryClient()
  const [manualCuenta, setManualCuenta] = useState<FinanzasCuenta | null>(null)
  const [savingManual, setSavingManual] = useState(false)
  const [descubiertoCuenta, setDescubiertoCuenta] = useState<FinanzasCuenta | null>(null)
  const [savingDescubierto, setSavingDescubierto] = useState(false)
  const [detalle, setDetalle] = useState<{
    moneda: FinanzasMoneda
    bancoNombre: string | null
  } | null>(null)
  const [transferirCuentaId, setTransferirCuentaId] = useState<string | null>(null)

  const canEditManual = permisos.saldos
  const canEditDescubierto = permisos.saldos
  const puedeTransferir = permisos.transferencias

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: Boolean(user),
    // Relee los saldos guardados; no dispara un sync con Interbanking.
    refetchInterval: 60_000,
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

  const handleSaveDescubierto = async (body: {
    descubiertoCentavos: number | null
    vigenteDesde: string | null
  }) => {
    if (!descubiertoCuenta) return
    setSavingDescubierto(true)
    try {
      await patchFinanzasDescubierto(descubiertoCuenta.id, body)
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'cuentas'] })
      toast.success(body.descubiertoCentavos == null ? 'Descubierto quitado' : 'Descubierto guardado')
      setDescubiertoCuenta(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el descubierto')
    } finally {
      setSavingDescubierto(false)
    }
  }

  return (
    <TransferirDesdeCuentaContext.Provider value={puedeTransferir ? setTransferirCuentaId : null}>
    <>
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-heading text-2xl font-bold tracking-tight">Saldos bancarios</h1>
          <p className="text-body-muted mt-1 max-w-2xl text-sm">
            Los pesos se actualizan solos desde Interbanking; los dólares se cargan a mano.
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
        <div className="space-y-4">
          <div className="grid items-start gap-4">
            {/* La posición va a lo ancho: la tabla por banco no entra en media columna. */}
            {data.cuentas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center dark:border-zinc-700 dark:bg-zinc-950/50">
                <p className="text-sm font-medium text-neutral-700 dark:text-gray-300">
                  No hay cuentas cargadas
                </p>
                <p className="text-body-muted mt-1 text-xs">
                  Tocá «Actualizar» para traer las cuentas desde Interbanking.
                </p>
              </div>
            ) : (
              <PosicionResumen
                arsCentavos={data.totales.arsCentavos}
                usdCentavos={data.totales.usdCentavos}
                bancos={posicionPorBanco}
                cuentas={data.cuentas}
                onSelect={(moneda, bancoNombre) => setDetalle({ moneda, bancoNombre })}
                onTransferir={puedeTransferir ? setTransferirCuentaId : undefined}
              />
            )}
            <PositionHistorySection
              rows={historialQuery.data?.cierres ?? []}
              isLoading={historialQuery.isLoading}
              error={historialQuery.error}
            />
          </div>

          <CashflowSection />
        </div>
      ) : null}

      <AccountsDetailModal
        open={detalle != null}
        cuentas={data?.cuentas ?? []}
        moneda={detalle?.moneda ?? 'ARS'}
        bancoNombre={detalle?.bancoNombre}
        canEditManual={canEditManual}
        canEditDescubierto={canEditDescubierto}
        onClose={() => setDetalle(null)}
        onEditManual={setManualCuenta}
        onEditDescubierto={setDescubiertoCuenta}
      />
      <DescubiertoModal
        cuenta={descubiertoCuenta}
        open={descubiertoCuenta != null}
        saving={savingDescubierto}
        onClose={() => setDescubiertoCuenta(null)}
        onSave={(body) => void handleSaveDescubierto(body)}
      />
      <ManualSaldoModal
        cuenta={manualCuenta}
        open={manualCuenta != null}
        saving={savingManual}
        onClose={() => setManualCuenta(null)}
        onSave={(input) => void handleSaveManualSaldo(input)}
      />
      {puedeTransferir && transferirCuentaId ? (
        <NuevaTransferenciaModal
          cuentaOrigenId={transferirCuentaId}
          onClose={() => setTransferirCuentaId(null)}
        />
      ) : null}
    </>
    </TransferirDesdeCuentaContext.Provider>
  )
}
