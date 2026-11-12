import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronUp, Lightbulb, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  clasificarOcasional,
  fetchRevisarAsistido,
  type ChequeEvidencia,
  type DetalleDolares,
  type DetalleInteres,
  type LoteBase,
  type TramoInteres,
  type FuerzaHipotesis,
  type GrupoARevisar,
  type HipotesisRevisar,
  type RenovacionDelDia,
  type TipoHipotesis,
} from '../../../services/finanzasChequesApi'
import { finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import { usePermisosFinanzas } from '../permisosFinanzas'

/**
 * Revisión asistida: todos los cheques "A revisar" juntos por operación (mismo beneficiario, emisión y OBS).
 * Al abrir un grupo se ven sus cheques, qué más se le emitió ese día al proveedor y las explicaciones posibles
 * con su cuenta. Cada explicación se puede confirmar ahí mismo (guarda lo mismo que la clasificación a mano del
 * cheque, en todos los cheques del grupo) o se abre el cheque para cargarlo distinto.
 */

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

const pesos = (c: number) => formatMoneyCentavos(c, 'ARS')

const ETIQUETA_TIPO: Record<TipoHipotesis, string> = {
  renovacion_obs: 'Renovación',
  interes_renovacion: 'Interés',
  interes_posicion: 'Interés',
  diferencia: 'Diferencia',
  dolares: 'Dólares',
  origen_posible: 'Origen posible',
}

const ETIQUETA_FUERZA: Record<FuerzaHipotesis, string> = {
  fuerte: 'Da justo',
  posible: 'Posible',
  debil: 'Dudosa',
}

const COLOR_FUERZA: Record<FuerzaHipotesis, string> = {
  fuerte: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
  posible: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200',
  debil: 'border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

type FiltroSugerencia = 'todos' | 'fuerte' | 'alguna' | 'ninguna'

const FILTROS: [FiltroSugerencia, string][] = [
  ['todos', 'Todos'],
  ['fuerte', 'Con una que da justo'],
  ['alguna', 'Con alguna sugerencia'],
  ['ninguna', 'Sin sugerencia'],
]

function Insignia({ fuerza, children }: { fuerza: FuerzaHipotesis; children: React.ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${COLOR_FUERZA[fuerza]}`}>
      {children}
    </span>
  )
}

export function RevisionAsistida({ onAbrirCheque }: { onAbrirCheque: (id: string) => void }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'revisar-asistido'],
    queryFn: fetchRevisarAsistido,
  })
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroSugerencia>('todos')
  const [abiertoId, setAbiertoId] = useState<string | null>(null)

  const grupos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return (data?.grupos ?? []).filter((g) => {
      if (filtro === 'fuerte' && !g.hipotesis.some((h) => h.fuerza === 'fuerte')) return false
      if (filtro === 'alguna' && g.hipotesis.length === 0) return false
      if (filtro === 'ninguna' && g.hipotesis.length > 0) return false
      if (!texto) return true
      return (
        g.proveedor.toLowerCase().includes(texto) ||
        g.beneficiario.toLowerCase().includes(texto) ||
        g.obs.toLowerCase().includes(texto) ||
        g.cheques.some((c) => c.numeroCheque.includes(texto))
      )
    })
  }, [data, busqueda, filtro])

  // Se busca en la lista completa: si el grupo deja de estar a revisar mientras está abierto, el modal se cierra solo.
  const abierto = abiertoId ? (data?.grupos ?? []).find((g) => g.id === abiertoId) ?? null : null

  if (isLoading) return <p className="text-body-muted py-8 text-center text-sm">Armando la revisión…</p>
  if (isError || !data) {
    return <p className="text-danger py-8 text-center text-sm">{error instanceof Error ? error.message : 'No se pudo armar la revisión'}</p>
  }

  const t = data.totales
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tarjeta titulo="Operaciones a revisar" valor={String(t.grupos)} detalle={`${t.cheques} cheques`} />
        <Tarjeta titulo="Con una explicación que da justo" valor={String(t.conSugerenciaFuerte)} detalle="para confirmar rápido" />
        <Tarjeta titulo="Con sugerencias para mirar" valor={String(t.grupos - t.conSugerenciaFuerte - t.sinSugerencia)} detalle="posibles o dudosas" />
        <Tarjeta titulo="Sin ninguna sugerencia" valor={String(t.sinSugerencia)} detalle="hay que preguntar" />
      </div>

      <div className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              className={`${finanzasInputClass} w-72 pl-8`}
              placeholder="Buscar por proveedor, OBS o número de cheque"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
            {FILTROS.map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltro(valor)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filtro === valor ? 'bg-brand-primary text-white shadow-sm' : 'text-body-muted hover:text-heading'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <span className="text-body-muted text-xs">{grupos.length} operaciones</span>
        </div>

        {grupos.length === 0 ? (
          <p className="text-body-muted py-8 text-center text-sm">No hay operaciones a revisar con ese filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b border-subtle text-left text-body-muted">
                <tr>
                  <th className="px-2.5 py-2">Emisión</th>
                  <th className="px-2.5 py-2">Proveedor</th>
                  <th className="px-2.5 py-2">OBS</th>
                  <th className="px-2.5 py-2 text-center">Cheques</th>
                  <th className="px-2.5 py-2 text-right">Total</th>
                  <th className="px-2.5 py-2">Mejor explicación</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const mejor = g.hipotesis[0]
                  return (
                    <tr
                      key={g.id}
                      className="cursor-pointer border-t border-subtle hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      onClick={() => setAbiertoId(g.id)}
                    >
                      <td className="whitespace-nowrap px-2.5 py-2">{formatFecha(g.fechaEmision)}</td>
                      <td className="px-2.5 py-2 font-medium">
                        {g.proveedor || '—'}
                        {!g.proveedorCargado ? <span className="text-body-muted ml-1 font-normal">(sin asignar)</span> : null}
                      </td>
                      <td className="max-w-[16rem] truncate px-2.5 py-2 font-mono" title={g.obs}>
                        {g.obs || <span className="text-body-muted font-sans">sin OBS</span>}
                      </td>
                      <td className="px-2.5 py-2 text-center tabular-nums">{g.cantidadCheques}</td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-right font-semibold tabular-nums">{pesos(g.totalCentavos)}</td>
                      <td className="px-2.5 py-2">
                        {mejor ? (
                          <span className="flex items-center gap-1.5">
                            <Insignia fuerza={mejor.fuerza}>{ETIQUETA_FUERZA[mejor.fuerza]}</Insignia>
                            <span className="max-w-[26rem] truncate" title={mejor.titulo}>
                              {mejor.titulo}
                            </span>
                            {g.hipotesis.length > 1 ? <span className="text-body-muted whitespace-nowrap">+{g.hipotesis.length - 1}</span> : null}
                          </span>
                        ) : (
                          <span className="text-body-muted">Sin sugerencia</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {abierto ? <ModalGrupo grupo={abierto} onClose={() => setAbiertoId(null)} onAbrirCheque={onAbrirCheque} /> : null}
    </div>
  )
}

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="surface-card rounded-2xl border border-neutral-200 p-3 dark:border-zinc-800">
      <p className="text-body-muted text-xs">{titulo}</p>
      <p className="text-heading text-xl font-semibold tabular-nums">{valor}</p>
      <p className="text-body-muted text-xs">{detalle}</p>
    </div>
  )
}

function TablaCheques({ cheques, conBeneficiario }: { cheques: ChequeEvidencia[]; conBeneficiario?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="text-left text-body-muted">
          <tr>
            <th className="px-2 py-1">Cheque</th>
            {conBeneficiario ? <th className="px-2 py-1">Beneficiario</th> : null}
            <th className="px-2 py-1 text-right">Importe</th>
            <th className="px-2 py-1">Emisión</th>
            <th className="px-2 py-1">Vence</th>
            <th className="px-2 py-1">Se cobró</th>
            <th className="px-2 py-1">Estado</th>
            <th className="px-2 py-1">OBS</th>
          </tr>
        </thead>
        <tbody>
          {cheques.map((c) => (
            <tr key={c.numeroCheque} className="border-t border-subtle">
              <td className="whitespace-nowrap px-2 py-1 font-mono">{c.numeroCheque}</td>
              {conBeneficiario ? <td className="px-2 py-1">{c.beneficiario}</td> : null}
              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{pesos(c.montoCentavos)}</td>
              <td className="whitespace-nowrap px-2 py-1">{formatFecha(c.fechaEmision)}</td>
              <td className="whitespace-nowrap px-2 py-1">{formatFecha(c.fechaVencimiento)}</td>
              <td className="whitespace-nowrap px-2 py-1">{c.fechaConciliado ? formatFecha(c.fechaConciliado) : c.pagado ? 'Sí' : 'No'}</td>
              <td className="whitespace-nowrap px-2 py-1">{c.estado || '—'}</td>
              <td className="max-w-[14rem] truncate px-2 py-1 font-mono" title={c.obs}>
                {c.obs}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (ym: string) => {
  const [anio, mes] = ym.split('-')
  return `${MESES[Number(mes) - 1]} de ${anio}`
}
const tasa = (p: number, decimales = 2) => `${p.toLocaleString('es-AR', { maximumFractionDigits: decimales })}%`
const rangoFechas = (desde: string | null, hasta: string | null) =>
  !desde ? '—' : desde === hasta || !hasta ? formatFecha(desde) : `${formatFecha(desde)} al ${formatFecha(hasta)}`
const cant = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** La diferencia entre lo que suman los cheques y la cuenta exacta, explicada cuando es solo redondeo. */
function DiferenciaRedondeo({ diferenciaCentavos, redondeoCheques }: { diferenciaCentavos: number; redondeoCheques?: number | null }) {
  if (diferenciaCentavos === 0) return <span className="text-emerald-700 dark:text-emerald-400">Da justo</span>
  if (redondeoCheques) {
    const porCheque = Math.round(Math.abs(diferenciaCentavos) / redondeoCheques)
    return (
      <span className="text-emerald-700 dark:text-emerald-400">
        {pesos(diferenciaCentavos)}: redondeo de {cant(redondeoCheques, 'cheque', 'cheques')} al peso (hasta {pesos(Math.max(porCheque, 1))} c/u)
      </span>
    )
  }
  return <span className="text-red-600 dark:text-red-400">{pesos(diferenciaCentavos)}: más que el redondeo de los cheques</span>
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className="bg-brand-primary/10 text-brand-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-heading text-xs font-semibold uppercase leading-6 tracking-wide">{titulo}</p>
        <div className="mt-1.5 space-y-2 text-[13px] leading-[1.5]">{children}</div>
      </div>
    </div>
  )
}

/** Una fila con el texto a la izquierda y el monto alineado a la derecha. */
function Fila({ children, monto, fuerte }: { children: React.ReactNode; monto: React.ReactNode; fuerte?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <span className="min-w-0">{children}</span>
      <span className={`tabular-nums ${fuerte ? 'text-heading font-semibold' : ''}`}>{monto}</span>
    </div>
  )
}

/** Recuadro suave para separar cada base o cada renovación. */
function Bloque({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1 rounded-lg border border-neutral-200 bg-neutral-50/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">{children}</div>
}

function Lotes({ lotes }: { lotes: LoteBase[] }) {
  return (
    <ul className="space-y-1 text-xs">
      {lotes.map((l) => (
        <li key={`${l.fechaEmision}-${l.obs}`} className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="font-mono">{l.obs || '(sin OBS)'}</span> <span className="text-body-muted">del {formatFecha(l.fechaEmision)}</span>{' '}
            {l.esRenovacion ? (
              <span className="rounded border border-violet-300 bg-violet-50 px-1 text-[10px] text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
                Renovación
              </span>
            ) : l.esDolares ? (
              <span className="rounded border border-green-300 bg-green-50 px-1 text-[10px] text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
                Dólares
              </span>
            ) : null}
          </span>
          <span className="tabular-nums">
            {cant(l.cantidadCheques, 'cheque', 'cheques')} · {pesos(l.montoCentavos)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** "el cheque que vence el 25/10" o "los 9 cheques": para nombrar a qué pago corresponde cada tramo. */
function nombrePagos(t: TramoInteres, unico: boolean): string {
  if (unico) return cant(t.chequesInteres.length, 'El cheque', 'Los cheques')
  const f = [...new Set(t.vencimientos)]
  return t.chequesInteres.length === 1 ? `El cheque que vence el ${formatFecha(f[0] ?? null)}` : `Los ${t.chequesInteres.length} cheques que vencen el ${f.map((x) => formatFecha(x)).join(', ')}`
}

function formulaCuenta(d: DetalleInteres, t: TramoInteres): string {
  if (t.tipoCuenta === 'resta') return `Nuevos ${pesos(t.nuevosCentavos ?? 0)} − viejos ${pesos(t.baseCentavos)}`
  const meses = d.porMes ? ` × ${cant(d.periodos, 'mes', 'meses')}` : ''
  const veces = !d.porMes && t.chequesInteres.length > 1 && t.esperadoCentavos > Math.round((t.baseCentavos * d.tasaPorcentaje) / 100) + 1 ? ` × ${t.chequesInteres.length} cheques` : ''
  return `${pesos(t.baseCentavos)} × ${tasa(d.tasaPorcentaje)}${d.porMes ? ' mensual' : ''}${meses}${veces}`
}

/** Por qué tiene sentido: la renovación relacionada, cuánto corrió los vencimientos y si ya traía interés adentro. */
function PorQue({ d, t }: { d: DetalleInteres; t: TramoInteres }) {
  const r = t.renovacion
  if (!r) return null
  const cuando = r.mismoDia ? 'Ese mismo día' : `El ${formatFecha(r.fechaEmision)}`
  const coincide = d.porMes && r.meses === d.periodos
  const plazo = r.meses !== null && r.meses > 0 ? cant(r.meses, 'mes', 'meses') : r.dias !== null ? `${r.dias} días` : null
  // Tasa por mes compuesta: cada mes se cobra sobre el capital con los meses anteriores ya sumados (no total ÷ meses).
  const adentroPct = r.viejosCentavos > 0 ? (r.interesAdentroCentavos / r.viejosCentavos) * 100 : 0
  const total = r.viejosCentavos > 0 ? (r.nuevosCentavos + t.pagadoCentavos) / r.viejosCentavos : 1
  const mensual = r.meses !== null && r.meses > 1 ? (Math.pow(total, 1 / r.meses) - 1) * 100 : null
  const cuadraPorMes =
    mensual !== null && Math.abs(mensual - adentroPct) < 0.1 && Math.abs(mensual - d.tasaPorcentaje) < 0.1
  return (
    <Bloque>
      <p className="text-body-muted font-mono text-xs">{r.obs}</p>
      <p>
        {cuando} se renovaron {cant(r.cantidadViejos, 'cheque que vencía', 'cheques que vencían')} el {rangoFechas(r.vencianDesde, r.vencianHasta)}. Se pasaron
        al {rangoFechas(r.vencenDesde, r.vencenHasta)}
        {plazo ? <span className="font-semibold">{` (${plazo})`}</span> : null}
        {coincide ? ', los mismos meses que se cobran de interés' : ''}.
      </p>
      {d.forma === 'renovacion' ? null : r.interesAdentroCentavos === 0 ? (
        <p className="text-body-muted">
          Los cheques nuevos salieron por el mismo importe: el interés se pagó aparte{r.mismoDia ? ' ese mismo día' : ' más tarde'}.
        </p>
      ) : (
        <div className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> La renovación ya traía interés adentro
          </p>
          <div className="mt-1 space-y-0.5">
            <Fila monto={`${pesos(r.interesAdentroCentavos)} (${tasa((r.interesAdentroCentavos / r.viejosCentavos) * 100, 1)})`}>
              Adentro de los cheques nuevos, sobre {pesos(r.viejosCentavos)}
            </Fila>
            <Fila monto={`${pesos(t.pagadoCentavos)}`}>Más este pago aparte</Fila>
            <Fila fuerte monto={`${pesos(r.nuevosCentavos + t.pagadoCentavos)} (${tasa(((r.nuevosCentavos + t.pagadoCentavos) / r.viejosCentavos - 1) * 100, 1)})`}>
              En total{r.dias !== null ? `, en ${r.dias} días` : ''}
            </Fila>
            {mensual !== null ? (
              <Fila fuerte monto={tasa(mensual, 1)}>Por mes, cada mes sobre lo ya acumulado</Fila>
            ) : null}
          </div>
          <p className="mt-1">
            {cuadraPorMes
              ? `Cuadra con ${tasa(adentroPct, 1)} por mes durante ${cant(r.meses ?? 0, 'mes', 'meses')}: el segundo ${tasa(adentroPct, 1)} se calculó sobre el capital con el primer mes ya sumado. Parece el mes siguiente de interés, no un cobro repetido; igual confirmalo con Finanzas.`
              : 'Puede ser otro mes de interés o un cobro repetido: confirmalo con Finanzas.'}
          </p>
        </div>
      )}
    </Bloque>
  )
}

function OtrasBases({ t, interesCentavos, porMes, de }: { t: TramoInteres; interesCentavos: number; porMes: boolean; de: string | null }) {
  const [ver, setVer] = useState(false)
  if (t.alternativas.length < 2) return null
  return (
    <div>
      <button type="button" className="text-brand-primary inline-flex items-center gap-1 text-xs font-medium hover:underline" onClick={() => setVer((v) => !v)}>
        {ver ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {ver ? 'Ocultar' : 'Ver'} las otras bases que se probaron{de ? ` (${de})` : ''}
      </button>
      {ver ? (
        <div className="mt-1.5">
          <p className="text-body-muted mb-1 text-xs">
            Tasa{porMes ? ' mensual' : ''} que daría cada base: {pesos(interesCentavos)} ÷ base. Solo una tasa redonda que cierra al peso indica la base real.
          </p>
          <table className="min-w-full text-xs">
            <thead className="text-body-muted text-left">
              <tr>
                <th className="px-2 py-1">Base</th>
                <th className="px-2 py-1 text-right">Cheques</th>
                <th className="px-2 py-1 text-right">Monto</th>
                <th className="px-2 py-1 text-right">Tasa que da</th>
              </tr>
            </thead>
            <tbody>
              {t.alternativas.map((b) => (
                <tr key={`${b.mes ?? b.descripcion ?? 'todo'}-${b.baseCentavos}`} className={`border-t border-subtle ${b.cierra ? 'font-semibold text-emerald-800 dark:text-emerald-300' : ''}`}>
                  <td className="px-2 py-1">{b.mes ? `Vence en ${nombreMes(b.mes)}` : b.descripcion ?? 'Todo lo que estaba vivo'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{b.cantidadCheques}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{pesos(b.baseCentavos)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {tasa(b.tasaPorcentaje)}
                    {b.cierra ? ' ✓' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

/**
 * El detalle del interés, solo si viene con el formato actual (pagos y tramos). Un backend sin actualizar puede mandar
 * el formato anterior: en ese caso se muestra la tarjeta común en vez de romper la pantalla.
 */
function detalleDe(h: HipotesisRevisar): DetalleInteres | null {
  const d = h.detalleInteres
  return d && Array.isArray(d.tramos) && Array.isArray(d.pagos) ? d : null
}

/** El paso a paso de cualquier interés: qué se pagó, sobre qué, la cuenta, por qué tiene sentido y otras bases. */
function PasoAPasoInteres({ d }: { d: DetalleInteres }) {
  const unico = d.tramos.length === 1
  const conRenovacion = d.tramos.some((t) => t.renovacion)
  const conAlternativas = d.tramos.some((t) => t.alternativas.length > 1)
  const cheques = d.pagos.reduce((s, p) => s + p.cantidadCheques, 0)
  const enCuotas = d.pagos.some((p) => p.cantidadCheques > 1)
  return (
    <div className="mt-3 divide-y divide-neutral-200 dark:divide-zinc-800">
      <Paso n={1} titulo="Qué se pagó">
        <p>
          {cant(cheques, 'cheque', 'cheques')} por <span className="text-heading font-semibold">{pesos(d.totalPagadoCentavos)}</span>
          {enCuotas ? `, en ${cant(d.pagos.length, 'cuota', 'cuotas')}` : ''}:
        </p>
        <div className="max-w-md space-y-0.5 pl-3">
          {d.pagos.map((p, i) => (
            <Fila key={`${p.desde}-${i}`} monto={pesos(p.montoCentavos)}>
              <span className="text-body-muted">
                {p.cantidadCheques > 1 ? `${p.cantidadCheques} cheques que vencen del ${rangoFechas(p.desde, p.hasta)}` : `Vence el ${formatFecha(p.desde)}`}
              </span>
            </Fila>
          ))}
        </div>
        {d.porMes && d.pagos.length > 0 ? (
          <p>
            Por mes: <span className="text-heading font-semibold tabular-nums">{pesos(d.pagos[0]!.montoCentavos)}</span>
          </p>
        ) : null}
      </Paso>

      <Paso n={2} titulo={unico ? 'Sobre qué se calculó' : 'Cada pago contra su base'}>
        {d.tramos.map((t, i) => (
          <Bloque key={i}>
            {!unico ? <p className="text-heading font-medium">{nombrePagos(t, false)}</p> : null}
            <Fila fuerte monto={pesos(t.baseCentavos)}>
              Sobre {t.baseDescripcion} <span className="text-body-muted">({cant(t.cantidadChequesBase, 'cheque', 'cheques')})</span>
            </Fila>
            {t.lotes.length > 0 ? <Lotes lotes={t.lotes} /> : null}
          </Bloque>
        ))}
      </Paso>

      <Paso n={3} titulo="La cuenta">
        <div className="max-w-xl space-y-1">
          {d.tramos.map((t, i) => (
            <Fila key={i} monto={<>= {pesos(t.esperadoCentavos)}{!unico ? <span className="text-body-muted"> · cheque {pesos(t.pagadoCentavos)}</span> : null}</>}>
              {formulaCuenta(d, t)}
            </Fila>
          ))}
          <div className="border-t border-neutral-200 pt-1 dark:border-zinc-800">
            {!unico ? <Fila monto={pesos(d.esperadoCentavos)}>Debería dar en total</Fila> : null}
            <Fila monto={pesos(d.totalPagadoCentavos)}>Los cheques suman</Fila>
            <Fila monto={<DiferenciaRedondeo diferenciaCentavos={d.diferenciaCentavos} redondeoCheques={d.redondeoCheques} />}>Diferencia</Fila>
          </div>
        </div>
      </Paso>

      {conRenovacion ? (
        <Paso n={4} titulo="Por qué tiene sentido">
          {d.tramos.map((t, i) => (
            <PorQue key={i} d={d} t={t} />
          ))}
          {d.forma !== 'renovacion' ? (
            <p className="text-body-muted text-xs">
              En una renovación, para no volver a emitir todo, los cheques nuevos pueden salir por el mismo importe y el interés aparte en varios cheques.
            </p>
          ) : null}
        </Paso>
      ) : null}

      {conAlternativas ? (
        <div className="space-y-1 pt-3">
          {d.tramos.map((t, i) => (
            <OtrasBases
              key={i}
              t={t}
              interesCentavos={d.porMes ? d.pagos[0]?.montoCentavos ?? 0 : Math.round(t.pagadoCentavos / Math.max(t.chequesInteres.length, 1))}
              porMes={d.porMes}
              de={unico ? null : nombrePagos(t, false).toLowerCase()}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** El detalle de dólares, solo si viene con el formato actual (un backend sin actualizar no lo manda). */
function detalleDolaresDe(h: HipotesisRevisar): DetalleDolares | null {
  const d = h.detalleDolares
  return d && Array.isArray(d.vencimientos) && Array.isArray(d.comparables) ? d : null
}

const usd = (n: number) => `US$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const tc = (n: number, decimales = 0) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`
const textoDias = (n: number) => cant(Math.round(n), 'día', 'días')

/** La tasa redonda que explica la diferencia, dicha con su cuenta. */
function TasaRedonda({ d }: { d: DetalleDolares }) {
  const t = d.tasaRedonda
  if (!t) return null
  const como =
    t.modo === 'interes'
      ? `Si a cada cheque se le saca ${tasa(t.tasaMensualPorcentaje)} mensual de interés por sus días hasta el vencimiento`
      : `Si a cada cheque se le descuenta ${tasa(t.tasaMensualPorcentaje)} mensual por sus días hasta el vencimiento`
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
      <p>{como}, los cheques valen a la fecha de emisión:</p>
      <div className="mt-1 space-y-0.5">
        <Fila monto={pesos(t.valorHoyCentavos)}>Valor de los cheques al emitir</Fila>
        <Fila monto={pesos(d.capitalCentavos)}>Dólares × cotización</Fila>
        <Fila fuerte monto={pesos(t.diferenciaCentavos)}>
          {t.ajuste === 'al_peso' ? 'Diferencia: da justo (redondeo al peso)' : 'Diferencia: cierra con cheques por montos redondos'}
        </Fila>
      </div>
      {t.ajuste === 'a_miles' ? (
        <p className="mt-1 text-xs">Los cheques salieron por montos redondos (de a miles), por eso no cierra al peso. Confirmá la tasa con quien negoció.</p>
      ) : null}
    </div>
  )
}

/** El paso a paso de una operación en dólares: qué se pidió, cómo se pagó, la cuenta y por qué tiene sentido. */
function PasoAPasoDolares({ d, proveedor }: { d: DetalleDolares; proveedor: string }) {
  const [verComparables, setVerComparables] = useState(false)
  const justo = d.lectura === 'justo'
  const propias = d.comparables.filter((c) => c.mismoProveedor)
  const conAjenas = d.comparables.some((c) => !c.mismoProveedor)
  return (
    <div className="mt-3 divide-y divide-neutral-200 dark:divide-zinc-800">
      <Paso n={1} titulo="Qué se pidió">
        <div className="max-w-md space-y-0.5">
          <Fila fuerte monto={pesos(d.capitalCentavos)}>
            {usd(d.montoUsd)} × {tc(d.cotizacion)}
          </Fila>
        </div>
        <p className="text-body-muted text-xs">Los dólares y la cotización que dice el OBS. Es lo que valen en pesos el día de la operación.</p>
      </Paso>

      <Paso n={2} titulo="Cómo se pagó">
        <p>
          {cant(d.cantidadCheques, 'cheque', 'cheques')} por <span className="text-heading font-semibold">{pesos(d.totalChequesCentavos)}</span>:
        </p>
        <div className="max-w-md space-y-0.5 pl-3">
          {d.vencimientos.map((v) => (
            <Fila key={v.fecha ?? 'sin'} monto={pesos(v.montoCentavos)}>
              <span className="text-body-muted">
                {v.cantidadCheques > 1 ? `${v.cantidadCheques} cheques que vencen` : 'Vence'} el {formatFecha(v.fecha)}
                {v.dias !== null ? ` (a ${textoDias(v.dias)})` : ''}
              </span>
            </Fila>
          ))}
        </div>
        {d.chequesIguales ? (
          <p>
            Los {d.cantidadCheques} cheques son iguales: cada uno cubre {usd(d.chequesIguales.usdPorCheque)} ({pesos(d.chequesIguales.capitalPorChequeCentavos)} a{' '}
            {tc(d.cotizacion)}) y salió por {pesos(d.chequesIguales.montoCentavos)}
            {d.chequesIguales.montoCentavos > d.chequesIguales.capitalPorChequeCentavos
              ? `: ${pesos(d.chequesIguales.montoCentavos - d.chequesIguales.capitalPorChequeCentavos)} más cada uno`
              : ''}
            .
          </p>
        ) : null}
        {d.partes.length > 0 ? (
          <Bloque>
            <p className="text-heading font-medium">Con los mismos dólares y cotización también hay:</p>
            <ul className="space-y-0.5 text-xs">
              {d.partes.map((p) => (
                <li key={`${p.fechaEmision}-${p.obs}`} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="font-mono">{p.obs || '(sin OBS)'}</span> <span className="text-body-muted">del {formatFecha(p.fechaEmision)}</span>
                  </span>
                  <span className="tabular-nums">
                    {cant(p.cantidadCheques, 'cheque', 'cheques')} · {pesos(p.montoCentavos)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-body-muted text-xs">Pueden ser partes de la misma operación emitidas otro día. No se suman a la cuenta de abajo.</p>
          </Bloque>
        ) : null}
      </Paso>

      <Paso n={3} titulo="La cuenta">
        <div className="max-w-xl space-y-1">
          <Fila monto={pesos(d.totalChequesCentavos)}>Los cheques suman</Fila>
          <Fila monto={`− ${pesos(d.capitalCentavos)}`}>Menos dólares × cotización</Fila>
          <div className="border-t border-neutral-200 pt-1 dark:border-zinc-800">
            <Fila
              fuerte
              monto={
                justo ? (
                  <DiferenciaRedondeo diferenciaCentavos={d.diferenciaCentavos} redondeoCheques={d.redondeoCheques} />
                ) : (
                  `${pesos(d.diferenciaCentavos)} (${d.diferenciaCentavos > 0 ? '+' : ''}${tasa(d.recargoPorcentaje)})`
                )
              }
            >
              {d.diferenciaCentavos >= 0 ? 'Diferencia: lo que se paga de más' : 'Diferencia: faltan'}
            </Fila>
            {!justo && d.diferenciaCentavos > 0 ? (
              <Fila monto={`${tc(d.cotizacionEfectiva, 2)} por dólar`}>Cotización que quedó (cheques ÷ dólares)</Fila>
            ) : null}
            {d.mensualPorcentaje !== null && d.plazoPromedioDias !== null ? (
              <Fila monto={`${tasa(d.mensualPorcentaje)} mensual`}>Como interés por los días de cada cheque (en promedio {textoDias(d.plazoPromedioDias)})</Fila>
            ) : null}
          </div>
          <TasaRedonda d={d} />
        </div>
      </Paso>

      {!justo ? (
        <Paso n={4} titulo="Por qué tiene sentido">
          {d.lectura === 'sin_plazo' ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {d.plazoPromedioDias !== null && d.plazoPromedioDias < 7 ? `Los cheques vencen ${d.plazoPromedioDias <= 1 ? 'al día siguiente' : `a ${textoDias(d.plazoPromedioDias)}`}` : 'La tasa da muy alta'}
              </p>
              <p className="mt-1">
                Un {tasa(d.recargoPorcentaje)} de más {d.mensualPorcentaje !== null ? `daría ${tasa(d.mensualPorcentaje, 0)} mensual` : 'no se explica por el plazo'}: no
                puede ser interés por plazo. Lo más probable es que se haya pagado otra cotización ({tc(d.cotizacionEfectiva, 2)} por dólar en vez de{' '}
                {tc(d.cotizacion)}) o que haya un costo de la operación. Confirmalo con quien negoció.
              </p>
            </div>
          ) : d.lectura === 'faltan_cheques' ? (
            <p>
              Los cheques cubren {tasa((d.totalChequesCentavos / d.capitalCentavos) * 100, 1)} de dólares × cotización.
              {d.partes.length > 0 ? ' El resto puede estar en las otras partes de arriba.' : ' Puede haber más cheques de esta operación con otra emisión u otro OBS.'}
            </p>
          ) : (
            <p>
              Las operaciones en dólares se pagan con cheques a plazo que traen el interés adentro.
              {d.plazoPromedioDias !== null && d.mensualPorcentaje !== null
                ? ` En promedio vencen a ${textoDias(d.plazoPromedioDias)}: el ${tasa(d.recargoPorcentaje, 1)} de más es ${tasa(d.mensualPorcentaje, 1)} por mes.`
                : ''}
              {d.rangoProveedor
                ? d.rangoProveedor.min === d.rangoProveedor.max
                  ? ` En su otra operación ${proveedor} cobró ${tasa(d.rangoProveedor.min, 1)} mensual.`
                  : ` En sus otras operaciones ${proveedor} cobró entre ${tasa(d.rangoProveedor.min, 1)} y ${tasa(d.rangoProveedor.max, 1)} mensual.`
                : ''}
            </p>
          )}
          {d.comparables.length > 0 ? (
            <div>
              <button
                type="button"
                className="text-brand-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                onClick={() => setVerComparables((v) => !v)}
              >
                {verComparables ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {verComparables ? 'Ocultar' : 'Ver'}{' '}
                {propias.length > 0 && !conAjenas
                  ? `otras operaciones en dólares de ${proveedor}`
                  : propias.length === 0
                    ? `operaciones en dólares de otros proveedores en esos días (${proveedor} no tiene otras)`
                    : `otras operaciones en dólares de ${proveedor} y de otros proveedores en esos días`}
              </button>
              {verComparables ? (
                <table className="mt-1.5 min-w-full text-xs">
                  <thead className="text-body-muted text-left">
                    <tr>
                      <th className="px-2 py-1">Emisión</th>
                      {conAjenas ? <th className="px-2 py-1">Proveedor</th> : null}
                      <th className="px-2 py-1 text-right">Dólares</th>
                      <th className="px-2 py-1 text-right">Cotización</th>
                      <th className="px-2 py-1 text-right">Cheques</th>
                      <th className="px-2 py-1 text-right">Plazo</th>
                      <th className="px-2 py-1 text-right">Tasa mensual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.comparables.map((c) => (
                      <tr key={`${c.proveedor}-${c.fechaEmision}-${c.obs}`} className="border-t border-subtle">
                        <td className="px-2 py-1">{formatFecha(c.fechaEmision)}</td>
                        {conAjenas ? <td className="px-2 py-1">{c.proveedor}</td> : null}
                        <td className="px-2 py-1 text-right tabular-nums">{usd(c.montoUsd)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{tc(c.cotizacion)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{pesos(c.chequesCentavos)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{textoDias(c.plazoDias)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{tasa(c.mensualPorcentaje, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          ) : null}
        </Paso>
      ) : null}
    </div>
  )
}

function TarjetaHipotesis({ h, grupo }: { h: HipotesisRevisar; grupo: GrupoARevisar }) {
  const [verCheques, setVerCheques] = useState(false)
  const [pidiendoOk, setPidiendoOk] = useState(false)
  const puedeEditar = usePermisosFinanzas().cheques
  const queryClient = useQueryClient()
  // Se guarda sobre un cheque que siga a revisar; el backend lo extiende a los demás del grupo que no tengan el dato.
  const idDestino = (grupo.cheques.find((c) => c.aRevisar) ?? grupo.cheques[0])?.id ?? grupo.id
  const guardar = useMutation({
    mutationFn: () => clasificarOcasional(idDestino, h.confirmar!.tipo, h.confirmar!.datos, true),
    onSuccess: (r) => {
      toast.success(`Guardado en ${r.cheques === 1 ? '1 cheque' : `${r.cheques} cheques`}.`)
      if (!r.recalculado) toast.error('Se guardó, pero falta recalcular: tocá "Recalcular todo".')
      setPidiendoOk(false)
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques-ocasionales'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar'),
  })
  const c = h.cuenta
  const detalle = detalleDe(h)
  const dolares = detalleDolaresDe(h)
  return (
    <li className="rounded-xl border border-neutral-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-start gap-2">
        <Insignia fuerza={h.fuerza}>{ETIQUETA_FUERZA[h.fuerza]}</Insignia>
        <span className="text-body-muted rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] dark:border-zinc-700">{ETIQUETA_TIPO[h.tipo]}</span>
        <p className="text-heading min-w-0 flex-1 text-sm font-medium">{h.titulo}</p>
      </div>
      {detalle ? (
        <PasoAPasoInteres d={detalle} />
      ) : dolares ? (
        <PasoAPasoDolares d={dolares} proveedor={grupo.proveedor} />
      ) : (
        <p className="text-body-muted mt-1.5 text-xs">{h.explicacion}</p>
      )}

      {c && !detalle && !dolares ? (
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <div>
            <dt className="text-body-muted">Base</dt>
            <dd className="font-semibold tabular-nums">{pesos(c.baseCentavos)}</dd>
          </div>
          {c.tasaPorcentaje !== null ? (
            <div>
              <dt className="text-body-muted">Tasa</dt>
              <dd className="font-semibold tabular-nums">{c.tasaPorcentaje.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%</dd>
            </div>
          ) : null}
          {h.tipo !== 'renovacion_obs' && h.tipo !== 'origen_posible' ? (
            <>
              <div>
                <dt className="text-body-muted">Debería dar</dt>
                <dd className="font-semibold tabular-nums">{pesos(c.esperadoCentavos)}</dd>
              </div>
              <div>
                <dt className="text-body-muted">{c.redondeoCheques ? 'Diferencia por redondeo' : 'Diferencia con el grupo'}</dt>
                <dd className="font-semibold tabular-nums">
                  {Math.abs(c.diferenciaCentavos) < 100 ? (
                    <span className="text-emerald-700 dark:text-emerald-400">Da justo</span>
                  ) : (
                    <DiferenciaRedondeo diferenciaCentavos={c.diferenciaCentavos} redondeoCheques={c.redondeoCheques} />
                  )}
                </dd>
              </div>
            </>
          ) : (
            <div>
              <dt className="text-body-muted">Interés que quedaría</dt>
              <dd className="font-semibold tabular-nums">{pesos(c.diferenciaCentavos)}</dd>
            </div>
          )}
        </dl>
      ) : null}

      {h.avisos.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
          {h.avisos.map((a) => (
            <li key={a} className="flex items-start gap-1">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {a}
            </li>
          ))}
        </ul>
      ) : null}

      {h.nota ? <p className="text-body-muted mt-2 text-xs">{h.nota}</p> : null}

      {h.cheques.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            className="text-brand-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
            onClick={() => setVerCheques((v) => !v)}
          >
            {verCheques ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {verCheques ? 'Ocultar' : 'Ver'} los {h.chequesTotal} cheques en los que se apoya
          </button>
          {verCheques ? (
            <div className="mt-1.5">
              <TablaCheques cheques={h.cheques} />
              {h.chequesTotal > h.cheques.length ? (
                <p className="text-body-muted mt-1 text-xs">Se muestran los primeros {h.cheques.length}.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {puedeEditar && h.confirmar ? (
        <div className="mt-3 border-t border-subtle pt-2.5">
          {pidiendoOk ? (
            <div className="space-y-2">
              <p className="text-xs">
                {h.confirmar.efecto} Se aplica a {grupo.cantidadCheques === 1 ? 'este cheque' : `los ${grupo.cantidadCheques} cheques de la operación`}.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={guardar.isPending}
                  className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  onClick={() => guardar.mutate()}
                >
                  {guardar.isPending ? 'Guardando…' : 'Sí, guardar'}
                </button>
                <button
                  type="button"
                  disabled={guardar.isPending}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  onClick={() => setPidiendoOk(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              onClick={() => setPidiendoOk(true)}
            >
              {h.confirmar.etiqueta}
            </button>
          )}
        </div>
      ) : null}
    </li>
  )
}

const pct = (p: number | null) => (p === null ? '—' : `${p.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`)

/** La renovación que se le hizo al proveedor el mismo día: qué cheques viejos se cambiaron por cuáles nuevos. */
function BloqueRenovacionDelDia({
  r,
  totalGrupoCentavos,
  interesAparte,
}: {
  r: RenovacionDelDia
  totalGrupoCentavos: number
  /** Este grupo es el interés de la renovación, pagado aparte (según la sugerencia de abajo). */
  interesAparte: boolean
}) {
  const [verCheques, setVerCheques] = useState(false)
  const vtos = (lista: ChequeEvidencia[]) => {
    const f = lista.map((c) => c.fechaVencimiento).filter((x): x is string => x !== null).sort()
    return f.length === 0 ? null : f[0] === f[f.length - 1] ? formatFecha(f[0]!) : `${formatFecha(f[0]!)} al ${formatFecha(f[f.length - 1]!)}`
  }
  const vencian = vtos(r.viejos)
  const vencen = vtos(r.nuevos)
  const meses = r.diasRenovacion != null ? Math.round(r.diasRenovacion / 30) : null
  return (
    <li className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/60 dark:bg-violet-950/20">
      <p className="font-mono text-xs">{r.obs || '(sin OBS)'}</p>
      {r.vinculada ? (
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <div>
            <dt className="text-body-muted">Cheques viejos ({r.viejos.length})</dt>
            <dd className="font-semibold tabular-nums">{pesos(r.totalViejosCentavos)}</dd>
          </div>
          <div>
            <dt className="text-body-muted">Cheques nuevos ({r.nuevos.length})</dt>
            <dd className="font-semibold tabular-nums">{pesos(r.totalNuevosCentavos)}</dd>
          </div>
          <div>
            <dt className="text-body-muted">Interés adentro de los nuevos</dt>
            <dd className="font-semibold tabular-nums">
              {r.interesCentavos === 0 ? 'No tienen: mismo importe' : `${pesos(r.interesCentavos)} (${pct(r.tasaPorcentaje)})`}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-body-muted mt-1 text-xs">
          {r.nuevos.length} cheques nuevos por <span className="font-semibold">{pesos(r.totalNuevosCentavos)}</span>. No se sabe qué cheques
          viejos reemplaza.
        </p>
      )}
      {r.vinculada && vencian && vencen ? (
        <p className="mt-2 text-xs">
          Los cheques vencían del {vencian} y se pasaron al {vencen}
          {meses !== null ? `: se corrieron ${meses} ${meses === 1 ? 'mes' : 'meses'}` : ''}.
        </p>
      ) : null}
      {interesAparte ? (
        <p className="mt-1 text-xs font-medium text-violet-900 dark:text-violet-200">
          El interés de esta renovación se pagó aparte: son los {pesos(totalGrupoCentavos)} de este grupo (ver la cuenta abajo).
        </p>
      ) : (
        <p className="mt-2 text-xs">
          Los {pesos(totalGrupoCentavos)} de este grupo son el{' '}
          {r.vinculada ? (
            <>
              <span className="font-semibold">{pct(r.grupoSobreViejosPorcentaje)}</span> de los cheques viejos y el{' '}
            </>
          ) : null}
          <span className="font-semibold">{pct(r.grupoSobreNuevosPorcentaje)}</span> de los cheques nuevos.
        </p>
      )}
      <button
        type="button"
        className="text-brand-primary mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline"
        onClick={() => setVerCheques((v) => !v)}
      >
        {verCheques ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {verCheques ? 'Ocultar' : 'Ver'} los cheques de la renovación
      </button>
      {verCheques ? (
        <div className="mt-2 space-y-3">
          {r.viejos.length > 0 ? (
            <div>
              <p className="text-body-muted mb-1 text-xs font-medium">Cheques viejos (los que se cambiaron)</p>
              <TablaCheques cheques={r.viejos} />
            </div>
          ) : null}
          <div>
            <p className="text-body-muted mb-1 text-xs font-medium">Cheques nuevos</p>
            <TablaCheques cheques={r.nuevos} />
          </div>
        </div>
      ) : null}
    </li>
  )
}

function ModalGrupo({ grupo: g, onClose, onAbrirCheque }: { grupo: GrupoARevisar; onClose: () => void; onAbrirCheque: (id: string) => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="surface-card max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-heading text-lg font-semibold">
              {g.proveedor || 'Sin beneficiario'} · emitido el {formatFecha(g.fechaEmision)}
            </h2>
            <p className="text-body-muted text-sm">
              {g.cantidadCheques} {g.cantidadCheques === 1 ? 'cheque' : 'cheques'} con el mismo OBS:{' '}
              <span className="font-mono text-xs">{g.obs || '(sin OBS)'}</span>
            </p>
            {g.beneficiario && g.beneficiario !== g.proveedor ? (
              <p className="text-body-muted text-xs">En el cheque figura como "{g.beneficiario}"</p>
            ) : null}
          </div>
          <p className="text-brand-primary whitespace-nowrap text-lg font-semibold">{pesos(g.totalCentavos)}</p>
        </header>

        {g.motivos.length > 0 ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" /> Por qué está a revisar
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {g.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="mb-4">
          <h3 className="text-heading mb-1.5 text-sm font-semibold">Cheques de esta operación</h3>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-zinc-800">
            <table className="min-w-full text-xs">
              <thead className="text-left text-body-muted">
                <tr>
                  <th className="px-2 py-1.5">Cheque</th>
                  <th className="px-2 py-1.5 text-right">Importe</th>
                  <th className="px-2 py-1.5">Vence</th>
                  <th className="px-2 py-1.5">Se cobró</th>
                  <th className="px-2 py-1.5">Estado</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {g.cheques.map((c) => (
                  <tr key={c.id} className="border-t border-subtle">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                      {c.numeroCheque}
                      {!c.aRevisar ? <span className="text-body-muted ml-1.5 font-sans">(ya resuelto)</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{pesos(c.montoCentavos)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{formatFecha(c.fechaVencimiento)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{c.fechaConciliado ? formatFecha(c.fechaConciliado) : c.pagado ? 'Sí' : 'No'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{c.estado || '—'}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" className="text-brand-primary font-medium hover:underline" onClick={() => onAbrirCheque(c.id)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {g.renovacionesDelDia.length > 0 ? (
          <section className="mb-4">
            <h3 className="text-heading mb-1.5 text-sm font-semibold">
              {g.renovacionesDelDia.length === 1 ? 'Renovación del mismo día' : 'Renovaciones del mismo día'} con {g.proveedor || 'este beneficiario'}
            </h3>
            <ul className="space-y-2">
              {g.renovacionesDelDia.map((r, i) => (
                <BloqueRenovacionDelDia
                  key={`${r.obs}-${i}`}
                  r={r}
                  totalGrupoCentavos={g.totalCentavos}
                  interesAparte={g.hipotesis.some((h) => detalleDe(h)?.tramos.some((t) => t.renovacion?.mismoDia && t.renovacion.obs === r.obs))}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mb-4">
          <h3 className="text-heading mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb className="h-4 w-4 text-amber-500" /> De dónde puede venir
          </h3>
          {g.hipotesis.length === 0 ? (
            <p className="text-body-muted rounded-xl border border-dashed border-neutral-300 p-3 text-xs dark:border-zinc-700">
              No se encontró ninguna cuenta que cierre: ni renovación, ni interés o diferencia sobre las renovaciones del proveedor, ni dólares, ni
              cheques que hayan salido en esos días. Hay que preguntarle a quien hizo la operación.
            </p>
          ) : (
            <ul className="space-y-2">
              {g.hipotesis.map((h, i) => (
                <TarjetaHipotesis key={`${h.tipo}-${i}`} h={h} grupo={g} />
              ))}
            </ul>
          )}
          <p className="text-body-muted mt-2 text-xs">
            Son sugerencias: las cuentas dan, pero lo confirma quien negoció. Si ninguna es, abrí el cheque y cargalo a mano.
          </p>
        </section>

        <section>
          <h3 className="text-heading mb-1.5 text-sm font-semibold">Qué más se le emitió ese día a {g.proveedor || 'este beneficiario'}</h3>
          {g.mismoDia.length === 0 ? (
            <p className="text-body-muted text-xs">Nada más: ese día solo se emitieron estos cheques.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {g.mismoDia.map((o) => (
                <li key={o.obs} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 px-2.5 py-1.5 dark:border-zinc-800">
                  <span className="font-mono">{o.obs || '(sin OBS)'}</span>
                  <span className="tabular-nums">
                    {o.cantidadCheques} {o.cantidadCheques === 1 ? 'cheque' : 'cheques'} · <span className="font-semibold">{pesos(o.totalCentavos)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => onAbrirCheque(g.id)}
          >
            Abrir el cheque para cargarlo a mano
          </button>
          <button type="button" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
