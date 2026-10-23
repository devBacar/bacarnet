import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useAuth } from '../../../context'
import {
  fetchConfigInversiones,
  guardarConfigInversiones,
  type BaseDias,
  type ConfigInversiones,
  type Penalidad,
} from '../../../services/finanzasInversionesApi'
import { usePermisosFinanzas } from '../permisosFinanzas'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { parseMontoEsArACentavos } from '../montoEsAr'

type TipoPenalidad = Penalidad['tipo']

type FormState = {
  baseDiasDefault: BaseDias
  penalidadTipo: TipoPenalidad
  penalidadPct: string
  penalidadMonto: string
  topeIntereses: boolean
  diasAvisoPorVencer: string
  horizonteMesesSinVencimiento: string
  retencionActiva: boolean
  alicuotaInscriptoPct: string
  alicuotaNoInscriptoPct: string
  minimoNoSujeto: string
}

function centavosATexto(centavos: number | null | undefined): string {
  if (centavos == null) return ''
  return (centavos / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numATexto(n: number | null | undefined): string {
  if (n == null) return ''
  return String(n)
}

function deConfig(c: ConfigInversiones): FormState {
  const p = c.penalidadDefault
  return {
    baseDiasDefault: c.baseDiasDefault,
    penalidadTipo: p.tipo,
    penalidadPct:
      p.tipo === 'porcentaje_interes' || p.tipo === 'porcentaje_capital' ? String(p.valorPct) : '',
    penalidadMonto: p.tipo === 'monto_fijo' ? centavosATexto(p.montoCentavos) : '',
    topeIntereses: p.tipo !== 'ninguna' && p.topeIntereses === true,
    diasAvisoPorVencer: String(c.diasAvisoPorVencer),
    horizonteMesesSinVencimiento: String(c.horizonteMesesSinVencimiento),
    retencionActiva: c.retencionGanancias.activa,
    alicuotaInscriptoPct: numATexto(c.retencionGanancias.alicuotaInscriptoPct),
    alicuotaNoInscriptoPct: numATexto(c.retencionGanancias.alicuotaNoInscriptoPct),
    minimoNoSujeto: centavosATexto(c.retencionGanancias.minimoNoSujetoCentavos),
  }
}

function parsePctOpcional(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return n
}

function armarPenalidad(form: FormState): Penalidad | { error: string } {
  if (form.penalidadTipo === 'ninguna') return { tipo: 'ninguna' }
  const tope = form.topeIntereses ? { topeIntereses: true as const } : {}
  if (form.penalidadTipo === 'monto_fijo') {
    const montoCentavos = parseMontoEsArACentavos(form.penalidadMonto)
    if (montoCentavos == null) return { error: 'Poné el monto de la penalidad (en pesos).' }
    return { tipo: 'monto_fijo', montoCentavos, ...tope }
  }
  const valorPct = parsePctOpcional(form.penalidadPct)
  if (valorPct == null) return { error: 'Poné el porcentaje de la penalidad.' }
  return { tipo: form.penalidadTipo, valorPct, ...tope }
}

function armarConfig(form: FormState): ConfigInversiones | { error: string } {
  const penalidad = armarPenalidad(form)
  if ('error' in penalidad) return penalidad

  const dias = Number.parseInt(form.diasAvisoPorVencer, 10)
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
    return { error: 'Los días de aviso tienen que ser un número entre 0 y 365.' }
  }
  const meses = Number.parseInt(form.horizonteMesesSinVencimiento, 10)
  if (!Number.isInteger(meses) || meses < 1 || meses > 60) {
    return { error: 'Los meses hacia adelante tienen que ser un número entre 1 y 60.' }
  }

  let minimoNoSujetoCentavos: number | null = null
  if (form.minimoNoSujeto.trim()) {
    minimoNoSujetoCentavos = parseMontoEsArACentavos(form.minimoNoSujeto)
    if (minimoNoSujetoCentavos == null) {
      return { error: 'El mínimo no sujeto no es un monto válido.' }
    }
  }

  const alicuotaInscriptoPct = parsePctOpcional(form.alicuotaInscriptoPct)
  const alicuotaNoInscriptoPct = parsePctOpcional(form.alicuotaNoInscriptoPct)
  if (form.alicuotaInscriptoPct.trim() && alicuotaInscriptoPct == null) {
    return { error: 'La alícuota para inscriptos no es válida.' }
  }
  if (form.alicuotaNoInscriptoPct.trim() && alicuotaNoInscriptoPct == null) {
    return { error: 'La alícuota para no inscriptos no es válida.' }
  }

  return {
    baseDiasDefault: form.baseDiasDefault,
    horizonteMesesSinVencimiento: meses,
    penalidadDefault: penalidad,
    diasAvisoPorVencer: dias,
    retencionGanancias: {
      activa: form.retencionActiva,
      alicuotaInscriptoPct,
      alicuotaNoInscriptoPct,
      minimoNoSujetoCentavos,
    },
  }
}

export function PestanaConfiguracion() {
  const { user } = useAuth()
  const { aprobarInversiones } = usePermisosFinanzas()
  const editable = aprobarInversiones

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['finanzas', 'inversiones', 'config'],
    queryFn: fetchConfigInversiones,
    enabled: Boolean(user),
  })

  const [form, setForm] = useState<FormState | null>(null)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (data) setForm(deConfig(data))
  }, [data])

  const set = <K extends keyof FormState>(clave: K, valor: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [clave]: valor } : prev))
    setOkMsg(null)
  }

  const guardar = async () => {
    if (!form || !editable) return
    setErrorLocal(null)
    setOkMsg(null)
    const config = armarConfig(form)
    if ('error' in config) {
      setErrorLocal(config.error)
      return
    }
    setGuardando(true)
    try {
      const guardada = await guardarConfigInversiones(config)
      setForm(deConfig(guardada))
      setOkMsg('Configuración guardada.')
      void refetch()
    } catch (e) {
      setErrorLocal(e instanceof Error ? e.message : 'No pude guardar la configuración')
    } finally {
      setGuardando(false)
    }
  }

  if (isError) {
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : 'No pude traer la configuración'}
      </p>
    )
  }

  if (isLoading || !form) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    )
  }

  const ro = !editable

  return (
    <div className="max-w-2xl space-y-6">
      {!editable ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Solo el Líder de Finanzas cambia la configuración.
        </p>
      ) : null}

      <FinanzasFormField label="Base de días" htmlFor="cfg-base">
        <select
          id="cfg-base"
          value={String(form.baseDiasDefault)}
          disabled={ro}
          onChange={(e) => {
            const v = e.target.value
            const base: BaseDias =
              v === '365' ? 365 : v === '360' ? 360 : v === '360_reales' ? '360_reales' : 'reales'
            set('baseDiasDefault', base)
          }}
          className={finanzasInputClass}
        >
          <option value="365">365 días</option>
          <option value="360">360 con meses de 30 días</option>
          <option value="360_reales">360 con días reales</option>
          <option value="reales">Días reales</option>
        </select>
      </FinanzasFormField>

      <div className="space-y-3">
        <FinanzasFormField label="Penalidad por devolver antes" htmlFor="cfg-penalidad">
          <select
            id="cfg-penalidad"
            value={form.penalidadTipo}
            disabled={ro}
            onChange={(e) => set('penalidadTipo', e.target.value as TipoPenalidad)}
            className={finanzasInputClass}
          >
            <option value="ninguna">Ninguna</option>
            <option value="porcentaje_interes">% del interés</option>
            <option value="porcentaje_capital">% del capital</option>
            <option value="monto_fijo">Monto fijo</option>
          </select>
        </FinanzasFormField>

        {form.penalidadTipo === 'porcentaje_interes' || form.penalidadTipo === 'porcentaje_capital' ? (
          <FinanzasFormField label="Porcentaje de la penalidad" htmlFor="cfg-penalidad-pct">
            <input
              id="cfg-penalidad-pct"
              type="text"
              inputMode="decimal"
              value={form.penalidadPct}
              disabled={ro}
              onChange={(e) => set('penalidadPct', e.target.value)}
              placeholder="Ej.: 10"
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        ) : null}

        {form.penalidadTipo === 'monto_fijo' ? (
          <FinanzasFormField label="Monto fijo de la penalidad ($)" htmlFor="cfg-penalidad-monto">
            <input
              id="cfg-penalidad-monto"
              type="text"
              inputMode="decimal"
              value={form.penalidadMonto}
              disabled={ro}
              onChange={(e) => set('penalidadMonto', e.target.value)}
              placeholder="Ej.: 10.000,00"
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        ) : null}

        {form.penalidadTipo !== 'ninguna' ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.topeIntereses}
              disabled={ro}
              onChange={(e) => set('topeIntereses', e.target.checked)}
              className="rounded border-neutral-300"
            />
            No puede superar los intereses
          </label>
        ) : null}
      </div>

      <FinanzasFormField label="Días de aviso por vencer" htmlFor="cfg-dias-aviso">
        <input
          id="cfg-dias-aviso"
          type="number"
          min={0}
          max={365}
          value={form.diasAvisoPorVencer}
          disabled={ro}
          onChange={(e) => set('diasAvisoPorVencer', e.target.value)}
          className={finanzasInputClass}
        />
      </FinanzasFormField>

      <FinanzasFormField
        label="Meses hacia adelante para las inversiones sin fecha de devolución"
        htmlFor="cfg-horizonte"
      >
        <input
          id="cfg-horizonte"
          type="number"
          min={1}
          max={60}
          value={form.horizonteMesesSinVencimiento}
          disabled={ro}
          onChange={(e) => set('horizonteMesesSinVencimiento', e.target.value)}
          className={finanzasInputClass}
        />
      </FinanzasFormField>

      <section className="rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
        <h3 className="text-heading text-sm font-semibold">Retención de Ganancias (RG 830)</h3>
        <p className="text-body-muted mt-2 text-xs">
          Si está activo, a cada pago de intereses se le descuenta la retención y en la Agenda queda el
          neto. Las alícuotas las define Finanzas con el contador.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.retencionActiva}
            disabled={ro}
            onChange={(e) => set('retencionActiva', e.target.checked)}
            className="rounded border-neutral-300"
          />
          Retenemos Ganancias sobre los intereses que pagamos
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FinanzasFormField label="Alícuota inscriptos (%)" htmlFor="cfg-ali-si" optional>
            <input
              id="cfg-ali-si"
              type="text"
              inputMode="decimal"
              value={form.alicuotaInscriptoPct}
              disabled={ro}
              onChange={(e) => set('alicuotaInscriptoPct', e.target.value)}
              placeholder="Ej.: 3"
              className={finanzasInputClass}
            />
          </FinanzasFormField>
          <FinanzasFormField label="Alícuota no inscriptos (%)" htmlFor="cfg-ali-no" optional>
            <input
              id="cfg-ali-no"
              type="text"
              inputMode="decimal"
              value={form.alicuotaNoInscriptoPct}
              disabled={ro}
              onChange={(e) => set('alicuotaNoInscriptoPct', e.target.value)}
              placeholder="Ej.: 35"
              className={finanzasInputClass}
            />
          </FinanzasFormField>
          <div className="sm:col-span-2">
            <FinanzasFormField label="Mínimo no sujeto ($)" htmlFor="cfg-minimo" optional>
              <input
                id="cfg-minimo"
                type="text"
                inputMode="decimal"
                value={form.minimoNoSujeto}
                disabled={ro}
                onChange={(e) => set('minimoNoSujeto', e.target.value)}
                placeholder="Ej.: 1.000,00"
                className={finanzasInputClass}
              />
            </FinanzasFormField>
          </div>
        </div>
      </section>

      {errorLocal ? <p className="text-danger text-sm">{errorLocal}</p> : null}
      {okMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{okMsg}</p> : null}

      {editable ? (
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando}
          className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar configuración'}
        </button>
      ) : null}
    </div>
  )
}
