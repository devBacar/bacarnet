import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  crearInversion,
  editarInversion,
  enviarAAprobacion,
  fetchInversores,
  simularInversion,
  type BaseDias,
  type CondicionesInput,
  type InversionDetalle,
  type InversionInput,
  type MedioDevolucion,
  type MedioIngreso,
  type MonedaInversion,
  type Penalidad,
  type Periodicidad,
  type SimulacionResponse,
  type SistemaDevolucion,
} from '../../../services/finanzasInversionesApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import { parseMontoEsArACentavos } from '../montoEsAr'
import { FichaInversorModal } from './FichaInversorModal'
import { textoSistema } from './textosInversiones'

type Props =
  | { modo: 'nuevo'; onCerrar: () => void; onGuardado: (detalle: InversionDetalle) => void }
  | {
      modo: 'editar'
      inversionId: string
      inicial: InversionDetalle
      onCerrar: () => void
      onGuardado: (detalle: InversionDetalle) => void
    }

type TasaExpresada = 'mensual' | 'anual'
type TipoPenalidad = Penalidad['tipo'] | ''

type CuotaAMedidaUi = { fecha: string; capital: string; interes: string }

type FormState = {
  inversorId: string
  moneda: MonedaInversion
  capital: string
  fechaAlta: string
  sistema: SistemaDevolucion
  periodicidad: Periodicidad
  cantidadCuotas: string
  sinVencimiento: boolean
  tasaValor: string
  tasaExpresada: TasaExpresada
  baseDias: '' | '365' | '360' | '360_reales' | 'reales'
  medioIngresoPrevisto: MedioIngreso
  mediosDevolucion: MedioDevolucion[]
  penalidadTipo: TipoPenalidad
  penalidadPct: string
  penalidadMonto: string
  topeIntereses: boolean
  cuotasPrevias: string
  observaciones: string
  cuotasAMedida: CuotaAMedidaUi[]
}

const SISTEMAS: SistemaDevolucion[] = [
  'americano',
  'capitaliza',
  'frances',
  'aleman',
  'al_vencimiento',
  'a_medida',
]

const TEXTO_SISTEMA_FORM: Record<SistemaDevolucion, string> = {
  americano: 'Paga intereses por mes',
  capitaliza: 'Capitaliza',
  frances: 'Cuotas fijas',
  aleman: 'Capital igual en cada cuota',
  al_vencimiento: 'Todo al final',
  a_medida: 'A medida',
}

const PERIODICIDADES: { id: Periodicidad; texto: string }[] = [
  { id: 'mensual', texto: 'Mensual' },
  { id: 'bimestral', texto: 'Bimestral' },
  { id: 'trimestral', texto: 'Trimestral' },
  { id: 'cuatrimestral', texto: 'Cuatrimestral' },
  { id: 'semestral', texto: 'Semestral' },
  { id: 'anual', texto: 'Anual' },
]

const MEDIOS_DEV: { id: MedioDevolucion; texto: string }[] = [
  { id: 'transferencia_ars', texto: 'Transferencia en pesos' },
  { id: 'transferencia_usd', texto: 'Transferencia en dólares' },
  { id: 'efectivo', texto: 'Efectivo' },
  { id: 'cheque', texto: 'Cheque' },
]

function hoyLocal(): string {
  const f = new Date()
  const m = String(f.getMonth() + 1).padStart(2, '0')
  const d = String(f.getDate()).padStart(2, '0')
  return `${f.getFullYear()}-${m}-${d}`
}

function centavosATexto(centavos: number | null | undefined): string {
  if (centavos == null) return ''
  return (centavos / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatFecha(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

function vacio(): FormState {
  return {
    inversorId: '',
    moneda: 'ARS',
    capital: '',
    fechaAlta: hoyLocal(),
    sistema: 'americano',
    periodicidad: 'mensual',
    cantidadCuotas: '12',
    sinVencimiento: false,
    tasaValor: '',
    tasaExpresada: 'mensual',
    baseDias: '',
    medioIngresoPrevisto: 'transferencia',
    mediosDevolucion: ['transferencia_ars'],
    penalidadTipo: '',
    penalidadPct: '',
    penalidadMonto: '',
    topeIntereses: false,
    cuotasPrevias: '',
    observaciones: '',
    cuotasAMedida: [{ fecha: '', capital: '', interes: '' }],
  }
}

function deDetalle(d: InversionDetalle): FormState {
  const c = d.condiciones
  const tasa = c.tasa
  let tasaValor = ''
  let tasaExpresada: TasaExpresada = 'anual'
  if (tasa.tipo === 'fija') {
    if (tasa.expresada === 'mensual') {
      tasaExpresada = 'mensual'
      tasaValor = String(tasa.tnaPct / 12)
    } else {
      tasaExpresada = 'anual'
      tasaValor = String(tasa.tnaPct)
    }
  }
  const p = c.penalidadPrecancelacion
  let penalidadTipo: TipoPenalidad = ''
  let penalidadPct = ''
  let penalidadMonto = ''
  let topeIntereses = false
  if (p) {
    penalidadTipo = p.tipo
    if (p.tipo === 'porcentaje_interes' || p.tipo === 'porcentaje_capital') {
      penalidadPct = String(p.valorPct)
      topeIntereses = p.topeIntereses === true
    } else if (p.tipo === 'monto_fijo') {
      penalidadMonto = centavosATexto(p.montoCentavos)
      topeIntereses = p.topeIntereses === true
    }
  }
  return {
    inversorId: d.inversorId,
    moneda: c.moneda,
    capital: centavosATexto(c.capitalCentavos),
    fechaAlta: c.fechaAlta,
    sistema: c.sistema,
    periodicidad: c.periodicidad,
    cantidadCuotas: String(c.cantidadCuotas),
    sinVencimiento: c.sinVencimiento === true,
    tasaValor,
    tasaExpresada,
    baseDias:
      c.baseDias === 365
        ? '365'
        : c.baseDias === 360
          ? '360'
          : c.baseDias === '360_reales'
            ? '360_reales'
            : c.baseDias === 'reales'
              ? 'reales'
              : '',
    medioIngresoPrevisto: c.medioIngresoPrevisto,
    mediosDevolucion: [...c.mediosDevolucion],
    penalidadTipo,
    penalidadPct,
    penalidadMonto,
    topeIntereses,
    cuotasPrevias: c.cuotasPrevias ? String(c.cuotasPrevias) : '',
    observaciones: d.observaciones ?? '',
    cuotasAMedida:
      c.cuotasAMedida && c.cuotasAMedida.length > 0
        ? c.cuotasAMedida.map((q) => ({
            fecha: q.fecha,
            capital: centavosATexto(q.capitalCentavos),
            interes: q.interesCentavos != null ? centavosATexto(q.interesCentavos) : '',
          }))
        : [{ fecha: '', capital: '', interes: '' }],
  }
}

function parsePct(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function armarPenalidad(form: FormState): Penalidad | null | { error: string } {
  if (form.penalidadTipo === '') return null
  if (form.penalidadTipo === 'ninguna') return { tipo: 'ninguna' }
  const tope = form.topeIntereses ? { topeIntereses: true as const } : {}
  if (form.penalidadTipo === 'monto_fijo') {
    const montoCentavos = parseMontoEsArACentavos(form.penalidadMonto)
    if (montoCentavos == null) return { error: 'Poné el monto de la penalidad.' }
    return { tipo: 'monto_fijo', montoCentavos, ...tope }
  }
  const valorPct = parsePct(form.penalidadPct)
  if (valorPct == null) return { error: 'Poné el porcentaje de la penalidad.' }
  return { tipo: form.penalidadTipo, valorPct, ...tope }
}

function armarBaseDias(v: FormState['baseDias']): BaseDias | null {
  if (v === '') return null
  if (v === '365') return 365
  if (v === '360') return 360
  if (v === '360_reales') return '360_reales'
  return 'reales'
}

function armarInput(form: FormState): InversionInput | { error: string } {
  if (!form.inversorId) return { error: 'Elegí el inversor.' }
  const capitalCentavos = parseMontoEsArACentavos(form.capital)
  if (capitalCentavos == null) return { error: 'Poné el capital.' }
  if (!form.fechaAlta) return { error: 'Poné la fecha de alta.' }

  const tasaNum = parsePct(form.tasaValor)
  if (tasaNum == null) return { error: 'Poné la tasa.' }
  const tnaPct = form.tasaExpresada === 'mensual' ? tasaNum * 12 : tasaNum

  const sinVencimiento = form.sinVencimiento
  if (sinVencimiento && form.sistema !== 'americano' && form.sistema !== 'capitaliza') {
    return { error: '"Sin fecha de devolución" solo va con intereses por mes o capitaliza.' }
  }

  let cantidadCuotas = 1
  if (!sinVencimiento) {
    cantidadCuotas = Number.parseInt(form.cantidadCuotas, 10)
    if (!Number.isInteger(cantidadCuotas) || cantidadCuotas < 1 || cantidadCuotas > 600) {
      return { error: 'La cantidad de cuotas tiene que ser entre 1 y 600.' }
    }
  }

  let cuotasPrevias: number | undefined
  if (form.cuotasPrevias.trim()) {
    const n = Number.parseInt(form.cuotasPrevias, 10)
    if (!Number.isInteger(n) || n < 0) return { error: 'Las cuotas ya pagadas tienen que ser un número entero.' }
    cuotasPrevias = n
  }

  if (form.mediosDevolucion.length === 0) return { error: 'Elegí al menos un medio de devolución.' }

  const penalidad = armarPenalidad(form)
  if (penalidad && 'error' in penalidad) return penalidad

  let cuotasAMedida: CondicionesInput['cuotasAMedida'] = null
  if (form.sistema === 'a_medida') {
    const filas: NonNullable<CondicionesInput['cuotasAMedida']> = []
    for (const q of form.cuotasAMedida) {
      if (!q.fecha.trim() && !q.capital.trim()) continue
      const capital = parseMontoEsArACentavos(q.capital)
      if (!q.fecha || capital == null) {
        return { error: 'Cada cuota a medida necesita fecha y capital.' }
      }
      let interesCentavos: number | null = null
      if (q.interes.trim()) {
        interesCentavos = parseMontoEsArACentavos(q.interes)
        if (interesCentavos == null) return { error: 'El interés de una cuota a medida no es válido.' }
      }
      filas.push({ fecha: q.fecha, capitalCentavos: capital, interesCentavos })
    }
    if (filas.length === 0) return { error: 'Cargá las cuotas a medida.' }
    cuotasAMedida = filas
    cantidadCuotas = filas.length
  }

  const condiciones: CondicionesInput = {
    moneda: form.moneda,
    capitalCentavos,
    fechaAlta: form.fechaAlta,
    sistema: form.sistema,
    periodicidad: form.periodicidad,
    cantidadCuotas,
    fechaVencimiento: null,
    sinVencimiento: sinVencimiento || undefined,
    cuotasPrevias,
    tasa: { tipo: 'fija', tnaPct, expresada: form.tasaExpresada },
    baseDias: armarBaseDias(form.baseDias),
    cuotasAMedida,
    medioIngresoPrevisto: form.medioIngresoPrevisto,
    mediosDevolucion: form.mediosDevolucion,
    penalidadPrecancelacion: penalidad,
  }

  const obs = form.observaciones.trim()
  return {
    ...condiciones,
    inversorId: form.inversorId,
    observaciones: obs ? obs : null,
  }
}

export function FormInversion(props: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() =>
    props.modo === 'editar' ? deDetalle(props.inicial) : vacio(),
  )
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [simulacion, setSimulacion] = useState<SimulacionResponse | null>(null)
  const [errorSim, setErrorSim] = useState<string | null>(null)
  const [simCargando, setSimCargando] = useState(false)
  const [modalInversor, setModalInversor] = useState(false)

  const { data: inversores = [], refetch: refetchInversores } = useQuery({
    queryKey: ['finanzas', 'inversiones', 'inversores'],
    queryFn: fetchInversores,
  })

  const activos = useMemo(() => inversores.filter((i) => i.estado === 'activo'), [inversores])

  const set = <K extends keyof FormState>(clave: K, valor: FormState[K]) => {
    setForm((prev) => ({ ...prev, [clave]: valor }))
  }

  const inicialId = props.modo === 'editar' ? props.inicial.id : null
  useEffect(() => {
    if (props.modo === 'editar') setForm(deDetalle(props.inicial))
    // Solo al cambiar de inversión (no en cada refetch del mismo detalle).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inicial se toma al montar / cambiar id
  }, [props.modo, inicialId])

  // Recalcular cronograma con debounce ~500 ms.
  useEffect(() => {
    const armado = armarInput(form)
    if ('error' in armado) {
      setSimulacion(null)
      setErrorSim(null)
      setSimCargando(false)
      return
    }
    const { inversorId: _i, observaciones: _o, ...condiciones } = armado
    let cancelado = false
    setSimCargando(true)
    const t = window.setTimeout(() => {
      void simularInversion(condiciones)
        .then((res) => {
          if (cancelado) return
          setSimulacion(res)
          setErrorSim(null)
        })
        .catch((e: unknown) => {
          if (cancelado) return
          setSimulacion(null)
          setErrorSim(e instanceof Error ? e.message : 'No pude calcular las cuotas')
        })
        .finally(() => {
          if (!cancelado) setSimCargando(false)
        })
    }, 500)
    return () => {
      cancelado = true
      window.clearTimeout(t)
    }
  }, [form])

  const toggleMedio = (id: MedioDevolucion) => {
    setForm((prev) => {
      const tiene = prev.mediosDevolucion.includes(id)
      return {
        ...prev,
        mediosDevolucion: tiene
          ? prev.mediosDevolucion.filter((m) => m !== id)
          : [...prev.mediosDevolucion, id],
      }
    })
  }

  const guardar = async (): Promise<InversionDetalle | null> => {
    setError(null)
    const input = armarInput(form)
    if ('error' in input) {
      setError(input.error)
      return null
    }
    setGuardando(true)
    try {
      const detalle =
        props.modo === 'nuevo'
          ? await crearInversion(input)
          : await editarInversion(props.inversionId, input)
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'inversiones'] })
      return detalle
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude guardar')
      return null
    } finally {
      setGuardando(false)
    }
  }

  const onGuardarBorrador = async () => {
    const detalle = await guardar()
    if (detalle) props.onGuardado(detalle)
  }

  const onEnviar = async () => {
    if (props.modo !== 'editar') return
    if (!window.confirm('¿Enviar esta inversión a aprobación?')) return
    setError(null)
    setEnviando(true)
    try {
      const guardado = await guardar()
      if (!guardado) return
      const detalle = await enviarAAprobacion(props.inversionId, null)
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'inversiones'] })
      props.onGuardado(detalle)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude enviarla a aprobación')
    } finally {
      setEnviando(false)
    }
  }

  const monedaSim = form.moneda
  const puedeSinVenc = form.sistema === 'americano' || form.sistema === 'capitaliza'

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-heading text-xl font-bold tracking-tight sm:text-2xl">
            {props.modo === 'nuevo' ? 'Nueva inversión' : `Editar ${props.inicial.numero}`}
          </h2>
          <p className="text-body-muted mt-1 text-sm">
            Condiciones del préstamo. El cronograma se calcula solo a medida que completás.
          </p>
        </div>
        <button
          type="button"
          onClick={props.onCerrar}
          className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
        >
          Volver
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FinanzasFormField label="Inversor" htmlFor="fi-inversor">
            <div className="flex flex-wrap gap-2">
              <select
                id="fi-inversor"
                value={form.inversorId}
                onChange={(e) => set('inversorId', e.target.value)}
                className={`${finanzasInputClass} min-w-0 flex-1`}
              >
                <option value="">Elegí un inversor</option>
                {activos.length === 0 ? (
                  <option value="" disabled>
                    No hay inversores activos
                  </option>
                ) : (
                  activos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => setModalInversor(true)}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Crear inversor
              </button>
            </div>
          </FinanzasFormField>
        </div>

        <FinanzasFormField label="Moneda" htmlFor="fi-moneda">
          <select
            id="fi-moneda"
            value={form.moneda}
            onChange={(e) => set('moneda', e.target.value as MonedaInversion)}
            className={finanzasInputClass}
          >
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </FinanzasFormField>

        <FinanzasFormField
          label={form.moneda === 'USD' ? 'Capital (dólares)' : 'Capital (pesos)'}
          htmlFor="fi-capital"
        >
          <input
            id="fi-capital"
            type="text"
            inputMode="decimal"
            value={form.capital}
            onChange={(e) => set('capital', e.target.value)}
            placeholder="Ej.: 100.000,00"
            className={finanzasInputClass}
          />
        </FinanzasFormField>

        <FinanzasFormField label="Fecha de alta" htmlFor="fi-alta">
          <input
            id="fi-alta"
            type="date"
            value={form.fechaAlta}
            onChange={(e) => set('fechaAlta', e.target.value)}
            className={finanzasInputClass}
          />
        </FinanzasFormField>

        <FinanzasFormField label="Cómo se devuelve" htmlFor="fi-sistema">
          <select
            id="fi-sistema"
            value={form.sistema}
            onChange={(e) => {
              const sistema = e.target.value as SistemaDevolucion
              setForm((prev) => ({
                ...prev,
                sistema,
                sinVencimiento:
                  sistema === 'americano' || sistema === 'capitaliza' ? prev.sinVencimiento : false,
              }))
            }}
            className={finanzasInputClass}
          >
            {SISTEMAS.map((s) => (
              <option key={s} value={s}>
                {TEXTO_SISTEMA_FORM[s]}
              </option>
            ))}
          </select>
        </FinanzasFormField>

        <FinanzasFormField label="Cada cuánto" htmlFor="fi-periodo">
          <select
            id="fi-periodo"
            value={form.periodicidad}
            onChange={(e) => set('periodicidad', e.target.value as Periodicidad)}
            className={finanzasInputClass}
          >
            {PERIODICIDADES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.texto}
              </option>
            ))}
          </select>
        </FinanzasFormField>

        {!form.sinVencimiento && form.sistema !== 'a_medida' ? (
          <FinanzasFormField label="Cantidad de cuotas" htmlFor="fi-cuotas">
            <input
              id="fi-cuotas"
              type="number"
              min={1}
              max={600}
              value={form.cantidadCuotas}
              onChange={(e) => set('cantidadCuotas', e.target.value)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        ) : null}

        {puedeSinVenc ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.sinVencimiento}
              onChange={(e) => set('sinVencimiento', e.target.checked)}
              className="rounded border-neutral-300"
            />
            Sin fecha de devolución
          </label>
        ) : null}

        <FinanzasFormField label="Tasa (%)" htmlFor="fi-tasa">
          <div className="flex gap-2">
            <input
              id="fi-tasa"
              type="text"
              inputMode="decimal"
              value={form.tasaValor}
              onChange={(e) => set('tasaValor', e.target.value)}
              placeholder="Ej.: 1,5"
              className={`${finanzasInputClass} min-w-0 flex-1`}
            />
            <select
              aria-label="Tasa por mes o anual"
              value={form.tasaExpresada}
              onChange={(e) => set('tasaExpresada', e.target.value as TasaExpresada)}
              className={finanzasInputClass}
            >
              <option value="mensual">Por mes</option>
              <option value="anual">Anual</option>
            </select>
          </div>
        </FinanzasFormField>

        <FinanzasFormField label="Base de días" htmlFor="fi-base" optional>
          <select
            id="fi-base"
            value={form.baseDias}
            onChange={(e) => set('baseDias', e.target.value as FormState['baseDias'])}
            className={finanzasInputClass}
          >
            <option value="">La de Configuración</option>
            <option value="365">365 días</option>
            <option value="360">360 con meses de 30 días</option>
            <option value="360_reales">360 con días reales</option>
            <option value="reales">Días reales</option>
          </select>
        </FinanzasFormField>

        <FinanzasFormField label="Cómo entra la plata" htmlFor="fi-ingreso">
          <select
            id="fi-ingreso"
            value={form.medioIngresoPrevisto}
            onChange={(e) => set('medioIngresoPrevisto', e.target.value as MedioIngreso)}
            className={finanzasInputClass}
          >
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="cheque">Cheque</option>
          </select>
        </FinanzasFormField>

        <div className="sm:col-span-2">
          <p className="text-body-muted mb-2 text-sm font-medium">Medios de devolución</p>
          <div className="flex flex-wrap gap-3">
            {MEDIOS_DEV.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.mediosDevolucion.includes(m.id)}
                  onChange={() => toggleMedio(m.id)}
                  className="rounded border-neutral-300"
                />
                {m.texto}
              </label>
            ))}
          </div>
        </div>

        <FinanzasFormField label="Penalidad por devolver antes" htmlFor="fi-pen" optional>
          <select
            id="fi-pen"
            value={form.penalidadTipo}
            onChange={(e) => set('penalidadTipo', e.target.value as TipoPenalidad)}
            className={finanzasInputClass}
          >
            <option value="">La de Configuración</option>
            <option value="ninguna">Ninguna</option>
            <option value="porcentaje_interes">% del interés</option>
            <option value="porcentaje_capital">% del capital</option>
            <option value="monto_fijo">Monto fijo</option>
          </select>
        </FinanzasFormField>

        {form.penalidadTipo === 'porcentaje_interes' || form.penalidadTipo === 'porcentaje_capital' ? (
          <FinanzasFormField label="Porcentaje de la penalidad" htmlFor="fi-pen-pct">
            <input
              id="fi-pen-pct"
              type="text"
              inputMode="decimal"
              value={form.penalidadPct}
              onChange={(e) => set('penalidadPct', e.target.value)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        ) : null}

        {form.penalidadTipo === 'monto_fijo' ? (
          <FinanzasFormField label="Monto fijo de la penalidad" htmlFor="fi-pen-monto">
            <input
              id="fi-pen-monto"
              type="text"
              inputMode="decimal"
              value={form.penalidadMonto}
              onChange={(e) => set('penalidadMonto', e.target.value)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        ) : null}

        {form.penalidadTipo === 'porcentaje_interes' ||
        form.penalidadTipo === 'porcentaje_capital' ||
        form.penalidadTipo === 'monto_fijo' ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.topeIntereses}
              onChange={(e) => set('topeIntereses', e.target.checked)}
              className="rounded border-neutral-300"
            />
            No puede superar los intereses
          </label>
        ) : null}

        <FinanzasFormField label="Cuotas ya pagadas" htmlFor="fi-previas" optional>
          <input
            id="fi-previas"
            type="number"
            min={0}
            value={form.cuotasPrevias}
            onChange={(e) => set('cuotasPrevias', e.target.value)}
            placeholder="Ej.: 3"
            className={finanzasInputClass}
          />
        </FinanzasFormField>

        <div className="sm:col-span-2">
          <FinanzasFormField label="Observaciones" htmlFor="fi-obs" optional>
            <textarea
              id="fi-obs"
              value={form.observaciones}
              onChange={(e) => set('observaciones', e.target.value)}
              rows={2}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        </div>
      </section>

      {form.sistema === 'a_medida' ? (
        <section>
          <h3 className="text-heading text-sm font-semibold">Cuotas a medida</h3>
          <div className="mt-2 space-y-2">
            {form.cuotasAMedida.map((q, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-4">
                <FinanzasFormField label="Fecha" htmlFor={`fi-am-f-${i}`}>
                  <input
                    id={`fi-am-f-${i}`}
                    type="date"
                    value={q.fecha}
                    onChange={(e) => {
                      const v = e.target.value
                      setForm((prev) => {
                        const next = [...prev.cuotasAMedida]
                        next[i] = { ...next[i]!, fecha: v }
                        return { ...prev, cuotasAMedida: next }
                      })
                    }}
                    className={finanzasInputClass}
                  />
                </FinanzasFormField>
                <FinanzasFormField label="Capital" htmlFor={`fi-am-c-${i}`}>
                  <input
                    id={`fi-am-c-${i}`}
                    type="text"
                    inputMode="decimal"
                    value={q.capital}
                    onChange={(e) => {
                      const v = e.target.value
                      setForm((prev) => {
                        const next = [...prev.cuotasAMedida]
                        next[i] = { ...next[i]!, capital: v }
                        return { ...prev, cuotasAMedida: next }
                      })
                    }}
                    className={finanzasInputClass}
                  />
                </FinanzasFormField>
                <FinanzasFormField label="Interés" htmlFor={`fi-am-i-${i}`} optional>
                  <input
                    id={`fi-am-i-${i}`}
                    type="text"
                    inputMode="decimal"
                    value={q.interes}
                    onChange={(e) => {
                      const v = e.target.value
                      setForm((prev) => {
                        const next = [...prev.cuotasAMedida]
                        next[i] = { ...next[i]!, interes: v }
                        return { ...prev, cuotasAMedida: next }
                      })
                    }}
                    className={finanzasInputClass}
                  />
                </FinanzasFormField>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={form.cuotasAMedida.length <= 1}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        cuotasAMedida: prev.cuotasAMedida.filter((_, j) => j !== i),
                      }))
                    }
                    className="rounded-xl px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-zinc-800"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  cuotasAMedida: [...prev.cuotasAMedida, { fecha: '', capital: '', interes: '' }],
                }))
              }
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Agregar cuota
            </button>
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-heading text-sm font-semibold">Cronograma</h3>
          {simCargando ? <span className="text-body-muted text-xs">Calculando…</span> : null}
          {simulacion ? (
            <span className="text-body-muted text-xs">{textoSistema(form.sistema)}</span>
          ) : null}
        </div>
        {errorSim ? <p className="text-danger mb-2 text-sm">{errorSim}</p> : null}
        {simulacion?.avisos?.length ? (
          <ul className="mb-2 list-inside list-disc text-sm text-amber-900 dark:text-amber-100">
            {simulacion.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
        {simulacion && simulacion.cronograma.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">N°</th>
                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2 text-right font-medium">Capital</th>
                    <th className="px-3 py-2 text-right font-medium">Interés</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                  {simulacion.cronograma.map((c) => (
                    <tr key={c.numero}>
                      <td className="px-3 py-2 tabular-nums">{c.numero}</td>
                      <td className="px-3 py-2">{formatFecha(c.fechaVencimiento)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyCentavos(c.capitalCentavos, monedaSim)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyCentavos(c.interesCentavos, monedaSim)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyCentavos(c.totalCentavos, monedaSim)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyCentavos(c.saldoCapitalCentavos, monedaSim)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-body-muted mt-2 text-sm tabular-nums">
              Totales · capital {formatMoneyCentavos(simulacion.totales.capitalCentavos, monedaSim)} ·
              interés {formatMoneyCentavos(simulacion.totales.interesCentavos, monedaSim)} · total{' '}
              {formatMoneyCentavos(simulacion.totales.totalCentavos, monedaSim)}
            </p>
          </>
        ) : !errorSim && !simCargando ? (
          <p className="text-body-muted text-sm">Completá las condiciones para ver las cuotas.</p>
        ) : null}
      </section>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={props.onCerrar}
          disabled={guardando || enviando}
          className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void onGuardarBorrador()}
          disabled={guardando || enviando}
          className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {guardando ? 'Guardando…' : 'Guardar borrador'}
        </button>
        {props.modo === 'editar' ? (
          <button
            type="button"
            onClick={() => void onEnviar()}
            disabled={guardando || enviando}
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : 'Enviar a aprobación'}
          </button>
        ) : null}
      </div>

      {modalInversor ? (
        <FichaInversorModal
          modo="nuevo"
          onClose={() => setModalInversor(false)}
          onGuardado={() => {
            const antes = new Set(activos.map((i) => i.id))
            void refetchInversores().then((r) => {
              const nuevo = (r.data ?? []).find((i) => i.estado === 'activo' && !antes.has(i.id))
              if (nuevo) set('inversorId', nuevo.id)
            })
          }}
        />
      ) : null}
    </div>
  )
}
