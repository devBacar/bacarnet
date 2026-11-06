import { Lightbulb } from 'lucide-react'
import type { SugerenciaInteres } from '../../../services/finanzasChequesApi'
import { formatMoneyCentavos } from '../formatMoney'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function nombreMes(mesBase: string | null): string {
  if (!mesBase) return ''
  const [anio, mes] = mesBase.split('-')
  return `${MESES[Number(mes) - 1] ?? mes} de ${anio}`
}

const porcentaje = (p: number) => `${p.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`

/** Etiqueta corta para la fila de la lista. */
export function etiquetaInteresSugerido(s: SugerenciaInteres): string {
  if (s.forma === 'mes_vencimiento') return `Interés ${porcentaje(s.tasaPorcentaje)} s/ ${nombreMes(s.mesBase).split(' ')[0]}`
  return `Interés ${porcentaje(s.tasaPorcentaje)} s/ mismo vto.`
}

/**
 * Recuadro del detalle de un cheque de interés pagado aparte: sobre qué cheques del proveedor parece calculado.
 * Es solo una sugerencia: el monto da justo con esa tasa, pero lo confirma quien negoció.
 */
export function InteresSugerido({
  sugerencia: s,
  numeroCheque,
  montoCentavos,
}: {
  sugerencia: SugerenciaInteres
  numeroCheque: string
  montoCentavos: number
}) {
  const propio = s.porCheque.find((p) => p.numeroCheque === numeroCheque)

  return (
    <div className="mt-4 rounded-lg border border-violet-300 bg-violet-50 p-3 text-sm text-violet-950 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-100">
      <p className="flex items-center gap-1.5 font-medium">
        <Lightbulb className="h-4 w-4" />
        {s.forma === 'mes_vencimiento'
          ? `Parece interés del ${porcentaje(s.tasaPorcentaje)} mensual sobre lo que vence en ${nombreMes(s.mesBase)}`
          : `Parece interés del ${porcentaje(s.tasaPorcentaje)} sobre el capital que vence el mismo día`}
      </p>

      {s.forma === 'mes_vencimiento' ? (
        <p className="mt-1 text-xs">
          {formatMoneyCentavos(s.baseCentavos, 'ARS')} en {s.cantidadChequesBase} cheques ×{' '}
          {porcentaje(s.tasaPorcentaje)} = {formatMoneyCentavos(montoCentavos * (s.chequesPorMes ?? 1), 'ARS')} por mes, pagado en{' '}
          {s.chequesPorMes} {s.chequesPorMes === 1 ? 'cheque' : 'cheques'} por mes durante {s.meses}{' '}
          {s.meses === 1 ? 'mes' : 'meses'} ({s.chequesInteres.length} cheques de interés en total).
        </p>
      ) : propio ? (
        <p className="mt-1 text-xs">
          Este cheque vence el {formatFecha(propio.fechaVencimiento)}, igual que {formatMoneyCentavos(propio.baseCentavos, 'ARS')} de la
          operación del {formatFecha(propio.operacion.fechaEmision)}: {formatMoneyCentavos(propio.baseCentavos, 'ARS')} ×{' '}
          {porcentaje(s.tasaPorcentaje)} = {formatMoneyCentavos(montoCentavos, 'ARS')}.
        </p>
      ) : null}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-violet-800 dark:text-violet-300">
              <th className="py-1 pr-2 font-medium">Emisión</th>
              <th className="py-1 pr-2 font-medium">OBS de la operación</th>
              <th className="py-1 pr-2 text-right font-medium">Cheques</th>
              <th className="py-1 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {s.operaciones.map((op) => (
              <tr key={`${op.fechaEmision}|${op.obs}`} className="border-t border-violet-200 dark:border-violet-800">
                <td className="whitespace-nowrap py-1 pr-2">{formatFecha(op.fechaEmision)}</td>
                <td className="max-w-[260px] truncate py-1 pr-2" title={op.obs}>{op.obs || '—'}</td>
                <td className="py-1 pr-2 text-right">{op.cantidadCheques}</td>
                <td className="whitespace-nowrap py-1 text-right">{formatMoneyCentavos(op.montoCentavos, 'ARS')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-violet-800 dark:text-violet-300">
        Es una sugerencia: el monto da justo con esa tasa. Confirmalo con quien negoció la operación.
      </p>
    </div>
  )
}
