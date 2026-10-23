import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KpisInversiones } from '../../components/finanzas/inversiones/KpisInversiones'
import { TablaInversiones } from '../../components/finanzas/inversiones/TablaInversiones'
import { useAuth } from '../../context'
import { fetchInversiones } from '../../services/finanzasInversionesApi'

type Tab =
  | 'inversiones'
  | 'para_aprobar'
  | 'inversores'
  | 'importar'
  | 'configuracion'

function tabInicial(valor: string | null): Tab {
  if (
    valor === 'para_aprobar' ||
    valor === 'inversores' ||
    valor === 'importar' ||
    valor === 'configuracion'
  ) {
    return valor
  }
  return 'inversiones'
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
    </div>
  )
}

function Proximamente({ texto }: { texto: string }) {
  return (
    <p className="text-body-muted rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm dark:border-zinc-700">
      {texto}. Próximamente.
    </p>
  )
}

export function InversionesPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabInicial(searchParams.get('tab'))

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'inversiones'],
    queryFn: fetchInversiones,
    enabled: Boolean(user),
  })

  const inversiones = data?.inversiones ?? []
  const kpis = data?.kpis

  const paraAprobar = useMemo(
    () => inversiones.filter((r) => r.estado === 'pendiente_aprobacion'),
    [inversiones],
  )

  const ir = (nueva: Tab) => {
    const next = new URLSearchParams(searchParams)
    if (nueva === 'inversiones') next.delete('tab')
    else next.set('tab', nueva)
    setSearchParams(next, { replace: true })
  }

  const botonTab = (id: Tab, texto: string) => (
    <button
      type="button"
      onClick={() => ir(id)}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        tab === id ? 'bg-brand-primary text-white' : 'text-body-muted'
      }`}
    >
      {texto}
    </button>
  )

  const nParaAprobar = kpis?.paraAprobar ?? paraAprobar.length

  return (
    <>
      <header className="mb-6">
        <h1 className="text-heading text-2xl font-bold tracking-tight sm:text-3xl">Inversores</h1>
        <p className="text-body-muted mt-2 max-w-2xl text-sm">
          Personas que le prestan plata a BACAR: inversiones, cuotas y pagos.
        </p>
      </header>

      <div className="mb-4 inline-flex flex-wrap rounded-xl border border-neutral-200 p-1 dark:border-zinc-800">
        {botonTab('inversiones', 'Inversiones')}
        {botonTab('para_aprobar', `Para aprobar (${nParaAprobar})`)}
        {botonTab('inversores', 'Inversores')}
        {botonTab('importar', 'Importar planilla')}
        {botonTab('configuracion', 'Configuración')}
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <p className="text-danger text-sm">
          {error instanceof Error ? error.message : 'No pude traer las inversiones'}
        </p>
      ) : (
        <>
          {tab === 'inversiones' || tab === 'para_aprobar' ? (
            <>
              {kpis ? <KpisInversiones kpis={kpis} /> : null}
              {tab === 'inversiones' ? (
                <TablaInversiones
                  filas={inversiones}
                  vacio="Todavía no hay inversiones cargadas. Cuando cargues una o importes la planilla, van a aparecer acá."
                />
              ) : (
                <TablaInversiones
                  filas={paraAprobar}
                  vacio="No hay inversiones esperando aprobación. Cuando alguien mande una a aprobar, va a aparecer acá."
                />
              )}
            </>
          ) : null}

          {tab === 'inversores' ? <Proximamente texto="La lista de inversores" /> : null}
          {tab === 'importar' ? <Proximamente texto="La importación de la planilla" /> : null}
          {tab === 'configuracion' ? <Proximamente texto="La configuración" /> : null}
        </>
      )}
    </>
  )
}
