import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HomeBoardsSection } from '../components/home/HomeBoardsSection'
import { HomeCollapsibleSection } from '../components/home/HomeCollapsibleSection'
import { HomeRecentFilesSection } from '../components/home/HomeRecentFilesSection'
import { BirthdayConfetti } from '../components/home/BirthdayConfetti'
import { WelcomeHeader } from '../components/home/WelcomeHeader'
import { BannerPopup } from '../components/BannerPopup'
import { CalendarWidget } from '../components/CalendarWidget'
import { CoreAppIcon } from '../components/CoreAppIcon'
import { GmailWidget } from '../components/GmailWidget'
import { PollWidget } from '../components/PollWidget'
import { DailyQuestionWidget } from '../components/DailyQuestionWidget'
import { ShiftWidget } from '../components/ShiftWidget'
import { useAuth } from '../context'
import { useGlobalSettings } from '../context/GlobalSettingsContext'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { isExternalAccount } from '../services/userService'
import { isBirthdayToday } from '../utils/birthday'
import { getActiveBanner, type Banner } from '../services/bannerService'
import { getCoreApps, type CoreApp } from '../services/coreAppService'

const DEFAULT_PINNED_COUNT = 4

function getPinnedCoreApps(apps: CoreApp[], favoriteAppIds: string[]): CoreApp[] {
  if (apps.length === 0) return []

  if (favoriteAppIds.length === 0) {
    return apps.slice(0, DEFAULT_PINNED_COUNT)
  }

  return favoriteAppIds
    .map((id) => apps.find((app) => app.id === id))
    .filter((app): app is CoreApp => app !== undefined)
}

function ToolsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[4.5rem] animate-pulse rounded-xl border border-neutral-100 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950"
        />
      ))}
    </div>
  )
}

function CompactAppCard({ app }: { app: CoreApp }) {
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-neutral-200 bg-white p-3.5 transition-colors hover:border-brand-primary/35 dark:border-zinc-800 dark:bg-zinc-900 sm:gap-4 sm:p-4"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-zinc-800 text-brand-primary transition-colors group-hover:bg-brand-tint sm:h-12 sm:w-12">
        {app.imageUrl ? (
          <img src={app.imageUrl} alt="" className="h-6 w-6 object-contain sm:h-7 sm:w-7" />
        ) : (
          <CoreAppIcon name={app.icon} className="h-5 w-5 sm:h-6 sm:w-6" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-neutral-900 dark:text-gray-100">{app.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs break-words text-neutral-500 dark:text-gray-400">{app.description}</p>
      </div>
      <ArrowRight className="hidden h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-brand-primary sm:block" />
    </a>
  )
}

export function IntranetHub() {
  const { userProfile, profileLoading, refreshProfile } = useAuth()
  const { settings } = useGlobalSettings()
  const [coreApps, setCoreApps] = useState<CoreApp[]>([])
  const [coreAppsLoading, setCoreAppsLoading] = useState(true)
  const [coreAppsError, setCoreAppsError] = useState(false)
  const [activeBanner, setActiveBanner] = useState<Banner | null>(null)
  const [bannerVisible, setBannerVisible] = useState(false)
  const [dismissedBannerIds, setDismissedBannerIds] = useLocalStorage<string[]>(
    'intranet_dismissed_banners',
    [],
  )

  const displayName =
    userProfile?.displayName ||
    userProfile?.email?.split('@')[0] ||
    'Usuario'

  const favoriteApps = userProfile?.favoriteApps ?? []

  const pinnedCoreApps = useMemo(
    () => getPinnedCoreApps(coreApps, favoriteApps),
    [coreApps, favoriteApps],
  )

  useEffect(() => {
    getCoreApps()
      .then((apps) => {
        setCoreApps(apps)
        setCoreAppsError(false)
      })
      .catch((err) => {
        console.error('Error al cargar aplicaciones del ecosistema:', err)
        setCoreApps([])
        setCoreAppsError(true)
      })
      .finally(() => setCoreAppsLoading(false))
  }, [])

  useEffect(() => {
    getActiveBanner()
      .then((banner) => {
        setActiveBanner(banner)
        if (banner?.id && !dismissedBannerIds.includes(banner.id)) {
          setBannerVisible(true)
        }
      })
      .catch((err) => console.error('Error al cargar banner activo:', err))
  }, [dismissedBannerIds])

  const handleCloseBanner = () => {
    if (activeBanner?.id) {
      setDismissedBannerIds((prev) =>
        prev.includes(activeBanner.id!) ? prev : [...prev, activeBanner.id!],
      )
    }
    setBannerVisible(false)
  }

  if (profileLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          <p className="text-sm text-neutral-500 dark:text-gray-400">Cargando tu perfil...</p>
        </div>
      </div>
    )
  }

  const externalAccount = isExternalAccount(userProfile)
  const birthdayToday = isBirthdayToday(userProfile?.birthDate)

  if (externalAccount && userProfile) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 sm:space-y-8">
        {birthdayToday && <BirthdayConfetti />}
        <WelcomeHeader
          userProfile={userProfile}
          displayName={displayName}
          onPreferencesUpdated={refreshProfile}
          birthdayToday={birthdayToday}
        />

        {settings.directoryEnabled && userProfile.permissions.view_directory && (
          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6 lg:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 dark:text-gray-100">Contactos</h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
                  Directorio de contactos de Bacarsa
                </p>
              </div>
              <Link
                to="/directorio"
                className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-primary transition-colors hover:opacity-90"
              >
                Abrir directorio
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            </div>
          </section>
        )}
      </div>
    )
  }

  return (
    <>
      {birthdayToday && <BirthdayConfetti />}
      {bannerVisible && activeBanner && (
        <BannerPopup banner={activeBanner} onClose={handleCloseBanner} />
      )}

      <div className="grid w-full grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-12 lg:items-start">
        <div className="min-w-0 space-y-6 sm:space-y-8 lg:col-span-8 xl:col-span-9">
          {userProfile && (
            <WelcomeHeader
              userProfile={userProfile}
              displayName={displayName}
              onPreferencesUpdated={refreshProfile}
              birthdayToday={birthdayToday}
            />
          )}

          {(coreAppsLoading || pinnedCoreApps.length > 0 || coreAppsError) && (
            <HomeCollapsibleSection
              title="Mis Herramientas"
              subtitle={
                favoriteApps.length > 0
                  ? 'Tus aplicaciones ancladas desde accesos directos'
                  : 'Anclá tus favoritas en accesos directos · mostrando sugerencias por defecto'
              }
              storageKey="tools"
              headerAction={
                <Link
                  to="/accesos-directos"
                  className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-primary transition-colors hover:opacity-90"
                >
                  Ver todos los accesos
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              }
            >
              {coreAppsLoading ? (
                <ToolsSkeleton />
              ) : coreAppsError ? (
                <p className="rounded-lg alert-error px-4 py-3 text-sm text-danger">
                  No se pudieron cargar las aplicaciones.
                </p>
              ) : pinnedCoreApps.length === 0 ? (
                <p className="break-words text-sm text-neutral-500 dark:text-gray-400">
                  Aún no hay aplicaciones configuradas.{' '}
                  <Link to="/accesos-directos" className="font-medium text-brand-primary hover:underline">
                    Ver accesos directos
                  </Link>
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {pinnedCoreApps.map((app) => (
                    <CompactAppCard key={app.id} app={app} />
                  ))}
                </div>
              )}
            </HomeCollapsibleSection>
          )}

          {settings.boardsEnabled && <HomeBoardsSection />}

          <HomeRecentFilesSection />
        </div>

        <aside className="min-w-0 space-y-6 lg:col-span-4 xl:col-span-3">
          <ShiftWidget />

          <DailyQuestionWidget />

          <GmailWidget />

          <CalendarWidget />

          {settings.pollsEnabled && <PollWidget />}
        </aside>
      </div>
    </>
  )
}
