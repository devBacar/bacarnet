import type { FinanzasCuenta } from '../../services/finanzasApi'
import { PosicionMonto } from './PosicionMonto'
import { formatMoneyCentavos } from './formatMoney'
import { ArrowRightLeft } from 'lucide-react'
import { useTransferirDesdeCuenta } from './transferirDesdeCuenta'

const SEMAFORO_LABEL = {
  verde: '🟢',
  amarillo: '🟡',
  rojo: '🔴',
} as const

interface AccountCardProps {
  cuenta: FinanzasCuenta
  /** false cuando la tarjeta va dentro de un grupo por banco */
  showBancoName?: boolean
  canEditManualSaldo?: boolean
  onEditManualSaldo?: () => void
  canEditDescubierto?: boolean
  onEditDescubierto?: () => void
}

function semaforoTexto(semaforo: keyof typeof SEMAFORO_LABEL): string {
  if (semaforo === 'verde') return 'Con margen'
  if (semaforo === 'amarillo') return 'Atención'
  return 'Superado'
}

function formatManualFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function AccountCard({
  cuenta,
  showBancoName = false,
  canEditManualSaldo = false,
  onEditManualSaldo,
  canEditDescubierto = false,
  onEditDescubierto,
}: AccountCardProps) {
  const transferir = useTransferirDesdeCuenta()
  const esCcPesos = cuenta.tipo === 'CC' && cuenta.moneda === 'ARS'
  const esCCInterbanking = esCcPesos && cuenta.origenSaldo === 'interbanking'
  const esManual = cuenta.origenSaldo === 'manual'
  const semaforo = cuenta.descubierto?.semaforo

  return (
    <article className="surface-card flex flex-col gap-4 rounded-2xl border border-neutral-200 p-5 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {showBancoName ? (
            <h3 className="text-heading text-lg font-semibold">{cuenta.bancoNombre}</h3>
          ) : null}
          <p className={`text-body-muted text-sm ${showBancoName ? 'mt-0.5' : ''}`}>
            <span className="text-heading font-medium">{cuenta.tipo}</span>
            <span className="mx-1.5 text-neutral-300 dark:text-zinc-600">·</span>
            {cuenta.tipoLabel}
          </p>
        </div>
        {esCCInterbanking && semaforo ? (
          <div className="flex items-center gap-2 text-sm" title={semaforoTexto(semaforo)}>
            <span className="text-xl leading-none" aria-hidden>
              {SEMAFORO_LABEL[semaforo]}
            </span>
            <span className="text-body-muted hidden sm:inline">Semáforo</span>
          </div>
        ) : null}
      </div>

      {esCcPesos && transferir ? (
        <button
          type="button"
          aria-label={`Transferir desde ${cuenta.bancoNombre}`}
          className="inline-flex w-fit items-center gap-1.5 self-start rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50 dark:border-zinc-700 dark:text-gray-100 dark:hover:bg-zinc-800"
          onClick={() => transferir(cuenta.id)}
        >
          <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Transferir
        </button>
      ) : null}

      <div>
        <p className="text-body-muted text-xs font-medium uppercase tracking-wide">Saldo actual</p>
        <div className="mt-1">
          <PosicionMonto centavos={cuenta.saldoActualCentavos} moneda={cuenta.moneda} size="md" />
        </div>
      </div>

      {esManual ? (
        <div className="border-t border-neutral-100 pt-4 text-sm dark:border-zinc-800">
          {cuenta.saldoActualizadoManualmenteEl ? (
            <p className="text-body-muted">
              Actualizado a mano el{' '}
              <span className="text-heading font-medium">
                {formatManualFecha(cuenta.saldoActualizadoManualmenteEl)}
              </span>
              {cuenta.saldoActualizadoManualmentePor ? (
                <>
                  {' '}
                  por{' '}
                  <span className="text-heading font-medium">
                    {cuenta.saldoActualizadoManualmentePor}
                  </span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-body-muted">Sin saldo cargado a mano todavía.</p>
          )}
          {canEditManualSaldo && onEditManualSaldo ? (
            <button
              type="button"
              className="mt-3 text-sm font-medium text-brand-primary hover:underline"
              onClick={onEditManualSaldo}
            >
              {cuenta.saldoActualizadoManualmenteEl ? 'Actualizar saldo' : 'Cargar saldo'}
            </button>
          ) : null}
        </div>
      ) : null}

      {esCCInterbanking ? (
        <dl className="grid gap-3 border-t border-neutral-100 pt-4 text-sm dark:border-zinc-800">
          <div className="flex justify-between gap-4">
            <dt className="text-body-muted">Descubierto</dt>
            <dd className="text-heading font-medium tabular-nums">
              {cuenta.descubiertoCentavos != null
                ? formatMoneyCentavos(cuenta.descubiertoCentavos, 'ARS')
                : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-body-muted">% del descubierto usado</dt>
            <dd className="text-heading font-medium tabular-nums">
              {cuenta.descubierto?.porcentajeUsado != null
                ? `${cuenta.descubierto.porcentajeUsado} %`
                : '—'}
              {cuenta.descubierto?.superado === true ? (
                <span className="ml-2 text-red-600 dark:text-red-400">(superado)</span>
              ) : null}
            </dd>
          </div>
          {cuenta.descubiertoVigenteDesde ? (
            <div className="flex justify-between gap-4">
              <dt className="text-body-muted">Acuerdo vigente desde</dt>
              <dd className="text-heading font-medium tabular-nums">
                {new Date(cuenta.descubiertoVigenteDesde).toLocaleDateString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                })}
              </dd>
            </div>
          ) : null}
          {cuenta.descubiertoActualizadoEl ? (
            <p className="text-body-muted text-xs">
              Cargado a mano el {formatManualFecha(cuenta.descubiertoActualizadoEl)}
              {cuenta.descubiertoActualizadoPor ? ` por ${cuenta.descubiertoActualizadoPor}` : ''}
            </p>
          ) : null}
          {canEditDescubierto && onEditDescubierto ? (
            <button
              type="button"
              className="justify-self-start text-sm font-medium text-brand-primary hover:underline"
              data-tour="saldos-cambiar-descubierto"
              onClick={onEditDescubierto}
            >
              {cuenta.descubiertoCentavos != null ? 'Cambiar descubierto' : 'Cargar descubierto'}
            </button>
          ) : null}
        </dl>
      ) : null}
    </article>
  )
}
