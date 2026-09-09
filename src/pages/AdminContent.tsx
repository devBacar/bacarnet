import { AdminTabs } from '../components/AdminTabs'
import { BannerManager } from '../components/BannerManager'
import { PollManager } from '../components/PollManager'
import { DailyQuestionManager } from '../components/DailyQuestionManager'
import { useUrlEnumParam } from '../hooks/useUrlSearchState'

const TABS = [
  { id: 'banners', label: 'Banners / Popups' },
  { id: 'polls', label: 'Encuestas' },
  { id: 'daily', label: 'Pregunta del día' },
] as const

export function AdminContent() {
  const [activeTab, setActiveTab] = useUrlEnumParam('tab', TABS.map((tab) => tab.id), 'banners')

  return (
    <div className="w-full space-y-2">
      <header className="mb-6">
        <p className="text-brand-primary mb-1 text-sm font-medium uppercase tracking-wide">
          Gestión
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-gray-100">Contenido</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Avisos destacados, encuestas y pregunta del día de la intranet
        </p>
      </header>

      <AdminTabs tabs={[...TABS]} activeTab={activeTab} onChange={(id) => setActiveTab(id as typeof activeTab)} />

      {activeTab === 'banners' && <BannerManager />}
      {activeTab === 'polls' && <PollManager />}
      {activeTab === 'daily' && <DailyQuestionManager />}
    </div>
  )
}
