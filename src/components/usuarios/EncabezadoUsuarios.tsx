export type PanelUsuarios = 'registered' | 'pending_setup' | 'external_approval'

export function EncabezadoUsuarios({
  total,
  cargando,
  mostrarPendientes,
  cuentasPendientes,
  panel,
  onPanel,
}: {
  total: number
  cargando: boolean
  mostrarPendientes: boolean
  cuentasPendientes: number | null
  panel: PanelUsuarios
  onPanel: (panel: PanelUsuarios) => void
}) {
  const textoCuentas =
    cuentasPendientes === null ? 'Cuentas pendientes' : `Cuentas pendientes (${cuentasPendientes})`

  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-primary-muted)] bg-[var(--color-primary-light)] px-4 py-3">
      <button
        type="button"
        onClick={() => onPanel('registered')}
        className="min-w-0 text-left text-lg font-semibold text-[var(--color-primary)]"
      >
        Usuarios{cargando ? '' : ` (${total})`}
      </button>
      {mostrarPendientes && (
        <div className="flex min-w-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPanel('external_approval')}
            aria-current={panel === 'external_approval' ? 'page' : undefined}
            className={claseAcceso(panel === 'external_approval')}
          >
            {textoCuentas}
          </button>
          <button
            type="button"
            onClick={() => onPanel('pending_setup')}
            aria-current={panel === 'pending_setup' ? 'page' : undefined}
            className={claseAcceso(panel === 'pending_setup')}
          >
            Configuración pendiente
          </button>
        </div>
      )}
    </div>
  )
}

function claseAcceso(activo: boolean): string {
  return activo
    ? 'rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white'
    : 'rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] hover:bg-white/70 dark:hover:bg-white/10'
}
