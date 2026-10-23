import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DetalleInversion } from '../../components/finanzas/inversiones/DetalleInversion'
import { FormInversion } from '../../components/finanzas/inversiones/FormInversion'
import { KpisInversiones } from '../../components/finanzas/inversiones/KpisInversiones'
import { PestanaConfiguracion } from '../../components/finanzas/inversiones/PestanaConfiguracion'
import { PestanaImportar } from '../../components/finanzas/inversiones/PestanaImportar'
import { PestanaInversores } from '../../components/finanzas/inversiones/PestanaInversores'
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

export function InversionesPage() {
  const { user } = useAuth()
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabInicial(searchParams.get('tab'))
  const [nuevaAbierta, setNuevaAbierta] = useState(false)

  const listaActiva = tab === 'inversiones' || tab === 'para_aprobar'

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['finanzas', 'inversiones'],
    queryFn: fetchInversiones,
    enabled: Boolean(user) && !id && !nuevaAbierta,
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

  const botonTab = (tabId: Tab, texto: string) => (
    <button
      type="button"
      onClick={() => ir(tabId)}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        tab === tabId ? 'bg-brand-primary text-white' : 'text-body-muted'
      }`}
    >
      {texto}
    </button>
  )

  if (id) {
    return <DetalleInversion id={id} />
  }

  if (nuevaAbierta) {
    return (
      <FormInversion
        modo="nuevo"
        onCerrar={() => setNuevaAbierta(false)}
        onGuardado={(detalle) => {
          setNuevaAbierta(false)
          void refetch()
          navigate(`/finanzas/inversiones/${detalle.id}`)
        }}
      />
    )
  }

  const nParaAprobar = kpis?.paraAprobar ?? paraAprobar.length

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-heading text-2xl font-bold tracking-tight sm:text-3xl">Inversores</h1>
          <p className="text-body-muted mt-2 max-w-2xl text-sm">
            Personas que le prestan plata a BACAR: inversiones, cuotas y pagos.
          </p>
        </div>
        {tab === 'inversiones' || tab === 'para_aprobar' ? (
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
        {botonTab('para_aprobar', `Para aprobar (${nParaAprobar})`)}
        {botonTab('inversores', 'Inversores')}
        {botonTab('importar', 'Importar planilla')}
        {botonTab('configuracion', 'Configuración')}
      </div>

      {listaActiva ? (
        isLoading ? (
          <LoadingBlock />
        ) : isError ? (
          <p className="text-danger text-sm">
            {error instanceof Error ? error.message : 'No pude traer las inversiones'}
          </p>
        ) : (
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
        )
      ) : null}

      {tab === 'inversores' ? <PestanaInversores /> : null}
      {tab === 'importar' ? <PestanaImportar /> : null}
      {tab === 'configuracion' ? <PestanaConfiguracion /> : null}
    </>
  )
}
