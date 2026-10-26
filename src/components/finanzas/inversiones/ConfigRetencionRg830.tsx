import { Info, Scale } from 'lucide-react'
import { ConfigAviso, ConfigTarjeta } from './ConfigTarjeta'
import { ConfigInputSufijo } from './ConfigCampo'

type ConfigRetencionRg830Props = {
  retencionActiva: boolean
  alicuotaInscriptoPct: string
  alicuotaNoInscriptoPct: string
  minimoNoSujeto: string
  soloLectura: boolean
  onActiva: (activa: boolean) => void
  onAlicuotaInscripto: (v: string) => void
  onAlicuotaNoInscripto: (v: string) => void
  onMinimoNoSujeto: (v: string) => void
}

/** Sección visual de Retención de Ganancias (RG 830). */
export function ConfigRetencionRg830({
  retencionActiva,
  alicuotaInscriptoPct,
  alicuotaNoInscriptoPct,
  minimoNoSujeto,
  soloLectura,
  onActiva,
  onAlicuotaInscripto,
  onAlicuotaNoInscripto,
  onMinimoNoSujeto,
}: ConfigRetencionRg830Props) {
  return (
    <ConfigTarjeta
      tono="emerald"
      icono={Scale}
      titulo="Retención de Ganancias (RG 830)"
      descripcion="Define si se retiene Impuesto a las Ganancias sobre los intereses que pagamos a inversores."
    >
      <div className="space-y-4">
        <button
          type="button"
          role="switch"
          aria-checked={retencionActiva}
          disabled={soloLectura}
          onClick={() => onActiva(!retencionActiva)}
          className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
            retencionActiva
              ? 'border-emerald-300 bg-emerald-100/80 dark:border-emerald-800 dark:bg-emerald-950/50'
              : 'border-neutral-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'
          }`}
        >
          <div className="min-w-0">
            <p className="text-heading text-sm font-semibold">Retener Ganancias en cada cuota</p>
            <p
              className={`mt-0.5 text-sm font-medium ${
                retencionActiva ? 'text-emerald-700 dark:text-emerald-300' : 'text-body-muted'
              }`}
            >
              {retencionActiva ? 'Activa — se retiene en cada cuota' : 'Inactiva'}
            </p>
          </div>
          <span
            className={`relative inline-flex h-8 w-14 shrink-0 rounded-full transition ${
              retencionActiva ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-zinc-600'
            }`}
            aria-hidden
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
                retencionActiva ? 'left-7' : 'left-1'
              }`}
            />
          </span>
        </button>

        <ConfigAviso tono="sky" icono={Info}>
          Si está activa, a cada pago de intereses se le descuenta la retención y en la Agenda queda el
          neto. Las alícuotas las define Finanzas con el contador.
        </ConfigAviso>

        <div
          className={`overflow-hidden rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 ${
            retencionActiva ? '' : 'opacity-50'
          }`}
        >
          <table className="w-full table-fixed text-sm">
            <thead className="bg-emerald-100/80 dark:bg-emerald-950/60">
              <tr>
                <th className="text-heading w-[45%] px-3 py-2.5 text-left text-xs font-semibold">
                  Concepto
                </th>
                <th className="text-heading px-3 py-2.5 text-left text-xs font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody className="bg-white/70 dark:bg-zinc-900/40">
              <tr className="border-t border-emerald-100 dark:border-emerald-900/40">
                <td className="text-body-muted px-3 py-3 align-middle">Alícuota inscriptos</td>
                <td className="min-w-0 px-3 py-2">
                  <ConfigInputSufijo
                    id="cfg-ali-si"
                    type="text"
                    inputMode="decimal"
                    value={alicuotaInscriptoPct}
                    disabled={soloLectura}
                    onChange={(e) => onAlicuotaInscripto(e.target.value)}
                    placeholder="Ej.: 3"
                    sufijo="%"
                    aria-label="Alícuota inscriptos"
                  />
                </td>
              </tr>
              <tr className="border-t border-emerald-100 dark:border-emerald-900/40">
                <td className="text-body-muted px-3 py-3 align-middle">Alícuota no inscriptos</td>
                <td className="min-w-0 px-3 py-2">
                  <ConfigInputSufijo
                    id="cfg-ali-no"
                    type="text"
                    inputMode="decimal"
                    value={alicuotaNoInscriptoPct}
                    disabled={soloLectura}
                    onChange={(e) => onAlicuotaNoInscripto(e.target.value)}
                    placeholder="Ej.: 35"
                    sufijo="%"
                    aria-label="Alícuota no inscriptos"
                  />
                </td>
              </tr>
              <tr className="border-t border-emerald-100 dark:border-emerald-900/40">
                <td className="text-body-muted px-3 py-3 align-middle">
                  Mínimo no sujeto
                  <span className="mt-0.5 block text-xs opacity-80">(opcional)</span>
                </td>
                <td className="min-w-0 px-3 py-2">
                  <ConfigInputSufijo
                    id="cfg-minimo"
                    type="text"
                    inputMode="decimal"
                    value={minimoNoSujeto}
                    disabled={soloLectura}
                    onChange={(e) => onMinimoNoSujeto(e.target.value)}
                    placeholder="Ej.: 1.000,00"
                    sufijo="$"
                    aria-label="Mínimo no sujeto"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ConfigTarjeta>
  )
}
