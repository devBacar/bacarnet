import { AdminTabs } from '../components/AdminTabs'
import { ContactManager } from '../components/ContactManager'
import { DepartmentManager } from '../components/DepartmentManager'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../context'
import { useUrlEnumParam } from '../hooks/useUrlSearchState'
import { canManageDirectory } from '../services/userService'

const DIRECTORY_TABS = [
  { id: 'contacts', label: 'Contactos' },
  { id: 'departments', label: 'Departamentos' },
] as const

export function AdminDirectory() {
  const { user, userProfile } = useAuth()
  const canManage = canManageDirectory(user?.email, userProfile?.permissions)
  const [activeTab, setActiveTab] = useUrlEnumParam(
    'tab',
    DIRECTORY_TABS.map((tab) => tab.id),
    'contacts',
  )

  return (
    <div className="w-full space-y-6">
      <header>
        <p className="mb-1 text-sm font-medium uppercase tracking-wide text-brand-primary">
          Gestión
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-gray-100">
          Contactos
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Cargá la agenda interna y administrá los departamentos disponibles en registro,
          usuarios y contactos.
        </p>
      </header>

      {canManage ? (
        <>
          <AdminTabs
            tabs={[...DIRECTORY_TABS]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
          />

          {activeTab === 'contacts' ? <ContactManager /> : <DepartmentManager />}
        </>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-neutral-400" />
          <p className="text-sm font-medium text-neutral-700 dark:text-gray-300">
            Acceso restringido
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
            Solo los administradores pueden gestionar los contactos.
          </p>
        </div>
      )}
    </div>
  )
}
