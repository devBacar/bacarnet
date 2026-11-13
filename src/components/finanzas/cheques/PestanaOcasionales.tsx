import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Info,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../context'
import {
  fetchChequesOcasionales,
  fetchOcasionalDetalle,
  fetchOcasionalesResumen,
  importarOcasionalesCsv,
  recalcularTodoOcasionales,
  type ChequeOcasionalItem,
  type OcasionalesFiltro,
  type OperacionDelChequeItem,
  type OperacionRenovacionItem,
  type OperacionUsdAgrupadaItem,
  type UsdPorProveedorItem,
  TEXTO_AVISO_TASA,
} from '../../../services/finanzasChequesApi'
import { finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import { usePermisosFinanzas } from '../permisosFinanzas'
import { PendientesDeRenovar } from './PendientesDeRenovar'
import { ProveedoresFinancierosCatalogo } from './ProveedoresFinancierosCatalogo'
import { Renovaciones } from './Renovaciones'
import { RevisionAsistida } from './RevisionAsistida'
import { ClasificarOperacionPanel } from './ClasificarOperacionPanel'
import { useParamsUrl, valorPermitido } from './useParamsUrl'
import { InteresSugerido, etiquetaInteresSugerido } from './InteresSugerido'
import { BotonNuevaOperacionUsd, OperacionesDolares, ModalNuevaOperacion, type PrecargarRenovacion } from './OperacionesDolares'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

const SUBVISTAS = ['cheques', 'revision', 'renovaciones', 'usd', 'operaciones', 'proveedores'] as const
type Subvista = (typeof SUBVISTAS)[number]

/** Opciones del select de la pestaña "Todos". */
const FILTRO_OPCIONES: [OcasionalesFiltro, string][] = [
  ['', 'Sin filtro'],
  ['revisar', 'A revisar'],
  ['con_renovacion', 'Con renovación'],
  ['con_usd', 'Con USD'],
  ['compra_iva', 'Compra de IVA'],
  ['otros_pagos', 'Otros pagos'],
]

/** Pestañas de arriba. Renovaciones y USD (agrupadas) viven dentro de "Cheques". */
const PESTANAS_PRINCIPALES: ['cheques' | 'revision' | 'operaciones' | 'proveedores', string][] = [
  ['cheques', 'Cheques'],
  ['revision', 'Revisión asistida'],
  ['operaciones', 'Operaciones USD / Renovaciones'],
  ['proveedores', 'Proveedores financieros'],
]

/** Listados fijos de cheques que tienen pestaña propia (además de poder elegirse en el select de "Todos"). */
const LISTAS = ['compra_iva', 'otros_pagos'] as const
type Lista = (typeof LISTAS)[number]

/** Pestañas de abajo, dentro de "Cheques". */
type PestanaCheques = 'todos' | 'renovaciones' | 'usd' | Lista
const PESTANAS_CHEQUES: [PestanaCheques, string][] = [
  ['todos', 'Todos'],
  ['renovaciones', 'Operaciones y renovaciones'],
  ['usd', 'Operaciones USD (agrupadas)'],
  ['compra_iva', 'Compra IVA'],
  ['otros_pagos', 'Otros pagos'],
]

/** Misma clave que el backend: los otros pagos se juntan por fecha de emisión + OBS + beneficiario. */
function claveGrupoOtroPago(ch: ChequeOcasionalItem): string {
  return `${ch.fechaEmision ?? ''}|${ch.obsOriginal.trim().toLowerCase()}|${ch.beneficiarioNormalizado}`
}

/** Junta cheques consecutivos con la misma clave (el backend ya los manda ordenados por grupo). */
function agruparOtrosPagos(cheques: ChequeOcasionalItem[]): ChequeOcasionalItem[][] {
  const grupos: ChequeOcasionalItem[][] = []
  let clave: string | null = null
  for (const ch of cheques) {
    const k = claveGrupoOtroPago(ch)
    if (k === clave) grupos[grupos.length - 1].push(ch)
    else {
      grupos.push([ch])
      clave = k
    }
  }
  return grupos
}

export function PestanaOcasionales() {
  const { user } = useAuth()
  const puedeEditarCheques = usePermisosFinanzas().cheques
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const { params, cambiar } = useParamsUrl()
  const filtroSelect = valorPermitido<OcasionalesFiltro>(params.get('filtro'), FILTRO_OPCIONES.map(([v]) => v), '')
  const lista = valorPermitido<Lista | ''>(params.get('lista'), ['', ...LISTAS], '')
  /** Lo que se le pide al backend: la pestaña fija manda; en "Todos", lo que diga el select. */
  const filtro: OcasionalesFiltro = lista || filtroSelect
  /** Agrupado solo en la pestaña "Otros pagos"; en "Todos" la lista va siempre cheque por cheque. */
  const agrupar = lista === 'otros_pagos'
  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  const [montoMin, setMontoMin] = useState('')
  const [montoMinAplicado, setMontoMinAplicado] = useState('')
  const [montoMax, setMontoMax] = useState('')
  const [montoMaxAplicado, setMontoMaxAplicado] = useState('')
  const [campoFecha, setCampoFecha] = useState<'vencimiento' | 'emision'>('vencimiento')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  // Seguimiento ahora vive dentro de Renovaciones: los links viejos con ?sub=seguimiento abren ahí.
  const subParam = params.get('sub')
  const subvista = valorPermitido(subParam === 'seguimiento' ? 'renovaciones' : subParam, SUBVISTAS, 'cheques')
  const vistaUsd = valorPermitido(params.get('usd'), ['general', 'proveedor'] as const, 'general')
  /** Cambiar de sub-pestaña limpia lo que era propio de la anterior. */
  const setSubvista = (v: Subvista) =>
    cambiar({ sub: v === 'cheques' ? null : v, lista: null, benef: null, usd: null, seg: null, ver: null, cadena: null })
  const setVistaUsd = (v: 'general' | 'proveedor') => cambiar({ usd: v === 'general' ? null : v })
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [mostrarMesesViejos, setMostrarMesesViejos] = useState(false)
  const [precargarRenov, setPrecargarRenov] = useState<PrecargarRenovacion | null>(null)

  const importMutation = useMutation({
    mutationFn: (file: File) => importarOcasionalesCsv(file),
    onSuccess: (res) => {
      setImportMsg(res.mensaje)
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques-ocasionales'] })
    },
    onError: (err) => {
      setImportMsg(err instanceof Error ? err.message : 'Error al importar CSV')
    },
  })
  const recalcularMutation = useMutation({
    mutationFn: recalcularTodoOcasionales,
    onSuccess: (r) => {
      toast.success(
        r.chequesActualizados > 0
          ? `Recalculado: se actualizaron ${r.chequesActualizados} cheques`
          : 'Recalculado: no había nada para actualizar',
      )
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques-ocasionales'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo recalcular'),
  })
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(busqueda.trim())
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [busqueda])

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', filtro, agrupar, q, montoMinAplicado, montoMaxAplicado, campoFecha, fechaDesde, fechaHasta, page],
    queryFn: () =>
      fetchChequesOcasionales({
        filtro,
        q: q || undefined,
        montoDesde: montoMinAplicado || undefined,
        montoHasta: montoMaxAplicado || undefined,
        campoFecha,
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
        page,
        agrupar,
      }),
    enabled: Boolean(user),
    placeholderData: (prev) => prev,
  })

  const { data: resumen } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'resumen'],
    queryFn: fetchOcasionalesResumen,
    enabled: Boolean(user),
  })

  const total = data?.total ?? 0
  const paginas = Math.max(1, data?.pages ?? 1)

  /** Con beneficiario, muestra todas sus renovaciones (también las cerradas): el cheque puede estar en una vieja. */
  const irARenovaciones = (beneficiarioNormalizado: string) =>
    cambiar({
      sub: 'renovaciones',
      lista: null,
      benef: beneficiarioNormalizado || null,
      seg: beneficiarioNormalizado ? 'todas' : null,
      usd: null,
      ver: null,
      cadena: null,
    })

  const descripcionVista: Record<typeof subvista, string> = {
    cheques: 'Listado de todos los cheques ocasionales importados desde Vientri. Filtrá con el desplegable, buscá por texto del OBS y acotá por fecha o monto.',
    revision:
      'Los cheques a revisar, juntos por operación (mismo beneficiario, misma emisión y mismo OBS). Abrí una para ver de dónde puede venir: renovación, interés, diferencia, dólares o cheques que salieron en esos días.',
    renovaciones:
      'Cada préstamo desde el principio: la operación inicial (el OBS dice capital), qué cheques se cambiaron por otros nuevos, con qué interés, y cuánta plata sigue "en la calle" (cheques pendientes o rechazados que todavía no se cobraron ni se renovaron). Filtrá por iniciales sin renovar, iniciales renovadas o renovaciones; "Ver cadena" muestra el préstamo y todas sus renovaciones encadenadas.',
    usd: 'Operaciones en dólares, con el nombre del proveedor tal como está en el catálogo. Podés verlas una por una o sumadas por proveedor.',
    operaciones: 'Detalle de cada operación USD individual con su tipo de cambio y montos.',
    proveedores: 'Catálogo de proveedores financieros. Cada uno reúne todas las formas en que aparece escrito su nombre en los cheques; abajo están los nombres que todavía no se asignaron a ninguno.',
  }

  /** Pestaña de arriba activa: Renovaciones y USD (agrupadas) cuentan como "Cheques". */
  const pestanaPrincipal = subvista === 'renovaciones' || subvista === 'usd' ? 'cheques' : subvista
  /** Pestaña de abajo activa (solo dentro de "Cheques"). */
  const pestanaCheques: PestanaCheques =
    subvista === 'renovaciones' || subvista === 'usd' ? subvista : lista || 'todos'
  const elegirPestanaCheques = (p: PestanaCheques) => {
    if (p === 'renovaciones' || p === 'usd') {
      setSubvista(p)
      return
    }
    cambiar({
      sub: null,
      lista: p === 'todos' ? null : p,
      benef: null,
      usd: null,
      seg: null,
      ver: null,
      cadena: null,
    })
    setPage(1)
  }

  const claseBoton = (activo: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      activo ? 'bg-brand-primary text-white shadow-sm' : 'text-body-muted hover:text-heading'
    }`

  /** Todos | Renovaciones | Operaciones USD (agrupadas) | Compra IVA | Otros pagos */
  const pestanasCheques = (
    <div className="inline-flex flex-wrap rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
      {PESTANAS_CHEQUES.map(([val, label]) => (
        <button key={val} type="button" onClick={() => elegirPestanaCheques(val)} className={claseBoton(pestanaCheques === val)}>
          {label}
        </button>
      ))}
    </div>
  )

  const subTabs = (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
          {PESTANAS_PRINCIPALES.map(([val, label]) => (
            <button key={val} type="button" onClick={() => setSubvista(val)} className={claseBoton(pestanaPrincipal === val)}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                setImportMsg(null)
                importMutation.mutate(file)
              }
              e.target.value = ''
            }}
          />
          <BotonNuevaOperacionUsd />
          {puedeEditarCheques ? (
            <button
              type="button"
              disabled={recalcularMutation.isPending}
              onClick={() => recalcularMutation.mutate()}
              title="Vuelve a calcular los avisos, los dólares leídos del OBS, las renovaciones y el seguimiento, sin importar un CSV"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${recalcularMutation.isPending ? 'animate-spin' : ''}`} />
              {recalcularMutation.isPending ? 'Recalculando…' : 'Recalcular todo'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={importMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <Upload className="h-3.5 w-3.5" />
            {importMutation.isPending ? 'Importando…' : 'Importar CSV'}
          </button>
          {importMsg ? (
            <span className={`text-xs ${importMutation.isError ? 'text-danger' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {importMsg}
            </span>
          ) : null}
        </div>
      </div>
      {/* En el listado van abajo del costo financiero; en Renovaciones y USD, que no lo tienen, quedan acá. */}
      {subvista === 'renovaciones' || subvista === 'usd' ? pestanasCheques : null}
      <p className="flex items-start gap-1.5 text-xs text-body-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-zinc-500" />
        {descripcionVista[subvista]}
      </p>
    </div>
  )

  if (subvista === 'revision') {
    return (
      <>
        {subTabs}
        <RevisionAsistida onAbrirCheque={setDetalleId} />
        {detalleId ? <OcasionalDetalleModal id={detalleId} onClose={() => setDetalleId(null)} /> : null}
      </>
    )
  }

  if (subvista === 'renovaciones') {
    return (
      <>
        {subTabs}
        <PendientesDeRenovar
          onRenovarConOperacion={(ids, capital) => {
            setPrecargarRenov({ chequeViejoIds: ids, capitalCentavos: capital })
          }}
        />
        {precargarRenov ? (
          <ModalNuevaOperacion
            onClose={() => setPrecargarRenov(null)}
            precargar={precargarRenov}
          />
        ) : null}
        <Renovaciones />
      </>
    )
  }

  if (subvista === 'proveedores') {
    return (
      <>
        {subTabs}
        <ProveedoresFinancierosCatalogo />
      </>
    )
  }

  if (subvista === 'operaciones') {
    return (
      <>
        {subTabs}
        <OperacionesDolares />
      </>
    )
  }

  if (subvista === 'usd') {
    const ops = resumen?.operacionesUsdAgrupadas ?? []
    const porProveedor = resumen?.usdPorProveedor ?? []
    return (
      <>
        {subTabs}
        <div className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-heading text-sm font-semibold">
                Operaciones en Dólares agrupadas (detección de fraccionamiento)
              </h3>
              <p className="text-body-muted text-xs">
                Agrupa cheques del mismo proveedor, monto USD y cotización pactada para identificar operaciones grandes partidas en varios cheques chicos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {resumen?.totalMontoUsd ? (
                <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                  {ops.length} operaciones reales · US$ {resumen.totalMontoUsd.toLocaleString('es-AR')} (TC prom. $ {(resumen.cotizacionPromedioUsd ?? 0).toLocaleString('es-AR')})
                </span>
              ) : null}
              <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
                {([
                  ['general', 'Vista general'],
                  ['proveedor', 'Por proveedor'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setVistaUsd(val)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      vistaUsd === val ? 'bg-brand-primary text-white shadow-sm' : 'text-body-muted hover:text-heading'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {ops.length === 0 ? (
            <p className="text-body-muted py-6 text-center text-sm">No hay operaciones en USD registradas.</p>
          ) : vistaUsd === 'proveedor' ? (
            <TablaUsdPorProveedor grupos={porProveedor} />
          ) : (
            <TablaUsdAgrupadas ops={ops} />
          )}
        </div>
      </>
    )
  }

  return (
    <>
      {subTabs}
      {resumen ? (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ResumenCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              label="Compromisos pendientes"
              value={String(resumen.pendientesCantidad ?? resumen.totalCheques)}
              subvalue={
                resumen.pendientesMontoCentavos != null
                  ? formatMoneyCentavos(resumen.pendientesMontoCentavos, 'ARS')
                  : undefined
              }
              hint={
                resumen.fechasImposiblesCantidad
                  ? `Total: ${resumen.totalCheques} (${resumen.fechasImposiblesCantidad} fecha inv.)`
                  : `Total ocasionales: ${resumen.totalCheques}`
              }
            />
            <ResumenCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              label="A revisar"
              value={String(resumen.revisarCantidad ?? 0)}
              subvalue={
                resumen.revisarMontoCentavos != null
                  ? formatMoneyCentavos(resumen.revisarMontoCentavos, 'ARS')
                  : undefined
              }
              hint="Cheques para controlar uno por uno"
            />
            <ResumenCard
              icon={<RefreshCw className="h-4 w-4 text-blue-500" />}
              label="Con renovación"
              value={String(resumen.conRenovacion)}
              subvalue={
                resumen.costoFinanciero.cantidadCadenas > 0
                  ? `Interés: ${formatMoneyCentavos(resumen.costoFinanciero.interesTotalCentavos, 'ARS')}`
                  : undefined
              }
              hint={
                resumen.costoFinanciero.cantidadCadenas > 0
                  ? `${resumen.costoFinanciero.cantidadCadenas} cadenas${
                      resumen.tasaRenovaciones?.tasaMensualPromedio != null
                        ? ` · Tasa ${(resumen.tasaRenovaciones.tasaMensualPromedio * 100).toFixed(1)}% por mes`
                        : ''
                    }`
                  : undefined
              }
            />
            <ResumenCard
              icon={<DollarSign className="h-4 w-4 text-green-500" />}
              label="Operaciones USD / Renovaciones"
              value={
                resumen.operacionesUsdUnicas != null
                  ? `${resumen.operacionesUsdUnicas} ops (${resumen.conUsd} chq)`
                  : String(resumen.conUsd)
              }
              subvalue={
                resumen.totalMontoUsd
                  ? `US$ ${resumen.totalMontoUsd.toLocaleString('es-AR')}`
                  : undefined
              }
              hint={
                resumen.cotizacionPromedioUsd
                  ? `TC prom. $ ${resumen.cotizacionPromedioUsd.toLocaleString('es-AR')} · click en solapa USD`
                  : undefined
              }
            />
          </div>

          {resumen.porMes && resumen.porMes.length > 0 ? (() => {
            const ahora = new Date()
            const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
            const esMesViejo = (mes: string) => /^\d{4}-\d{2}$/.test(mes) && mes < mesActual
            const viejos = resumen.porMes.filter((m) => esMesViejo(m.mes))
            const cercanos = resumen.porMes.filter((m) => !esMesViejo(m.mes))
            const tienenAmbos = viejos.length > 0 && cercanos.length > 0
            const visibles = !tienenAmbos || mostrarMesesViejos ? resumen.porMes : cercanos

            return (
              <div className="surface-card mb-4 rounded-2xl border border-neutral-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-body-muted text-xs font-medium uppercase tracking-wide">
                    Concentración de vencimientos pendientes por mes
                  </p>
                  {tienenAmbos ? (
                    <button
                      type="button"
                      onClick={() => setMostrarMesesViejos((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                      {mostrarMesesViejos ? (
                        <>
                          Ocultar meses anteriores ({viejos.length})
                          <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          Ver meses anteriores ({viejos.length})
                          <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {visibles.map((m) => (
                    <div
                      key={m.mes}
                      className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800/60"
                    >
                      <span className="text-heading font-semibold">{m.mes}</span>
                      <span className="text-body-muted ml-1.5">({m.cantidad})</span>
                      <span className="text-brand-primary ml-2 font-semibold tabular-nums">
                        {formatMoneyCentavos(m.montoCentavos, 'ARS')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })() : null}
        </>
      ) : null}

      {resumen && resumen.costoFinanciero.cantidadCadenas > 0 ? (
        <button
          type="button"
          onClick={() => irARenovaciones('')}
          className="surface-card mb-4 block w-full rounded-2xl border border-violet-200 p-3 text-left hover:bg-violet-50/50 dark:border-violet-900/70 dark:hover:bg-violet-950/20"
          title="Ver cadenas de renovación"
        >
          <p className="text-body-muted text-xs font-medium uppercase tracking-wide">Costo financiero estimado</p>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            <span>
              <span className="text-body-muted">Cadenas:</span>{' '}
              <span className="text-heading font-medium">{resumen.costoFinanciero.cantidadCadenas}</span>
            </span>
            <span>
              <span className="text-body-muted">Capital inicial:</span>{' '}
              <span className="text-heading font-medium">{formatMoneyCentavos(resumen.costoFinanciero.capitalTotalCentavos, 'ARS')}</span>
            </span>
            <span>
              <span className="text-body-muted">Interés total:</span>{' '}
              <span className="font-medium text-red-600 dark:text-red-400">{formatMoneyCentavos(resumen.costoFinanciero.interesTotalCentavos, 'ARS')}</span>
            </span>
            {resumen.tasaRenovaciones?.tasaMensualPromedio != null ? (
              <span
                title={`Promedio de ${resumen.tasaRenovaciones.operacionesContadas} renovaciones, pesado por lo que se renovó.${
                  resumen.tasaRenovaciones.operacionesConAviso > 0
                    ? ` Quedan afuera ${resumen.tasaRenovaciones.operacionesConAviso} con pagos parciales, cheques que faltan o plata nueva.`
                    : ''
                }`}
              >
                <span className="text-body-muted">Tasa promedio:</span>{' '}
                <span className="text-heading font-medium">
                  {(resumen.tasaRenovaciones.tasaMensualPromedio * 100).toFixed(1)}% por mes
                </span>
              </span>
            ) : null}
          </div>
        </button>
      ) : null}

      <div className="mb-4">{pestanasCheques}</div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {pestanaCheques === 'todos' ? (
          <label className="w-full text-sm sm:w-48">
            <span className="text-body-muted mb-1 block">Filtro</span>
            <select
              className={finanzasInputClass}
              value={filtroSelect}
              onChange={(e) => {
                cambiar({ filtro: e.target.value || null })
                setPage(1)
              }}
            >
              {FILTRO_OPCIONES.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            className={`${finanzasInputClass} pl-9`}
            placeholder="Buscar en el OBS…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {busqueda ? (
            <button
              type="button"
              className="text-body-muted hover:text-heading absolute right-2 top-1/2 -translate-y-1/2 px-1"
              onClick={() => setBusqueda('')}
            >
              ×
            </button>
          ) : null}
        </div>
        <form
          className="w-full text-sm sm:w-40"
          onSubmit={(e) => {
            e.preventDefault()
            setMontoMinAplicado(montoMin.trim())
            setPage(1)
          }}
        >
          <span className="text-body-muted mb-1 block">Monto desde</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className={finanzasInputClass}
            value={montoMin}
            placeholder="$ y Enter"
            onChange={(e) => setMontoMin(e.target.value)}
          />
        </form>
        <form
          className="w-full text-sm sm:w-40"
          onSubmit={(e) => {
            e.preventDefault()
            setMontoMaxAplicado(montoMax.trim())
            setPage(1)
          }}
        >
          <span className="text-body-muted mb-1 block">Monto hasta</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className={finanzasInputClass}
            value={montoMax}
            placeholder="$ y Enter"
            onChange={(e) => setMontoMax(e.target.value)}
          />
        </form>
        <label className="w-full text-sm sm:w-36">
          <span className="text-body-muted mb-1 block">Fecha de</span>
          <select
            className={finanzasInputClass}
            value={campoFecha}
            onChange={(e) => { setCampoFecha(e.target.value as 'vencimiento' | 'emision'); setPage(1) }}
          >
            <option value="vencimiento">Vencimiento</option>
            <option value="emision">Emisión</option>
          </select>
        </label>
        <label className="w-full text-sm sm:w-40">
          <span className="text-body-muted mb-1 block">Desde</span>
          <input
            type="date"
            className={finanzasInputClass}
            value={fechaDesde}
            max={fechaHasta || undefined}
            onChange={(e) => { setFechaDesde(e.target.value); setPage(1) }}
          />
        </label>
        <label className="w-full text-sm sm:w-40">
          <span className="text-body-muted mb-1 block">Hasta</span>
          <input
            type="date"
            className={finanzasInputClass}
            value={fechaHasta}
            min={fechaDesde || undefined}
            onChange={(e) => { setFechaHasta(e.target.value); setPage(1) }}
          />
        </label>
        {fechaDesde || fechaHasta ? (
          <button
            type="button"
            className="text-body-muted hover:text-heading self-end pb-2 text-xs underline"
            onClick={() => { setFechaDesde(''); setFechaHasta(''); setPage(1) }}
          >
            Quitar fechas
          </button>
        ) : null}
        {data ? (
          <span className="text-body-muted pb-2 text-sm whitespace-nowrap">
            {total.toLocaleString('es-AR')} cheques · {formatMoneyCentavos(data.totalCentavos, 'ARS')}
          </span>
        ) : null}
      </div>

      {isError ? (
        <p className="text-danger text-sm">{error instanceof Error ? error.message : 'No se pudieron cargar los cheques ocasionales'}</p>
      ) : null}

      {isLoading ? (
        <p className="text-body-muted text-sm">Cargando cheques ocasionales…</p>
      ) : (
        <div className={`overflow-x-auto rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900 ${isFetching ? 'opacity-70' : ''}`}>
          <table className="min-w-full text-[0.8125rem]">
            <thead className="border-b border-[var(--color-primary-muted)] bg-brand-primary-light text-left text-xs font-medium text-brand-primary">
              <tr>
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">Beneficiario</th>
                <th className="px-3 py-2">Emisión</th>
                <th className="px-3 py-2">Vencimiento</th>
                <th className="px-3 py-2 text-right">Importe</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">OBS</th>
              </tr>
            </thead>
            <tbody>
              {agrupar
                ? agruparOtrosPagos(data?.cheques ?? []).map((grupo) => (
                    <Fragment key={claveGrupoOtroPago(grupo[0])}>
                      <tr className="border-t border-neutral-300 bg-neutral-100 text-xs dark:border-zinc-700 dark:bg-zinc-800/60">
                        <td colSpan={8} className="px-3 py-2">
                          <span className="text-heading font-semibold">{grupo[0].beneficiario || '—'}</span>
                          <span className="text-body-muted"> · emitido el {formatFecha(grupo[0].fechaEmision)}</span>
                          {grupo[0].obsOriginal ? <span className="text-body-muted"> · {grupo[0].obsOriginal}</span> : null}
                          <span className="text-body-muted"> · {grupo.length} {grupo.length === 1 ? 'cheque' : 'cheques'} · </span>
                          <span className="text-brand-primary font-semibold">
                            {formatMoneyCentavos(grupo.reduce((s, c) => s + c.montoCentavos, 0), 'ARS')}
                          </span>
                        </td>
                      </tr>
                      {grupo.map((ch) => (
                        <OcasionalRow
                          key={ch.vientriId}
                          ch={ch}
                          onAbrir={() => setDetalleId(`oca-${ch.vientriId}`)}
                          onVerRenov={() => irARenovaciones(ch.beneficiarioNormalizado)}
                        />
                      ))}
                    </Fragment>
                  ))
                : (data?.cheques ?? []).map((ch) => (
                    <OcasionalRow
                      key={ch.vientriId}
                      ch={ch}
                      onAbrir={() => setDetalleId(`oca-${ch.vientriId}`)}
                      onVerRenov={() => irARenovaciones(ch.beneficiarioNormalizado)}
                    />
                  ))}
            </tbody>
          </table>
          {(data?.cheques.length ?? 0) === 0 ? (
            <p className="text-body-muted px-4 py-8 text-center">No hay cheques ocasionales con esos filtros.</p>
          ) : null}
        </div>
      )}

      {!isLoading && total > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="border-subtle rounded border px-3 py-1.5 disabled:opacity-40"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((c) => Math.max(1, c - 1))}
          >
            Anterior
          </button>
          <span className="text-body-muted">
            Página {page} de {paginas.toLocaleString('es-AR')}
          </span>
          <button
            type="button"
            className="border-subtle rounded border px-3 py-1.5 disabled:opacity-40"
            disabled={page >= paginas || isFetching}
            onClick={() => setPage((c) => c + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}

      {detalleId ? <OcasionalDetalleModal id={detalleId} onClose={() => setDetalleId(null)} /> : null}
    </>
  )
}

function OcasionalRow({ ch, onAbrir, onVerRenov }: { ch: ChequeOcasionalItem; onAbrir: () => void; onVerRenov: () => void }) {
  return (
    <tr
      className="cursor-pointer border-t border-subtle hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      onClick={onAbrir}
    >
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
        <span className="inline-flex items-center gap-1">
          {ch.numeroCheque}
          {ch.revisar.length > 0 ? (
            <span title={`Revisar: ${ch.revisar.join(' · ')}`} aria-label="Datos a revisar">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </span>
          ) : null}
        </span>
      </td>
      <td className="px-3 py-2">{ch.beneficiario || '—'}</td>
      <td className="whitespace-nowrap px-3 py-2">{formatFecha(ch.fechaEmision)}</td>
      <td className="whitespace-nowrap px-3 py-2">{formatFecha(ch.fechaVencimiento)}</td>
      <td className="text-brand-primary whitespace-nowrap px-3 py-2 text-right font-medium">
        {formatMoneyCentavos(ch.montoCentavos, 'ARS')}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
          ch.pagado
            ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
            : 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
        }`}>
          {ch.estado || (ch.pagado ? 'Pagado' : 'Pendiente')}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {ch.esRenovacion || ch.renovadoPor.length > 0 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onVerRenov() }}
              title="Ver cadena de renovación"
              className="inline-block rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
            >
              Renov.
            </button>
          ) : null}
          {ch.operacionUsd ? (
            <span className="inline-block rounded border border-green-300 bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-900 dark:border-green-700 dark:bg-green-900/40 dark:text-green-200">
              USD
            </span>
          ) : null}
          {ch.esCompraIva ? (
            <span className="inline-block rounded border border-sky-300 bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
              Compra IVA
            </span>
          ) : null}
          {ch.revisar.length > 0 ? (
            <span className="inline-block rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              A revisar
            </span>
          ) : null}
          {ch.interesSugerido ? (
            <span
              title={ch.revisar.find((r) => r.startsWith('Posible interés')) ?? ''}
              className="inline-block rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-900 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
            >
              {etiquetaInteresSugerido(ch.interesSugerido)}
            </span>
          ) : null}
        </div>
      </td>
      <td className="max-w-[200px] truncate px-3 py-2 text-xs text-body-muted" title={ch.obsOriginal}>
        {ch.obsOriginal || '—'}
      </td>
    </tr>
  )
}

function ResumenCard({
  icon,
  label,
  value,
  subvalue,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subvalue?: string
  hint?: string
}) {
  return (
    <div className="surface-card rounded-2xl border border-neutral-200 p-3 dark:border-zinc-800">
      <div className="text-body-muted flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </div>
      <p className="text-heading mt-1 text-lg font-bold tabular-nums">{value}</p>
      {subvalue ? <p className="text-brand-primary text-xs font-semibold tabular-nums">{subvalue}</p> : null}
      {hint ? <p className="text-body-muted mt-0.5 text-[11px]">{hint}</p> : null}
    </div>
  )
}

/** Una renovación vista como operación: todos los cheques que vencían contra todos los que los reemplazaron. */
function OperacionDelCheque({
  titulo,
  op,
  numeroCheque,
}: {
  titulo: string
  op: OperacionDelChequeItem
  numeroCheque: string
}) {
  const listaCheques = (cheques: OperacionRenovacionItem['chequesViejos']) => (
    <ul className="mt-1 space-y-0.5">
      {cheques.map((c) => {
        const esEste = c.numeroCheque === numeroCheque
        return (
          <li
            key={c.numeroCheque}
            className={`flex flex-wrap items-center justify-between gap-2 font-mono ${esEste ? 'font-semibold text-violet-900 dark:text-violet-200' : ''}`}
          >
            <span>
              {c.numeroCheque}
              {esEste ? <span className="ml-1 font-sans text-[11px]">(este)</span> : null}
            </span>
            <span>
              {formatMoneyCentavos(c.montoCentavos, 'ARS')}
              {c.fechaVencimiento ? ` · vto ${formatFecha(c.fechaVencimiento)}` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="rounded-lg border border-violet-200/70 bg-white/60 p-2.5 text-xs dark:border-violet-800/50 dark:bg-transparent">
      <p className="text-heading font-semibold">{titulo}</p>
      {op.obsOriginal ? <p className="text-body-muted mt-0.5">OBS: {op.obsOriginal}</p> : null}

      {op.vinculada ? (
        <>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-body-muted">Vencían</dt>
            <dd className="text-right">
              {op.chequesViejos.length} {op.chequesViejos.length === 1 ? 'cheque' : 'cheques'} ·{' '}
              <span className="text-heading font-semibold">{formatMoneyCentavos(op.totalViejosCentavos, 'ARS')}</span>
            </dd>
            <dt className="text-body-muted">Se reemplazaron por</dt>
            <dd className="text-right">
              {op.chequesNuevos.length} {op.chequesNuevos.length === 1 ? 'cheque' : 'cheques'} ·{' '}
              <span className="text-heading font-semibold">{formatMoneyCentavos(op.totalNuevosCentavos, 'ARS')}</span>
              {op.fechaVtoNuevos ? ` · vencen ${formatFecha(op.fechaVtoNuevos)}` : ''}
            </dd>
            {op.interesCentavos === 0 && op.interesAparte ? (
              <>
                <dt className="text-body-muted">Interés adentro de los nuevos</dt>
                <dd className="text-right">No tienen: mismo importe</dd>
              </>
            ) : (
              <>
                <dt className="text-body-muted">Interés de la operación</dt>
                <dd className="text-right font-semibold text-red-600 dark:text-red-400">
                  {formatMoneyCentavos(op.interesCentavos, 'ARS')}
                  {op.avisoTasa ? null : op.tasaMensualEstimada !== null ? (
                    <span className="block">
                      {(op.tasaMensualEstimada * 100).toFixed(1)}% por mes
                      <span className="text-body-muted font-normal">
                        {' '}({(op.tasaImplicita * 100).toFixed(1)}% en {op.diasRenovacion} días)
                      </span>
                    </span>
                  ) : (
                    ` (${(op.tasaImplicita * 100).toFixed(1)}%)`
                  )}
                </dd>
                {op.avisoTasa ? (
                  <dd className="col-span-2 mt-0.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                    {TEXTO_AVISO_TASA[op.avisoTasa]}
                    {op.avisoTasa === 'faltan_viejos' && op.viejosNoEncontrados?.length
                      ? ` (no está: ${op.viejosNoEncontrados.join(', ')})`
                      : ''}
                    .
                  </dd>
                ) : null}
              </>
            )}
            {op.interesAparte ? (
              <>
                <dt className="text-body-muted">Interés pagado aparte</dt>
                <dd className="text-right font-semibold text-red-600 dark:text-red-400">
                  {formatMoneyCentavos(op.interesAparte.totalCentavos, 'ARS')} en {op.interesAparte.cantidadCheques}{' '}
                  {op.interesAparte.cantidadCheques === 1 ? 'cheque' : 'cheques'}
                  <span className="text-body-muted block font-normal">
                    {op.interesAparte.tasaPorcentaje.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%
                    {op.interesAparte.porMes
                      ? ` mensual × ${op.interesAparte.meses} ${op.interesAparte.meses === 1 ? 'mes' : 'meses'}`
                      : ''}{' '}
                    sobre {op.interesAparte.baseDescripcion}
                  </span>
                </dd>
              </>
            ) : null}
          </dl>
          <details className="mt-2">
            <summary className="cursor-pointer text-violet-800 dark:text-violet-300">
              Ver los {op.chequesViejos.length + op.chequesNuevos.length} cheques de la operación
            </summary>
            <p className="text-body-muted mt-1.5 font-medium">Vencían</p>
            {listaCheques(op.chequesViejos)}
            <p className="text-body-muted mt-1.5 font-medium">Los reemplazaron</p>
            {listaCheques(op.chequesNuevos)}
          </details>
        </>
      ) : (
        <>
          <p className="text-body-muted mt-1">
            {op.chequesNuevos.length} {op.chequesNuevos.length === 1 ? 'cheque nuevo' : 'cheques nuevos'} por{' '}
            {formatMoneyCentavos(op.totalNuevosCentavos, 'ARS')}. No se encontraron los cheques que reemplaza, así que
            no se puede calcular el interés.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-violet-800 dark:text-violet-300">Ver los cheques nuevos</summary>
            {listaCheques(op.chequesNuevos)}
          </details>
        </>
      )}
    </div>
  )
}

function OcasionalDetalleModal({ id, onClose }: { id: string; onClose: () => void }) {
  const puedeEditarCheques = usePermisosFinanzas().cheques
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'detalle', id],
    queryFn: () => fetchOcasionalDetalle(id),
  })
  const ch = data?.cheque
  const opOrigen = data?.operacionOrigen ?? null
  const opRenovacion = data?.operacionRenovacion ?? null
  const renovDe = data?.renovacionDeDetalle ?? []
  const renovPor = data?.renovadoPorDetalle ?? []

  const sumaViejosCentavos = renovDe.reduce((s, r) => s + (r.montoCentavos ?? 0), 0)
  const todosViejosConMonto = renovDe.length > 0 && renovDe.every((r) => r.montoCentavos !== null)
  const interesPasoCentavos =
    ch && todosViejosConMonto && renovDe.length === 1
      ? ch.montoCentavos - sumaViejosCentavos
      : null

  const equivalenteUsdCentavos =
    ch?.operacionUsd
      ? Math.round(ch.operacionUsd.montoUsd * ch.operacionUsd.cotizacion * 100)
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="surface-card w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <p className="text-body-muted py-8 text-center text-sm">Cargando detalle…</p>
        ) : isError || !ch ? (
          <p className="text-danger py-8 text-center text-sm">No se pudo cargar el detalle</p>
        ) : (
          <>
            <header className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-heading text-lg font-semibold">Cheque {ch.numeroCheque}</h2>
                <p className="text-body-muted text-sm">
                  {ch.beneficiario || '—'} · {ch.estado || (ch.pagado ? 'Pagado' : 'Pendiente')}
                </p>
              </div>
              <p className="text-brand-primary whitespace-nowrap text-lg font-semibold">
                {formatMoneyCentavos(ch.montoCentavos, 'ARS')}
              </p>
            </header>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-body-muted">Beneficiario real (DESTINATARIO)</dt>
              <dd className="font-medium">
                {ch.beneficiario || '—'}
                {ch.beneficiarioDesdeRenovacion ? (
                  <span className="text-body-muted ml-1.5 text-xs font-normal">(vino sin destinatario: se tomó de los cheques que renueva)</span>
                ) : ch.beneficiarioDesdeObs ? (
                  <span className="text-body-muted ml-1.5 text-xs font-normal">(vino sin destinatario: se tomó del OBS)</span>
                ) : null}
              </dd>
              <dt className="text-body-muted">Emisión</dt>
              <dd>{formatFecha(ch.fechaEmision)}</dd>
              <dt className="text-body-muted">Vencimiento</dt>
              <dd>{formatFecha(ch.fechaVencimiento)}</dd>
              <dt className="text-body-muted">Pagado</dt>
              <dd>{ch.pagado ? 'Sí' : 'No (Compromiso pendiente)'}</dd>
              {ch.obsOriginal ? (
                <>
                  <dt className="text-body-muted">OBS original</dt>
                  <dd className="font-mono text-xs">{ch.obsOriginal}</dd>
                </>
              ) : null}
            </dl>

            {ch.operacionUsd ? (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50/60 p-3 text-sm dark:border-green-900/60 dark:bg-green-950/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-800 dark:text-green-300">
                  Cálculo Operación en Dólares (OBS)
                </p>
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-body-muted">Monto USD</dt>
                  <dd className="font-semibold">
                    US$ {ch.operacionUsd.montoUsd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </dd>
                  <dt className="text-body-muted">Tipo de cambio pactado</dt>
                  <dd className="font-semibold">
                    $ {ch.operacionUsd.cotizacion.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </dd>
                  {equivalenteUsdCentavos !== null ? (
                    <>
                      <dt className="text-body-muted">Equivalente (USD × TC)</dt>
                      <dd className="font-semibold">{formatMoneyCentavos(equivalenteUsdCentavos, 'ARS')}</dd>
                      <dt className="text-body-muted">Importe de este cheque</dt>
                      <dd className="font-semibold">
                        {formatMoneyCentavos(ch.montoCentavos, 'ARS')}
                        {ch.montoCentavos < equivalenteUsdCentavos
                          ? ' (fraccionado en varios cheques)'
                          : ch.montoCentavos > equivalenteUsdCentavos
                            ? ` (+${formatMoneyCentavos(ch.montoCentavos - equivalenteUsdCentavos, 'ARS')} s/ equivalente)`
                            : ''}
                      </dd>
                    </>
                  ) : null}
                </dl>
              </div>
            ) : null}

            {opOrigen || opRenovacion || renovDe.length > 0 || renovPor.length > 0 ? (
              <div className="mt-4 space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 text-sm dark:border-violet-900/60 dark:bg-violet-950/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-900 dark:text-violet-300">
                  Renovación y costo financiero
                </p>

                {opOrigen ? (
                  <OperacionDelCheque
                    titulo={`Salió de la renovación del ${formatFecha(opOrigen.fechaEmision)}`}
                    op={opOrigen}
                    numeroCheque={ch.numeroCheque}
                  />
                ) : null}
                {!opOrigen && renovDe.length > 0 ? (
                  <div>
                    <p className="text-body-muted text-xs font-medium">
                      Reemplaza a ({renovDe.length} {renovDe.length === 1 ? 'cheque viejo' : 'cheques viejos'}):
                    </p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {renovDe.map((r) => (
                        <li key={r.numeroCheque} className="flex flex-wrap items-center justify-between gap-2 font-mono">
                          <span>{r.numeroCheque}</span>
                          <span>
                            {r.montoCentavos !== null ? formatMoneyCentavos(r.montoCentavos, 'ARS') : 'Monto s/d'}
                            {r.fechaVencimiento ? ` · vto ${formatFecha(r.fechaVencimiento)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {todosViejosConMonto && renovDe.length > 1 ? (
                      <p className="text-body-muted mt-1 text-xs">
                        Suma cheques reemplazados:{' '}
                        <span className="text-heading font-semibold">
                          {formatMoneyCentavos(sumaViejosCentavos, 'ARS')}
                        </span>
                      </p>
                    ) : null}
                    {interesPasoCentavos !== null ? (
                      <p className="mt-1 text-xs">
                        Diferencia / interés en este cheque:{' '}
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {formatMoneyCentavos(interesPasoCentavos, 'ARS')}
                          {sumaViejosCentavos > 0
                            ? ` (${((interesPasoCentavos / sumaViejosCentavos) * 100).toFixed(1)}%)`
                            : ''}
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {opRenovacion ? (
                  <OperacionDelCheque
                    titulo={`Se renovó en la operación del ${formatFecha(opRenovacion.fechaEmision)}`}
                    op={opRenovacion}
                    numeroCheque={ch.numeroCheque}
                  />
                ) : renovPor.length > 0 ? (
                  <div>
                    <p className="text-body-muted text-xs font-medium">Renovado por:</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {renovPor.map((r) => (
                        <li key={r.numeroCheque} className="flex flex-wrap items-center justify-between gap-2 font-mono">
                          <span>{r.numeroCheque}</span>
                          <span>{r.montoCentavos !== null ? formatMoneyCentavos(r.montoCentavos, 'ARS') : 'Monto s/d'}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-body-muted mt-1 text-xs">
                      No se pudo armar la operación completa, así que no se calcula el interés.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {ch.interesSugerido ? (
              <InteresSugerido sugerencia={ch.interesSugerido} numeroCheque={ch.numeroCheque} montoCentavos={ch.montoCentavos} />
            ) : null}

            {puedeEditarCheques && (ch.revisar.length > 0 || ch.sugerencia) ? (
              <ClasificarOperacionPanel
                key={`${id}-${ch.sugerencia?.tipo ?? ''}`}
                id={id}
                cheque={ch}
                lecturaObs={data?.lecturaObs}
                mismaOperacion={data?.mismaOperacion ?? 1}
                propuestaRenovacion={data?.propuestaRenovacion}
              />
            ) : null}

            {ch.revisar.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-4 w-4" /> A revisar
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {ch.revisar.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
        <div className="mt-5 text-right">
          <button type="button" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function SinAsignarBadge() {
  return (
    <span
      className="ml-1.5 inline-block rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      title="Este nombre todavía no está asignado a ningún proveedor. Se asigna en la solapa Proveedores financieros."
    >
      Sin asignar
    </span>
  )
}

function TablaUsdPorProveedor({ grupos }: { grupos: UsdPorProveedorItem[] }) {
  const [expandido, setExpandido] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="border-b border-subtle text-left text-body-muted">
          <tr>
            <th className="w-6 px-1 py-2"></th>
            <th className="px-2.5 py-2">Proveedor</th>
            <th className="px-2.5 py-2 text-center">Operaciones</th>
            <th className="px-2.5 py-2 text-center">Cheques</th>
            <th className="px-2.5 py-2 text-right">Total USD</th>
            <th className="px-2.5 py-2 text-right">TC promedio</th>
            <th className="px-2.5 py-2 text-right">Equivalente (USD × TC)</th>
            <th className="px-2.5 py-2 text-right">Suma cheques ARS</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const key = g.proveedorId ?? `sin-${g.beneficiario}`
            const abierto = expandido === key
            return (
              <Fragment key={key}>
                <tr
                  className="cursor-pointer border-t border-subtle hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  onClick={() => setExpandido(abierto ? null : key)}
                >
                  <td className="px-1 py-2 text-center text-body-muted">
                    {abierto ? <ChevronUp className="inline h-3.5 w-3.5" /> : <ChevronDown className="inline h-3.5 w-3.5" />}
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="font-medium">{g.beneficiario}</span>
                    {g.proveedorId === null ? <SinAsignarBadge /> : null}
                  </td>
                  <td className="px-2.5 py-2 text-center tabular-nums">{g.cantidadOperaciones}</td>
                  <td className="px-2.5 py-2 text-center tabular-nums">{g.cantidadCheques}</td>
                  <td className="px-2.5 py-2 text-right font-semibold text-green-700 dark:text-green-400">
                    US$ {g.totalUsd.toLocaleString('es-AR')}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">$ {g.cotizacionPromedio.toLocaleString('es-AR')}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{formatMoneyCentavos(g.equivalenteCentavos, 'ARS')}</td>
                  <td className="text-brand-primary px-2.5 py-2 text-right font-semibold tabular-nums">
                    {formatMoneyCentavos(g.sumaChequesCentavos, 'ARS')}
                  </td>
                </tr>
                {abierto ? (
                  <tr className="border-t border-dashed border-neutral-200 dark:border-zinc-700">
                    <td colSpan={8} className="px-2.5 py-2">
                      <div className="ml-6 rounded-lg border border-neutral-200 bg-neutral-50/80 dark:border-zinc-700 dark:bg-zinc-800/50">
                        <table className="min-w-full text-xs">
                          <thead className="text-left text-[11px] text-body-muted">
                            <tr>
                              <th className="px-2.5 py-1.5">Emisión</th>
                              <th className="px-2.5 py-1.5 text-right">Operación USD</th>
                              <th className="px-2.5 py-1.5 text-right">TC pactado</th>
                              <th className="px-2.5 py-1.5 text-center">Cheques</th>
                              <th className="px-2.5 py-1.5 text-right">Suma cheques ARS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.operaciones.map((op) => (
                              <tr
                                key={`${op.montoUsd}-${op.cotizacion}-${op.fechaEmision ?? ''}-${op.cheques[0]?.numeroCheque ?? ''}`}
                                className="border-t border-neutral-200/60 dark:border-zinc-700/60"
                              >
                                <td className="whitespace-nowrap px-2.5 py-1.5">{formatFecha(op.fechaEmision)}</td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 text-right">US$ {op.montoUsd.toLocaleString('es-AR')}</td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">$ {op.cotizacion.toLocaleString('es-AR')}</td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 text-center tabular-nums">{op.cantidadCheques}</td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums font-medium">
                                  {formatMoneyCentavos(op.sumaChequesCentavos, 'ARS')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TablaUsdAgrupadas({ ops }: { ops: OperacionUsdAgrupadaItem[] }) {
  const [expandida, setExpandida] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="border-b border-subtle text-left text-body-muted">
          <tr>
            <th className="w-6 px-1 py-2"></th>
            <th className="px-2.5 py-2">Beneficiario</th>
            <th className="px-2.5 py-2">Emisión</th>
            <th className="px-2.5 py-2 text-right">Operación USD</th>
            <th className="px-2.5 py-2 text-right">TC pactado</th>
            <th className="px-2.5 py-2 text-right">Equivalente (USD × TC)</th>
            <th className="px-2.5 py-2 text-center">Cheques (fraccionamiento)</th>
            <th className="px-2.5 py-2 text-right">Suma cheques ARS</th>
            <th className="px-2.5 py-2 text-right">Diferencia vs. Eq.</th>
          </tr>
        </thead>
        <tbody>
          {ops.map((op) => {
            const key = `${op.proveedorId ?? op.beneficiarioNormalizado}-${op.montoUsd}-${op.cotizacion}-${op.fechaEmision ?? ''}`
            const diff = op.sumaChequesCentavos - op.equivalenteCentavos
            const abierta = expandida === key
            return (
              <Fragment key={key}>
                <tr
                  className="cursor-pointer border-t border-subtle hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  onClick={() => setExpandida(abierta ? null : key)}
                >
                  <td className="px-1 py-2 text-center text-body-muted">
                    {abierta ? <ChevronUp className="inline h-3.5 w-3.5" /> : <ChevronDown className="inline h-3.5 w-3.5" />}
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="font-medium">{op.beneficiario}</span>
                    {op.proveedorId === null ? <SinAsignarBadge /> : null}
                    {op.obsComun ? (
                      <p className="text-body-muted mt-0.5 max-w-[200px] truncate font-mono text-[11px]" title={op.obsComun}>
                        {op.obsComun}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-body-muted">{formatFecha(op.fechaEmision)}</td>
                  <td className="px-2.5 py-2 text-right font-semibold text-green-700 dark:text-green-400">
                    US$ {op.montoUsd.toLocaleString('es-AR')}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">
                    $ {op.cotizacion.toLocaleString('es-AR')}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">
                    {formatMoneyCentavos(op.equivalenteCentavos, 'ARS')}
                  </td>
                  <td className="px-2.5 py-2 text-center">
                    <span className="inline-block rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                      {op.cantidadCheques} {op.cantidadCheques === 1 ? 'cheque' : 'cheques'}
                    </span>
                  </td>
                  <td className="text-brand-primary px-2.5 py-2 text-right font-semibold tabular-nums">
                    {formatMoneyCentavos(op.sumaChequesCentavos, 'ARS')}
                  </td>
                  <td className={`px-2.5 py-2 text-right tabular-nums ${diff > 0 ? 'text-red-600 dark:text-red-400' : 'text-body-muted'}`}>
                    {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${formatMoneyCentavos(diff, 'ARS')}`}
                  </td>
                </tr>
                {abierta ? (
                  <tr key={`${key}-detalle`} className="border-t border-dashed border-neutral-200 dark:border-zinc-700">
                    <td colSpan={9} className="px-2.5 py-2">
                      <div className="ml-6 rounded-lg border border-neutral-200 bg-neutral-50/80 dark:border-zinc-700 dark:bg-zinc-800/50">
                        <table className="min-w-full text-xs">
                          <thead className="text-left text-[11px] text-body-muted">
                            <tr>
                              <th className="px-2.5 py-1.5">Nro. cheque</th>
                              <th className="px-2.5 py-1.5">Emisión</th>
                              <th className="px-2.5 py-1.5">Vencimiento</th>
                              <th className="px-2.5 py-1.5 text-right">Importe</th>
                            </tr>
                          </thead>
                          <tbody>
                            {op.cheques.map((ch) => (
                              <tr key={ch.numeroCheque} className="border-t border-neutral-200/60 dark:border-zinc-700/60">
                                <td className="whitespace-nowrap px-2.5 py-1.5 font-mono">{ch.numeroCheque}</td>
                                <td className="whitespace-nowrap px-2.5 py-1.5">{formatFecha(ch.fechaEmision)}</td>
                                <td className="whitespace-nowrap px-2.5 py-1.5">{formatFecha(ch.fechaVencimiento)}</td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums font-medium">
                                  {formatMoneyCentavos(ch.montoCentavos, 'ARS')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
