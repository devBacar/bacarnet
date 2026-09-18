import { ShieldAlert } from 'lucide-react'
import { ShiftManager } from '../components/ShiftManager'
import { useAuth } from '../context'
import { canManageShifts, isSuperAdmin } from '../services/userService'

export function AdminShifts() {
  const { user, userProfile } = useAuth()
  const canManage = canManageShifts(user?.email) || isSuperAdmin(userProfile)

  return (
    <div className="w-full space-y-6">
      <header>
        <p className="mb-1 text-sm font-medium uppercase tracking-wide text-brand-primary">
          Gestión
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-gray-100">Turnos</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Administrá la rotación semanal del turno de Sistemas y las excepciones por semana.
        </p>
      </header>

      {canManage ? (
        <ShiftManager />
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Solo los administradores pueden editar los turnos.</p>
        </div>
      )}
    </div>
  )
}
