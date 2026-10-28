import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CuentaPanel } from '../../components/finanzas/inversiones/CuentaPanel'
import { DetalleInversion } from '../../components/finanzas/inversiones/DetalleInversion'
import { FormInversion } from '../../components/finanzas/inversiones/FormInversion'
import { KpisInversiones } from '../../components/finanzas/inversiones/KpisInversiones'
import { Popup } from '../../components/finanzas/inversiones/PopupInversiones'
import { PestanaConfiguracion } from '../../components/finanzas/inversiones/PestanaConfiguracion'
import { PestanaImportar } from '../../components/finanzas/inversiones/PestanaImportar'
import { PestanaInversores } from '../../components/finanzas/inversiones/PestanaInversores'
import { TablaInversiones } from '../../components/finanzas/inversiones/TablaInversiones'
import { useAuth } from '../../context'
import {
  fetchCuentaGeneral,
  fetchInversiones,
  type InversionResumen,
} from '../../services/finanzasInversionesApi'

type Tab = 'inversiones' | 'inversores' | 'importar' | 'configuracion'

type FiltroEstado =
  | 'todas'
  | 'para_aprobar'
  | 'vigentes'
  | 'cerradas'
  | 'borradores_anuladas'

const ESTADOS_CERRADAS: ReadonlySet<InversionResumen['estado']> = new Set([
  'cancelada',
  'precancelada',
  'renovada',
])

/** Mapea pestañas viejas (para_aprobar, cuenta) a las actuales. */
function tabDesdeUrl(valor: string | null): Tab {
  if (valor === 'para_aprobar') return 'inversiones'
  if (valor === 'cuenta') return 'inversores'
  if (valor === 'inversores' || valor === 'importar' || valor === 'configuracion') return valor
  return 'inversiones'
}

function filtroInicialDesdeUrl(valor: string | null): FiltroEstado {
  return valor === 'para_aprobar' ? 'para_aprobar' : 'todas'
}

function filtrarPorEstado(filas: InversionResumen[], filtro: FiltroEstado): InversionResumen[] {
  switch (filtro) {
    case 'todas':
      return filas
    case 'para_aprobar':
      return filas.filter((r) => r.estado === 'pendiente_aprobacion')
    case 'vigentes':
      return filas.filter((r) => r.estado === 'vigente')
    case 'cerradas':
      return filas.filter((r) => ESTADOS_CERRADAS.has(r.estado))
    case 'borradores_anuladas':
      return filas.filter((r) => r.estado === 'borrador' || r.estado === 'anulada')
  }
}

function textoVacio(filtro: FiltroEstado): string {
  switch (filtro) {
    case 'todas':
      return 'Todavía no hay inversiones cargadas. Cuando cargues una o importes la planilla, van a aparecer acá.'
    case 'para_aprobar':
      return 'No hay inversiones esperando aprobación. Cuando alguien mande una a aprobar, va a aparecer acá.'
    case 'vigentes':
      return 'No hay inversiones vigentes.'
    case 'cerradas':
      return 'No hay inversiones cerradas (terminadas, devueltas antes o renovadas).'
    case 'borradores_anuladas':
      return 'No hay borradores ni anuladas.'
  }
}

function CuentaGeneral() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'inversiones', 'cuenta', 'general'],
    queryFn: fetchCuentaGeneral,
  })

  if (isLoading) {
    return <LoadingBlock />
  }

  if (isError || !data) {
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : 'No pude traer la cuenta general'}
      </p>
    )
  }

  return (
    <CuentaPanel
      cuenta={data}
      general
      onVerInversion={(id) => navigate(`/finanzas/inversiones/${id}`)}
    />
  )
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
    </div>
  )
}

function ChipsFiltroEstado({
  valor,
  onCambio,
  nParaAprobar,
}: {
  valor: FiltroEstado
  onCambio: (v: FiltroEstado) => void
  nParaAprobar: number
}) {
  const opciones: ReadonlyArray<{ id: FiltroEstado; texto: string }> = [
    { id: 'todas', texto: 'Todas' },
    { id: 'para_aprobar', texto: `Para aprobar (${nParaAprobar})` },
    { id: 'vigentes', texto: 'Vigentes' },
    { id: 'cerradas', texto: 'Cerradas' },
    { id: 'borradores_anuladas', texto: 'Borradores / Anuladas' },
  ]

  return (
    <div
      className="mb-4 inline-flex flex-wrap gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1 dark:border-zinc-800 dark:bg-zinc-950"
      role="group"
      aria-label="Filtrar por estado"
    >
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onCambio(o.id)}
          aria-pressed={valor === o.id}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            valor === o.id
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-body-muted hover:bg-white dark:hover:bg-zinc-800'
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

export function InversionesPage() {
  const { user } = useAuth()
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab = tabDesdeUrl(tabParam)
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>(() =>
    filtroInicialDesdeUrl(tabParam),
  )
  const [nuevaAbierta, setNuevaAbierta] = useState(false)

  // Compat: ?tab=para_aprobar abre Inversiones con el chip Para aprobar.
  useEffect(() => {
    if (tabParam === 'para_aprobar') setFiltroEstado('para_aprobar')
  }, [tabParam])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['finanzas', 'inversiones'],
    queryFn: fetchInversiones,
    enabled: Boolean(user) && !id && !nuevaAbierta && tab === 'inversiones',
  })

  const inversiones = data?.inversiones ?? []
  const kpis = data?.kpis

  const filasFiltradas = useMemo(
    () => filtrarPorEstado(inversiones, filtroEstado),
    [inversiones, filtroEstado],
  )

  const ir = (nueva: Tab) => {
    const next = new URLSearchParams(searchParams)
    if (nueva === 'inversiones') next.delete('tab')
    else next.set('tab', nueva)
    setSearchParams(next, { replace: true })
  }

  const botonTab = (tabId: Tab, texto: string) => (
    <button
      type="button"
      onClick={() => ir(tabId)}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        tab === tabId ? 'bg-brand-primary text-white' : 'text-body-muted hover:text-heading'
      }`}
    >
      {texto}
    </button>
  )

  const nParaAprobar =
    kpis?.paraAprobar ??
    inversiones.filter((r) => r.estado === 'pendiente_aprobacion').length

  return (
    <>
      <header className="mb-4 flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="text-heading text-2xl font-bold tracking-tight">Inversores</h1>
        {tab === 'inversiones' ? (
          <button
            type="button"
            onClick={() => setNuevaAbierta(true)}
            className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Nueva inversión
          </button>
        ) : null}
      </header>

      <div className="mb-4 inline-flex flex-wrap rounded-xl border border-neutral-200 p-1 dark:border-zinc-800">
        {botonTab('inversiones', 'Inversiones')}
        {botonTab('inversores', 'Inversores')}
        {botonTab('importar', 'Importar planilla')}
        {botonTab('configuracion', 'Configuración')}
      </div>

      {tab === 'inversiones' ? (
        isLoading ? (
          <LoadingBlock />
        ) : isError ? (
          <p className="text-danger text-sm">
            {error instanceof Error ? error.message : 'No pude traer las inversiones'}
          </p>
        ) : (
          <>
            {kpis ? <KpisInversiones kpis={kpis} /> : null}
            <ChipsFiltroEstado
              valor={filtroEstado}
              onCambio={setFiltroEstado}
              nParaAprobar={nParaAprobar}
            />
            <TablaInversiones filas={filasFiltradas} vacio={textoVacio(filtroEstado)} />
          </>
        )
      ) : null}

      {tab === 'inversores' ? (
        <div className="space-y-8">
          <CuentaGeneral />
          <PestanaInversores />
        </div>
      ) : null}
      {tab === 'importar' ? <PestanaImportar /> : null}
      {tab === 'configuracion' ? <PestanaConfiguracion /> : null}
      {nuevaAbierta ? (
        <Popup onCerrar={() => setNuevaAbierta(false)} cerrarSoloConBoton>
          <FormInversion
            modo="nuevo"
            onCerrar={() => setNuevaAbierta(false)}
            onGuardado={(detalle) => {
              setNuevaAbierta(false)
              void refetch()
              navigate(`/finanzas/inversiones/${detalle.id}`)
            }}
          />
        </Popup>
      ) : null}
      {id ? (
        <Popup onCerrar={() => navigate('/finanzas/inversiones')}>
          <DetalleInversion id={id} />
        </Popup>
      ) : null}
    </>
  )
}
