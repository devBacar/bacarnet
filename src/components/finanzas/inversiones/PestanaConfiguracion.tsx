import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Bell, CalendarDays, Percent } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context'
import {
  fetchConfigInversiones,
  guardarConfigInversiones,
  type BaseDias,
  type ConfigInversiones,
  type Penalidad,
} from '../../../services/finanzasInversionesApi'
import { usePermisosFinanzas } from '../permisosFinanzas'
import { parseMontoEsArACentavos } from '../montoEsAr'
import { ConfigCampo, ConfigGrilla, ConfigInputSufijo, ConfigSelect } from './ConfigCampo'
import { ConfigAviso, ConfigTarjeta } from './ConfigTarjeta'
import { ConfigRetencionRg830 } from './ConfigRetencionRg830'

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

function formIgual(a: FormState, b: FormState): boolean {
  return (
    a.baseDiasDefault === b.baseDiasDefault &&
    a.penalidadTipo === b.penalidadTipo &&
    a.penalidadPct === b.penalidadPct &&
    a.penalidadMonto === b.penalidadMonto &&
    a.topeIntereses === b.topeIntereses &&
    a.diasAvisoPorVencer === b.diasAvisoPorVencer &&
    a.horizonteMesesSinVencimiento === b.horizonteMesesSinVencimiento &&
    a.retencionActiva === b.retencionActiva &&
    a.alicuotaInscriptoPct === b.alicuotaInscriptoPct &&
    a.alicuotaNoInscriptoPct === b.alicuotaNoInscriptoPct &&
    a.minimoNoSujeto === b.minimoNoSujeto
  )
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

  const hayCambios = useMemo(() => {
    if (!form || !data) return false
    return !formIgual(form, deConfig(data))
  }, [form, data])

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
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-24 sm:pb-6">
      {!editable ? (
        <ConfigAviso tono="amber" icono={AlertTriangle}>
          Solo el Líder de Finanzas cambia la configuración.
        </ConfigAviso>
      ) : null}

      <ConfigTarjeta
        tono="sky"
        icono={CalendarDays}
        titulo="Base de días"
        descripcion="Cómo se cuentan los días al calcular intereses en las inversiones nuevas."
      >
        <ConfigCampo
          label="Base de días"
          htmlFor="cfg-base"
          ayuda="Se usa como valor por defecto al crear una inversión."
        >
          <ConfigSelect
            id="cfg-base"
            value={String(form.baseDiasDefault)}
            disabled={ro}
            onChange={(e) => {
              const v = e.target.value
              const base: BaseDias =
                v === '365' ? 365 : v === '360' ? 360 : v === '360_reales' ? '360_reales' : 'reales'
              set('baseDiasDefault', base)
            }}
          >
            <option value="365">365 días</option>
            <option value="360">360 con meses de 30 días</option>
            <option value="360_reales">360 con días reales</option>
            <option value="reales">Días reales</option>
          </ConfigSelect>
        </ConfigCampo>
      </ConfigTarjeta>

      <ConfigTarjeta
        tono="amber"
        icono={Percent}
        titulo="Penalidad por devolver antes"
        descripcion="Qué se descuenta si el inversor pide la plata antes de tiempo."
      >
        <ConfigGrilla>
          <ConfigCampo label="Tipo de penalidad" htmlFor="cfg-penalidad">
            <ConfigSelect
              id="cfg-penalidad"
              value={form.penalidadTipo}
              disabled={ro}
              onChange={(e) => set('penalidadTipo', e.target.value as TipoPenalidad)}
            >
              <option value="ninguna">Ninguna</option>
              <option value="porcentaje_interes">% del interés</option>
              <option value="porcentaje_capital">% del capital</option>
              <option value="monto_fijo">Monto fijo</option>
            </ConfigSelect>
          </ConfigCampo>

          {form.penalidadTipo === 'porcentaje_interes' || form.penalidadTipo === 'porcentaje_capital' ? (
            <ConfigCampo
              label="Porcentaje"
              htmlFor="cfg-penalidad-pct"
              ayuda="Sobre el interés o el capital, según el tipo elegido."
            >
              <ConfigInputSufijo
                id="cfg-penalidad-pct"
                type="text"
                inputMode="decimal"
                value={form.penalidadPct}
                disabled={ro}
                onChange={(e) => set('penalidadPct', e.target.value)}
                placeholder="Ej.: 10"
                sufijo="%"
              />
            </ConfigCampo>
          ) : null}

          {form.penalidadTipo === 'monto_fijo' ? (
            <ConfigCampo label="Monto fijo" htmlFor="cfg-penalidad-monto">
              <ConfigInputSufijo
                id="cfg-penalidad-monto"
                type="text"
                inputMode="decimal"
                value={form.penalidadMonto}
                disabled={ro}
                onChange={(e) => set('penalidadMonto', e.target.value)}
                placeholder="Ej.: 10.000,00"
                sufijo="$"
              />
            </ConfigCampo>
          ) : null}
        </ConfigGrilla>

        {form.penalidadTipo !== 'ninguna' ? (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={form.topeIntereses}
              disabled={ro}
              onChange={(e) => set('topeIntereses', e.target.checked)}
              className="mt-0.5 rounded border-neutral-300"
            />
            <span>
              <span className="text-heading font-medium">No puede superar los intereses</span>
              <span className="text-body-muted mt-0.5 block text-xs">
                La penalidad se corta si llega al monto de intereses acumulados.
              </span>
            </span>
          </label>
        ) : null}
      </ConfigTarjeta>

      <ConfigTarjeta
        tono="violet"
        icono={Bell}
        titulo="Avisos y horizonte"
        descripcion="Cuándo avisar vencimientos y hasta dónde proyectar inversiones sin fecha de devolución."
      >
        <ConfigGrilla>
          <ConfigCampo
            label="Días de aviso por vencer"
            htmlFor="cfg-dias-aviso"
            ayuda="Entre 0 y 365. Marca las cuotas que están por vencer."
          >
            <ConfigInputSufijo
              id="cfg-dias-aviso"
              type="number"
              min={0}
              max={365}
              value={form.diasAvisoPorVencer}
              disabled={ro}
              onChange={(e) => set('diasAvisoPorVencer', e.target.value)}
              sufijo="días"
            />
          </ConfigCampo>

          <ConfigCampo
            label="Meses hacia adelante"
            htmlFor="cfg-horizonte"
            ayuda="Para inversiones sin fecha de devolución (entre 1 y 60)."
          >
            <ConfigInputSufijo
              id="cfg-horizonte"
              type="number"
              min={1}
              max={60}
              value={form.horizonteMesesSinVencimiento}
              disabled={ro}
              onChange={(e) => set('horizonteMesesSinVencimiento', e.target.value)}
              sufijo="meses"
            />
          </ConfigCampo>
        </ConfigGrilla>
      </ConfigTarjeta>

      <ConfigRetencionRg830
        retencionActiva={form.retencionActiva}
        alicuotaInscriptoPct={form.alicuotaInscriptoPct}
        alicuotaNoInscriptoPct={form.alicuotaNoInscriptoPct}
        minimoNoSujeto={form.minimoNoSujeto}
        soloLectura={ro}
        onActiva={(v) => set('retencionActiva', v)}
        onAlicuotaInscripto={(v) => set('alicuotaInscriptoPct', v)}
        onAlicuotaNoInscripto={(v) => set('alicuotaNoInscriptoPct', v)}
        onMinimoNoSujeto={(v) => set('minimoNoSujeto', v)}
      />

      {errorLocal ? <p className="text-danger text-sm">{errorLocal}</p> : null}
      {okMsg ? (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{okMsg}</p>
      ) : null}

      {editable ? (
        <div className="sticky bottom-0 z-10 -mx-1 border-t border-neutral-200/80 bg-white/95 px-1 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none dark:sm:bg-transparent">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando}
              className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar configuración'}
            </button>
            {hayCambios ? (
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Cambios sin guardar
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
