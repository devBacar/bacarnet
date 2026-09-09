import { ShieldAlert } from 'lucide-react'
import { AdminTabs } from '../components/AdminTabs'
import { CoreAppManager } from '../components/CoreAppManager'
import { ModuleSettings } from '../components/ModuleSettings'
import { UserManager } from '../components/UserManager'
import { useAuth } from '../context'
import { useUrlEnumParam } from '../hooks/useUrlSearchState'
import { canManageUsers } from '../services/userService'

const USER_TABS = [{ id: 'users', label: 'Usuarios' }] as const
const SUPER_ADMIN_TABS = [
  { id: 'users', label: 'Usuarios' },
  { id: 'ecosystem', label: 'Ecosistema' },
  { id: 'modules', label: 'Módulos' },
] as const

type UsersTab = 'users' | 'ecosystem' | 'modules'

export function AdminUsers() {
  const { userProfile } = useAuth()
  const canManage = canManageUsers(userProfile?.permissions)
  const isSuperAdmin = userProfile?.permissions.super_admin === true
  const tabs = isSuperAdmin ? [...SUPER_ADMIN_TABS] : [...USER_TABS]
  const [activeTab, setActiveTab] = useUrlEnumParam('tab', tabs.map((tab) => tab.id), 'users')

  return (
    <div className="w-full min-w-0 space-y-6">
      <header>
        <p className="text-brand-primary mb-1 text-sm font-medium uppercase tracking-wide">
          Administración
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-gray-100">Configuración y usuarios</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Control de personal, ecosistema de apps y visibilidad global de módulos
        </p>
      </header>

      {isSuperAdmin && (
        <AdminTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as UsersTab)}
        />
      )}

      {activeTab === 'ecosystem' && isSuperAdmin ? (
        <CoreAppManager />
      ) : activeTab === 'modules' && isSuperAdmin ? (
        <ModuleSettings />
      ) : canManage ? (
        <UserManager />
      ) : (
        <div className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950 px-6 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-neutral-400" />
          <p className="text-sm font-medium text-neutral-700 dark:text-gray-300">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
            No tenés permisos para gestionar usuarios. Contactá a un administrador.
          </p>
        </div>
      )}
    </div>
  )
}
