import { Clock3, LogOut } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context'
import { auth } from '../services/firebase'

export function AccountPendingPage() {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
        <Clock3 className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-gray-100">
        Tu cuenta está pendiente de aprobación
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-gray-400">
        Registraste <span className="font-medium">{user?.email ?? userProfile?.email}</span> como
        cuenta externa. Un administrador de Bacarsa debe revisar tu solicitud antes de habilitar el
        acceso a la intranet.
      </p>
      <p className="mt-2 text-sm text-neutral-500 dark:text-gray-500">
        Te avisaremos por correo cuando tu cuenta quede habilitada.
      </p>
      <button
        type="button"
        onClick={() => void handleLogout()}
        className="mt-8 inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    </div>
  )
}
