import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronUp, Lightbulb, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  clasificarOcasional,
  fetchRevisarAsistido,
  type ChequeEvidencia,
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
  return (
    <li className="rounded-xl border border-neutral-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-start gap-2">
        <Insignia fuerza={h.fuerza}>{ETIQUETA_FUERZA[h.fuerza]}</Insignia>
        <span className="text-body-muted rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] dark:border-zinc-700">{ETIQUETA_TIPO[h.tipo]}</span>
        <p className="text-heading min-w-0 flex-1 text-sm font-medium">{h.titulo}</p>
      </div>
      <p className="text-body-muted mt-1.5 text-xs">{h.explicacion}</p>

      {c ? (
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
                <dt className="text-body-muted">Diferencia con el grupo</dt>
                <dd className={`font-semibold tabular-nums ${Math.abs(c.diferenciaCentavos) < 100 * 50 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {Math.abs(c.diferenciaCentavos) < 100 ? 'Da justo' : pesos(c.diferenciaCentavos)}
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
function BloqueRenovacionDelDia({ r, totalGrupoCentavos }: { r: RenovacionDelDia; totalGrupoCentavos: number }) {
  const [verCheques, setVerCheques] = useState(false)
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
            <dt className="text-body-muted">Interés ya adentro de los nuevos</dt>
            <dd className="font-semibold tabular-nums">
              {pesos(r.interesCentavos)} ({pct(r.tasaPorcentaje)})
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-body-muted mt-1 text-xs">
          {r.nuevos.length} cheques nuevos por <span className="font-semibold">{pesos(r.totalNuevosCentavos)}</span>. No se sabe qué cheques
          viejos reemplaza.
        </p>
      )}
      <p className="mt-2 text-xs">
        Los {pesos(totalGrupoCentavos)} de este grupo son el{' '}
        {r.vinculada ? (
          <>
            <span className="font-semibold">{pct(r.grupoSobreViejosPorcentaje)}</span> de los cheques viejos y el{' '}
          </>
        ) : null}
        <span className="font-semibold">{pct(r.grupoSobreNuevosPorcentaje)}</span> de los cheques nuevos.
      </p>
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
                <BloqueRenovacionDelDia key={`${r.obs}-${i}`} r={r} totalGrupoCentavos={g.totalCentavos} />
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
