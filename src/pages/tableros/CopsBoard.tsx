import { useQuery } from '@tanstack/react-query'
import { Shield } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SeccionEstructura } from '../../components/tableros/cops/SeccionEstructura'
import { SeccionLiquidacion } from '../../components/tableros/cops/SeccionLiquidacion'
import { SeccionOperacionHoy } from '../../components/tableros/cops/SeccionOperacionHoy'
import { SeccionPlanificacion } from '../../components/tableros/cops/SeccionPlanificacion'
import { SeccionRrhh } from '../../components/tableros/cops/SeccionRrhh'
import { horaActualizado } from '../../components/tableros/cops/formato'
import { SkeletonCops } from '../../components/tableros/cops/ui'
import { CopsApiError, fetchCopsSnapshot } from '../../services/copsApi'

const REFETCH_MS = 5 * 60_000

function mensajeError(err: unknown): string {
  if (err instanceof CopsApiError) {
    if (err.status === 401) return 'Acceso no autorizado — contactar a administrador COSP'
    if (err.status === 503) return 'Datos aún no disponibles, reintentando...'
    return err.message
  }
  if (err instanceof Error) return err.message
  return 'No se pudo cargar el tablero COSP.'
}

export function CopsBoard() {
  const consulta = useQuery({
    queryKey: ['cops', 'snapshot'],
    queryFn: fetchCopsSnapshot,
    staleTime: REFETCH_MS,
    refetchInterval: REFETCH_MS,
    retry: (fallos, err) => (err instanceof CopsApiError && err.status === 401 ? false : fallos < 3),
  })

  const data = consulta.data
  const hora = data ? horaActualizado(data.timestamp) : ''

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-5 px-4 py-6 sm:px-6">
      <header className="min-w-0">
        <Link
          to="/tableros"
          className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-neutral-600 hover:text-[var(--color-primary)] dark:text-gray-400"
        >
          ← Tableros
        </Link>
        <h1 className="text-heading flex items-center gap-2 text-xl font-semibold">
          <Shield className="h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden />
          COSP
          {data?.empresaNombre ? (
            <span className="text-body-muted text-[15px] font-normal">· {data.empresaNombre}</span>
          ) : null}
        </h1>
        <p className="text-body-muted mt-1 text-[13px]">
          Indicadores operativos de seguridad privada.
          {hora ? <span className="block">Actualizado: {hora} hs.</span> : null}
        </p>
      </header>

      {consulta.isPending ? <SkeletonCops /> : null}

      {consulta.isError ? (
        <p role="alert" className="text-danger text-[14px]">
          {mensajeError(consulta.error)}
        </p>
      ) : null}

      {data ? (
        <main className="grid gap-4">
          <SeccionEstructura data={data} />
          <SeccionOperacionHoy data={data} />
          <SeccionPlanificacion data={data} />
          {data.rrhh ? <SeccionRrhh rrhh={data.rrhh} /> : null}
          {data.liquidacion ? <SeccionLiquidacion liquidacion={data.liquidacion} /> : null}
        </main>
      ) : null}
    </div>
  )
}
