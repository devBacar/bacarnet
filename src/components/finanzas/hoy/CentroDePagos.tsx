import type { CentroDePagosFila } from '../../../services/finanzasHoyApi'
import { Etiqueta, Monto, Tarjeta, Vacio } from './TarjetasHoy'

const MEDIO_LABEL = {
  transferencia: 'Por banco',
  efectivo: 'En efectivo',
  cheque: 'Con cheque',
} as const

function formatoFecha(ymd: string): string {
  const [anio, mes, dia] = ymd.split('-').map(Number)
  if (!anio || !mes || !dia) return ymd
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(anio, mes - 1, dia)))
}

function detalleFila(fila: CentroDePagosFila): string {
  const partes = [fila.concepto, MEDIO_LABEL[fila.medioPago]]
  if (fila.chequeEmitido) {
    partes.push(fila.chequeNumero ? `cheque N.º ${fila.chequeNumero}` : 'cheque emitido')
  }
  if (fila.fechaVencimiento) partes.push(`vence ${formatoFecha(fila.fechaVencimiento)}`)
  else partes.push('sin fecha de pago')
  return partes.join(' · ')
}

function Total({ centavos }: { centavos: number }) {
  return (
    <p className="text-brand-primary text-[13px]">
      Total <Monto centavos={centavos} className="text-brand-primary" />
    </p>
  )
}

export function CentroDePagos({
  filas,
  totalCentavos,
}: {
  filas: CentroDePagosFila[]
  totalCentavos: number
}) {
  return (
    <Tarjeta
      tour="hoy-centro-pagos"
      titulo="Centro de pagos"
      derecha={filas.length > 0 ? <Total centavos={totalCentavos} /> : undefined}
      ayuda="Todo lo que hay que pagar, junto y ordenado por vencimiento. Lo más atrasado aparece primero. Las tarjetas de arriba siguen igual."
    >
      {filas.length === 0 ? (
        <Vacio texto="No hay pagos pendientes en el horizonte." />
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-zinc-800">
          {filas.map((fila) => (
            <li key={fila.id} className="flex items-start gap-2 py-2 text-[15px]">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-heading break-words font-medium">{fila.aQuien}</span>
                  {fila.estaAtrasado ? <Etiqueta tono="rojo">Atrasado</Etiqueta> : null}
                  {fila.aviso ? <Etiqueta tono="ambar">Cheque emitido</Etiqueta> : null}
                </p>
                <p className="text-body-muted break-words text-[13px]">{detalleFila(fila)}</p>
                {fila.aviso ? (
                  <p className="mt-0.5 text-[13px] font-medium text-amber-800 dark:text-amber-300">{fila.aviso}</p>
                ) : null}
              </div>
              <Monto centavos={fila.montoCentavos} className="text-heading shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}
