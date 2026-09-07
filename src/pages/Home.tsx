import { ArrowRight, Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { BirthdayWidget } from '../components/BirthdayWidget'
import { DailyWidgets } from '../components/DailyWidgets'
import { GoogleIcon } from '../components/GoogleIcon'
import { useAuth } from '../context'
import { useDepartments } from '../hooks/useDepartments'
import {
  isAccountPending,
  isAccountRejected,
  isCorporateEmail,
  registerUser,
} from '../services/userService'

type AuthTab = 'login' | 'register'

function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Este correo ya está registrado.'
    case 'auth/invalid-email':
      return 'El correo electrónico no es válido.'
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Credenciales incorrectas. Intentá nuevamente.'
    case 'auth/popup-closed-by-user':
      return 'Inicio de sesión cancelado.'
    case 'auth/account-exists-with-different-credential':
      return 'Ya existe una cuenta con este correo usando otro método.'
    default:
      return 'Ocurrió un error. Intentá nuevamente.'
  }
}

export function Home() {
  const { user, userProfile, loading, profileLoading, login, loginWithGoogle } = useAuth()
  const { departments } = useDepartments()

  const [activeTab, setActiveTab] = useState<AuthTab>('login')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [registerSuccessExternal, setRegisterSuccessExternal] = useState(false)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)

  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerDepartment, setRegisterDepartment] = useState('General')
  const [birthDate, setBirthDate] = useState('')

  useEffect(() => {
    if (departments.length > 0 && !departments.includes(registerDepartment)) {
      setRegisterDepartment(departments[0])
    }
  }, [departments, registerDepartment])

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await login(loginEmail, loginPassword, rememberMe)
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setError(authErrorMessage(code))
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setSubmitting(true)

    try {
      await loginWithGoogle(rememberMe)
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setError(authErrorMessage(code))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    setRegisterSuccessExternal(false)

    try {
      await registerUser(
        registerEmail,
        registerPassword,
        registerName,
        registerDepartment,
        birthDate,
      )
      if (!isCorporateEmail(registerEmail)) {
        setRegisterSuccessExternal(true)
      }
      setBirthDate('')
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setError(authErrorMessage(code))
    } finally {
      setSubmitting(false)
    }
  }

  const displayName =
    user?.displayName || user?.email?.split('@')[0] || 'Usuario'

  if (!loading && user && !profileLoading) {
    if (isAccountPending(userProfile)) {
      return <Navigate to="/cuenta-pendiente" replace />
    }
    if (isAccountRejected(userProfile)) {
      return <Navigate to="/cuenta-rechazada" replace />
    }
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden lg:flex-row">
      <section className="flex flex-1 flex-col overflow-y-auto bg-neutral-50 dark:bg-zinc-950 lg:w-1/2 lg:max-w-[50%]">
        <div className="flex flex-1 flex-col justify-center gap-8 px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
          <header>
            <img
              src="/logo-bacar.png"
              alt="Logo Bacar"
              className="mb-6 h-14 w-14 object-contain"
            />
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-primary">
              BacarNet
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-gray-100 sm:text-4xl">
              Simplificando tu trabajo diario
            </h1>
            <p className="mt-3 max-w-md text-base leading-relaxed text-neutral-600 dark:text-gray-400">
              Información del día, cumpleaños del mes y acceso seguro a las
              herramientas de la empresa.
            </p>
          </header>

          <DailyWidgets variant="minimal" />
          <BirthdayWidget variant="minimal" />
        </div>
      </section>

      <section className="auth-panel flex flex-1 flex-col lg:w-1/2 lg:max-w-[50%]">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          {loading || (user && profileLoading) ? (
            <div className="flex flex-col items-center gap-3 text-neutral-400">
              <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
              <p className="text-sm">Verificando sesión...</p>
            </div>
          ) : user ? (
            <div className="w-full max-w-sm text-center">
              <p className="mb-2 text-sm font-medium uppercase tracking-widest text-brand-primary">
                Sesión activa
              </p>
              <h2 className="mb-3 text-2xl font-bold text-white sm:text-3xl">
                ¡Hola, {displayName}!
              </h2>
              <p className="mb-8 text-sm leading-relaxed text-neutral-400">
                Tu cuenta está verificada. Accedé a comunicados, contactos,
                recursos y herramientas internas.
              </p>
              <Link
                to="/intranet"
                className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-4 text-base font-semibold"
              >
                Entrar a la Intranet
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          ) : (
            <div className="w-full max-w-sm">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white">Acceso</h2>
                <p className="mt-2 text-sm text-neutral-400">
                  Ingresá o registrate para acceder a la intranet.
                </p>
              </div>

              <div className="mb-6 flex rounded-lg auth-panel-elevated p-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login')
                    setError('')
                  }}
                  className={`flex-1 rounded-md py-2.5 text-sm font-medium transition-colors ${
                    activeTab === 'login'
                      ? 'bg-brand-primary text-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('register')
                    setError('')
                  }}
                  className={`flex-1 rounded-md py-2.5 text-sm font-medium transition-colors ${
                    activeTab === 'register'
                      ? 'bg-brand-primary text-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Registrarse
                </button>
              </div>

              {registerSuccessExternal && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Tu cuenta quedó registrada y está pendiente de aprobación por un administrador.
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-lg alert-error px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              {activeTab === 'login' ? (
                <>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={submitting}
                    className="mb-6 flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <GoogleIcon className="h-5 w-5" />
                    Continuar con Google
                  </button>

                  <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-neutral-700" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="auth-panel px-3 text-neutral-500">O</span>
                    </div>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label
                        htmlFor="login-email"
                        className="mb-1.5 block text-sm font-medium text-neutral-300"
                      >
                        Correo electrónico
                      </label>
                      <input
                        id="login-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 input-dark-focus focus:outline-none"
                        placeholder="usuario@empresa.com"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="login-password"
                        className="mb-1.5 block text-sm font-medium text-neutral-300"
                      >
                        Contraseña
                      </label>
                      <input
                        id="login-password"
                        type="password"
                        required
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 input-dark-focus focus:outline-none"
                        placeholder="••••••••"
                      />
                    </div>

                    <div className="mb-4 flex items-center gap-2">
                      <input
                        id="login-remember"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-brand dark:border-zinc-600 dark:bg-zinc-800"
                      />
                      <label
                        htmlFor="login-remember"
                        className="text-sm text-zinc-600 dark:text-zinc-400"
                      >
                        Recordarme en este equipo
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary w-full rounded-lg py-3 text-sm font-semibold"
                    >
                      {submitting ? 'Ingresando...' : 'Iniciar sesión'}
                    </button>
                  </form>
                </>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label
                      htmlFor="register-name"
                      className="mb-1.5 block text-sm font-medium text-neutral-300"
                    >
                      Nombre completo
                    </label>
                    <input
                      id="register-name"
                      type="text"
                      required
                      autoComplete="name"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 input-dark-focus focus:outline-none"
                      placeholder="Juan Pérez"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="register-birthdate"
                      className="mb-1.5 block text-sm font-medium text-neutral-300"
                    >
                      Fecha de nacimiento
                    </label>
                    <input
                      id="register-birthdate"
                      type="date"
                      required
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white [color-scheme:dark] input-dark-focus focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="register-email"
                      className="mb-1.5 block text-sm font-medium text-neutral-300"
                    >
                      Correo electrónico
                    </label>
                    <input
                      id="register-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 input-dark-focus focus:outline-none"
                      placeholder="usuario@empresa.com"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="register-password"
                      className="mb-1.5 block text-sm font-medium text-neutral-300"
                    >
                      Contraseña
                    </label>
                    <input
                      id="register-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      minLength={6}
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 input-dark-focus focus:outline-none"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="register-department"
                      className="mb-1.5 block text-sm font-medium text-neutral-300"
                    >
                      Departamento
                    </label>
                    <select
                      id="register-department"
                      required
                      value={registerDepartment}
                      onChange={(e) => setRegisterDepartment(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white input-dark-focus focus:outline-none"
                    >
                      {departments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-xs leading-relaxed text-neutral-500">
                    Emails fuera de @bacarsa.com.ar requieren aprobación manual antes de ingresar.
                  </p>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary w-full rounded-lg py-3 text-sm font-semibold"
                  >
                    {submitting ? 'Creando cuenta...' : 'Registrarse'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
