import { Building2, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import type { FinanzasCuenta, FinanzasMoneda } from '../../services/finanzasApi'
import { AccountCard } from './AccountCard'
import { groupCuentasByBanco } from './finanzasAggregates'
import { formatMoneyCentavos } from './formatMoney'
import { SemaforoLegend } from './SemaforoLegend'

interface AccountsDetailModalProps {
  open: boolean
  cuentas: FinanzasCuenta[]
  moneda: FinanzasMoneda
  bancoNombre?: string | null
  canEditManual: boolean
  canEditDescubierto: boolean
  onClose: () => void
  onEditManual: (cuenta: FinanzasCuenta) => void
  onEditDescubierto: (cuenta: FinanzasCuenta) => void
}

export function AccountsDetailModal({
  open,
  cuentas,
  moneda,
  bancoNombre,
  canEditManual,
  canEditDescubierto,
  onClose,
  onEditManual,
  onEditDescubierto,
}: AccountsDetailModalProps) {
  const filtradas = useMemo(
    () =>
      cuentas.filter(
        (cuenta) =>
          cuenta.moneda === moneda && (!bancoNombre || cuenta.bancoNombre === bancoNombre),
      ),
    [bancoNombre, cuentas, moneda],
  )
  const grupos = useMemo(() => groupCuentasByBanco(filtradas), [filtradas])
  // El ancho sigue a la cantidad de cuentas por banco: con una sola cuenta no sobra espacio a la derecha.
  const maxPorBanco = grupos.reduce((max, grupo) => Math.max(max, grupo.cuentas.length), 0)
  const anchoVentana = maxPorBanco <= 1 ? 'max-w-md' : maxPorBanco === 2 ? 'max-w-3xl' : 'max-w-6xl'
  const columnasCuentas =
    maxPorBanco <= 1 ? 'grid-cols-1' : maxPorBanco === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'
  const total = useMemo(
    () => filtradas.reduce((acc, cuenta) => acc + cuenta.saldoActualCentavos, 0),
    [filtradas],
  )

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open])

  if (!open) return null

  const monedaLabel = moneda === 'ARS' ? 'pesos' : 'dólares'
  const titulo = bancoNombre
    ? `${bancoNombre} · cuentas en ${monedaLabel}`
    : `Detalle de cuentas en ${monedaLabel}`

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar detalle"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cuentas-detail-title"
        className={`relative flex max-h-[92vh] w-full ${anchoVentana} flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-zinc-900`}
      >
        <header className="flex items-start justify-between gap-5 border-b border-neutral-200 px-6 py-5 dark:border-zinc-800">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="cuentas-detail-title" className="truncate text-xl font-semibold text-heading">
                {titulo}
              </h2>
              <p className="mt-1 text-sm text-body-muted">
                {filtradas.length} {filtradas.length === 1 ? 'cuenta' : 'cuentas'} · Total{' '}
                <span className="font-semibold text-heading">
                  {formatMoneyCentavos(total, moneda)}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-xl p-2 text-body-muted transition hover:bg-neutral-100 hover:text-heading dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5">
          {moneda === 'ARS' ? <SemaforoLegend /> : null}

          {grupos.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-zinc-700">
              <p className="font-medium text-heading">No hay cuentas en {monedaLabel}</p>
              <p className="mt-1 text-sm text-body-muted">
                No existen cuentas para este banco y moneda.
              </p>
            </div>
          ) : (
            <div className={`${moneda === 'ARS' ? 'mt-6' : ''} space-y-8`}>
              {grupos.map((grupo) => (
                <section key={grupo.bancoNombre} className="space-y-3">
                  {!bancoNombre ? (
                    <h3 className="border-b border-neutral-200 pb-2 text-base font-semibold text-heading dark:border-zinc-800">
                      {grupo.bancoNombre}
                    </h3>
                  ) : null}
                  <div className={`grid gap-4 ${columnasCuentas}`}>
                    {grupo.cuentas.map((cuenta) => (
                      <AccountCard
                        key={cuenta.id}
                        cuenta={cuenta}
                        canEditManualSaldo={
                          canEditManual && cuenta.origenSaldo === 'manual'
                        }
                        onEditManualSaldo={() => onEditManual(cuenta)}
                        canEditDescubierto={canEditDescubierto}
                        onEditDescubierto={() => onEditDescubierto(cuenta)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
