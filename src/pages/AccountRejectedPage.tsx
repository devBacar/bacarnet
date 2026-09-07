import { Ban, LogOut } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context'
import { auth } from '../services/firebase'

export function AccountRejectedPage() {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full alert-error">
        <Ban className="h-7 w-7 text-danger" />
      </div>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-gray-100">
        Tu solicitud de acceso fue rechazada
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-gray-400">
        La cuenta <span className="font-medium">{user?.email ?? userProfile?.email}</span> no fue
        autorizada para ingresar a la intranet.
      </p>
      {userProfile?.accountStatusReason && (
        <p className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-400">
          {userProfile.accountStatusReason}
        </p>
      )}
      <p className="mt-4 text-sm text-neutral-500 dark:text-gray-500">
        Si creés que es un error, contactá a RRHH o Sistemas.
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
