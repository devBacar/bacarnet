import { ArrowRight, BarChart3, Link2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context'
import { useLinksQuery } from '../hooks/queries/useCatalogQueries'
import { getCoreApps } from '../services/coreAppService'
import { getPolls } from '../services/pollService'
import { canManageUsers, getAllUsers } from '../services/userService'

interface MetricCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  loading?: boolean
}

function MetricCard({ label, value, icon, loading }: MetricCardProps) {
  return (
    <article className="card-minimal flex items-start gap-4 p-6">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-primary">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-neutral-500 dark:text-gray-400">{label}</p>
        {loading ? (
          <div className="mt-2 h-8 w-16 animate-pulse rounded bg-neutral-100 dark:bg-zinc-800" />
        ) : (
          <p className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-gray-100">{value}</p>
        )}
      </div>
    </article>
  )
}

export function AdminDashboard() {
  const { user, userProfile } = useAuth()
  const { data: links = [], isLoading: loadingLinks } = useLinksQuery()
  const [loadingPolls, setLoadingPolls] = useState(true)
  const [pollsCount, setPollsCount] = useState(0)
  const [loadingCoreApps, setLoadingCoreApps] = useState(true)
  const [coreAppsCount, setCoreAppsCount] = useState(0)
  const [usersCount, setUsersCount] = useState<number | null>(null)

  const canViewUsers = canManageUsers(userProfile?.permissions)
  const loading = loadingLinks || loadingPolls || loadingCoreApps
  const linksCount = links.length

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const [coreApps, polls] = await Promise.all([getCoreApps(), getPolls()])
        setCoreAppsCount(coreApps.length)
        setPollsCount(polls.length)
      } catch (err) {
        console.error('Error al cargar métricas:', err)
      } finally {
        setLoadingCoreApps(false)
        setLoadingPolls(false)
      }

      if (canViewUsers) {
        try {
          const users = await getAllUsers()
          setUsersCount(users.length)
        } catch (err) {
          console.error('Error al cargar usuarios:', err)
          setUsersCount(null)
        }
      }
    }

    void loadMetrics()
  }, [canViewUsers])

  return (
    <div className="w-full space-y-8">
      <header>
        <p className="text-brand-primary mb-1 text-sm font-medium uppercase tracking-wide">
          Panel
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-gray-100">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Vista general del contenido y usuarios de la intranet
        </p>
      </header>

      <div className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950 px-5 py-4">
        <p className="text-sm text-neutral-600 dark:text-gray-400">
          Conectado como{' '}
          <span className="font-medium text-neutral-900 dark:text-gray-100">{user?.email}</span>
          {userProfile?.department && (
            <span className="text-neutral-400"> · {userProfile.department}</span>
          )}
        </p>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {canViewUsers && (
          <MetricCard
            label="Total usuarios"
            value={usersCount ?? '—'}
            icon={<Users className="h-5 w-5" />}
            loading={loading}
          />
        )}
        <MetricCard
          label="Encuestas cargadas"
          value={pollsCount}
          icon={<BarChart3 className="h-5 w-5" />}
          loading={loading}
        />
        <MetricCard
          label="Enlaces cargados"
          value={linksCount}
          icon={<Link2 className="h-5 w-5" />}
          loading={loading}
        />
      </div>

      {coreAppsCount > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-neutral-900 dark:text-gray-100">
              {coreAppsCount} herramientas en el ecosistema
            </p>
            <p className="text-sm text-neutral-500 dark:text-gray-400">
              Apps publicadas en la home de empleados
            </p>
          </div>
          <Link
            to="/admin/usuarios?tab=ecosystem"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:underline"
          >
            Gestionar ecosistema
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
