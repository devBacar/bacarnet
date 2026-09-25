import {
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { auth } from '../services/firebase'
import {
  buildDesignatedSuperAdminProfile,
  ensureGoogleUserProfile,
  ensureSuperAdminPermissions,
  getUserProfile,
  isSuperAdminEmail,
  type UserProfile,
} from '../services/userService'
import { applyPendingUserSetupAfterRegister } from '../services/usersApi'

interface AuthContextValue {
  user: User | null
  userProfile: UserProfile | null
  loading: boolean
  profileLoading: boolean
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  loginWithGoogle: (rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  const loadProfile = useCallback(async (uid: string, email?: string | null) => {
    setProfileLoading(true)
    try {
      await ensureSuperAdminPermissions(uid, email).catch((err) => {
        console.warn('bootstrap-profile (no bloquea carga de perfil):', err)
      })
      const profile = await getUserProfile(uid, email)
      setUserProfile(profile)
    } catch (err) {
      console.error('Error al cargar el perfil de usuario:', err)
      if (email && isSuperAdminEmail(email)) {
        console.warn(
          '[staging] Perfil API falló; usando super_admin local hasta que Functions responda.',
        )
        setUserProfile(buildDesignatedSuperAdminProfile(uid, email))
      } else {
        setUserProfile(null)
      }
    } finally {
      setProfileLoading(false)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    await loadProfile(user.uid, user.email)
  }, [user, loadProfile])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)

      if (currentUser) {
        await loadProfile(currentUser.uid, currentUser.email)
      } else {
        setUserProfile(null)
        setProfileLoading(false)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [loadProfile])

  const login = async (email: string, password: string, rememberMe = true) => {
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence,
    )
    await signInWithEmailAndPassword(auth, email, password)
  }

  /** Login Firebase con Google (cuenta Bacarnet). Gmail/Calendar del Home usan OAuth backend aparte. */
  const loginWithGoogle = async (rememberMe = true) => {
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence,
    )
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)

    const created = await ensureGoogleUserProfile(result.user)
    if (created) {
      try {
        await applyPendingUserSetupAfterRegister()
      } catch (err) {
        console.error('No se pudo aplicar la configuración pendiente:', err)
      }
    }
    await loadProfile(result.user.uid, result.user.email)
  }

  const logout = async () => {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        profileLoading,
        login,
        loginWithGoogle,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
